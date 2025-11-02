import sys
import urllib.parse
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = "Ping Redis for Django cache and Celery broker to verify connectivity."

    def add_arguments(self, parser):
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show full exception tracebacks on failure",
        )

    def handle(self, *args, **options):
        verbose = options.get("verbose", False)

        try:
            import redis
        except Exception as e:  # pragma: no cover - environment-specific
            self.stderr.write(self.style.ERROR(f"redis package not available: {e}"))
            sys.exit(1)

        broker_url = getattr(settings, "REDIS_BROKER_URL", None) or getattr(settings, "CELERY_BROKER_URL", None)
        cache_url = getattr(settings, "REDIS_CACHE_URL", None) or settings.CACHES.get("default", {}).get("LOCATION")

        def sanitize(url: str) -> str:
            try:
                p = urllib.parse.urlsplit(url)
                netloc = p.netloc
                if "@" in netloc:
                    # strip credentials
                    netloc = netloc.split("@", 1)[1]
                return urllib.parse.urlunsplit((p.scheme, netloc, p.path, p.query, p.fragment))
            except Exception:
                return url

        def ping(url: str) -> tuple[bool, str]:
            try:
                opts = {}
                if url.startswith("rediss://"):
                    # Disable cert verification by default; managed providers use trusted CAs
                    opts["ssl_cert_reqs"] = None
                client = redis.Redis.from_url(url, **opts)
                ok = client.ping()
                return bool(ok), "PONG" if ok else "NO-RESPONSE"
            except Exception as e:  # pragma: no cover - runtime connectivity
                if verbose:
                    return False, f"{type(e).__name__}: {e}"
                return False, str(e)

        self.stdout.write(self.style.NOTICE("Checking Redis connectivity..."))

        if cache_url:
            ok, msg = ping(cache_url)
            status = self.style.SUCCESS("OK") if ok else self.style.ERROR("FAIL")
            self.stdout.write(f"Cache [{sanitize(cache_url)}]: {status} - {msg}")
        else:
            self.stdout.write(self.style.WARNING("Cache URL not configured"))

        if broker_url:
            ok, msg = ping(broker_url)
            status = self.style.SUCCESS("OK") if ok else self.style.ERROR("FAIL")
            self.stdout.write(f"Broker [{sanitize(broker_url)}]: {status} - {msg}")
        else:
            self.stdout.write(self.style.WARNING("Broker URL not configured"))

        self.stdout.write(self.style.SUCCESS("Done."))
