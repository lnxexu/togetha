import socket
import ssl
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Check TCP reachability and optional TLS handshake to an SMTP server across common ports.\n"
        "Examples:\n"
        "  python manage.py check_smtp                 # defaults to smtp.sendgrid.net ports 25,465,587,2525\n"
        "  python manage.py check_smtp --host smtp.sendgrid.net --ports 587 465 --timeout 3 --starttls\n"
    )

    def add_arguments(self, parser):
        parser.add_argument("--host", default="smtp.sendgrid.net", help="SMTP host to test")
        parser.add_argument(
            "--ports",
            nargs="*",
            type=int,
            default=[25, 465, 587, 2525],
            help="List of ports to test",
        )
        parser.add_argument("--timeout", type=float, default=3.0, help="Socket timeout in seconds")
        parser.add_argument(
            "--starttls",
            action="store_true",
            help="On port 587 (or 25/2525), attempt EHLO + STARTTLS handshake to verify TLS support.",
        )

    def handle(self, *args, **options):
        host = options["host"]
        ports = options["ports"]
        timeout = options["timeout"]
        do_starttls = options["starttls"]

        self.stdout.write(self.style.NOTICE(f"Testing SMTP connectivity to {host} ..."))

        for port in ports:
            try:
                # First, basic TCP reachability
                with socket.create_connection((host, port), timeout=timeout) as sock:
                    self.stdout.write(f"{host} port {port} reachable")

                    # If implicit TLS (465), attempt TLS handshake
                    if port == 465:
                        try:
                            context = ssl.create_default_context()
                            with context.wrap_socket(sock, server_hostname=host) as tls_sock:
                                # If we reached here, handshake succeeded
                                cipher = tls_sock.cipher()
                                self.stdout.write(
                                    self.style.SUCCESS(
                                        f"  TLS handshake successful on 465 | cipher={cipher[0]} ({cipher[1]}/{cipher[2]})"
                                    )
                                )
                        except Exception as e:  # pragma: no cover - depends on environment
                            self.stdout.write(
                                self.style.WARNING(f"  TLS handshake failed on 465: {e}")
                            )

                    # STARTTLS probe on submission-like ports, if requested
                    if do_starttls and port in (25, 587, 2525):
                        try:
                            sock_file = sock.makefile("rwb", buffering=0)

                            def _read_line():
                                line = sock_file.readline()
                                return line.decode("utf-8", errors="replace").strip()

                            def _send(cmd: str):
                                sock_file.write((cmd + "\r\n").encode("ascii"))

                            # Read banner
                            _ = _read_line()
                            # Say EHLO
                            _send("EHLO togetha.local")
                            # Read multi-line response (consume a few lines defensively)
                            for _ in range(5):
                                line = _read_line()
                                # Stop if it's not a continuation like '250-...'
                                if not line.startswith("250-"):
                                    break
                            # Request STARTTLS
                            _send("STARTTLS")
                            resp = _read_line()
                            if not resp.startswith("220"):
                                self.stdout.write(self.style.WARNING(f"  STARTTLS not accepted: {resp}"))
                            else:
                                # Negotiate TLS
                                context = ssl.create_default_context()
                                tls_sock = context.wrap_socket(sock, server_hostname=host)
                                cipher = tls_sock.cipher()
                                self.stdout.write(
                                    self.style.SUCCESS(
                                        f"  STARTTLS successful | cipher={cipher[0]} ({cipher[1]}/{cipher[2]})"
                                    )
                                )
                                # Close gracefully
                                try:
                                    tls_file = tls_sock.makefile("rwb", buffering=0)
                                    tls_file.write(b"QUIT\r\n")
                                except Exception:
                                    pass
                        except Exception as e:  # pragma: no cover - network env dependent
                            self.stdout.write(self.style.WARNING(f"  STARTTLS probe failed: {e}"))

            except (socket.timeout, OSError, ssl.SSLError) as e:
                self.stdout.write(f"{host} port {port} unreachable ({e})")

        self.stdout.write(self.style.SUCCESS("SMTP connectivity check complete."))
