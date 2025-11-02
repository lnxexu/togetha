#!/usr/bin/env sh
set -euo pipefail

# Optional: run migrations at startup if requested
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "==> Applying database migrations"
  # Fail fast if migrations cannot be applied, so the container doesn't run in a bad state
  python manage.py migrate --noinput
fi

# Optional: collect static at startup; safe if already collected at build
if [ "${COLLECTSTATIC:-0}" = "1" ]; then
  echo "==> Collecting static files"
  python manage.py collectstatic --noinput
fi

ROLE=${ROLE:-web}
PORT=${PORT:-8000}

case "$ROLE" in
  web)
    echo "==> Starting Gunicorn (web) on 0.0.0.0:${PORT}"
    exec gunicorn server.wsgi:application \
      --workers ${WEB_CONCURRENCY:-3} \
      --bind 0.0.0.0:${PORT}
    ;;
  worker)
    echo "==> Starting Celery worker"
    exec celery -A server worker --loglevel=info
    ;;
  beat)
    echo "==> Starting Celery beat"
    exec celery -A server beat --loglevel=info
    ;;
  *)
    echo "Unknown ROLE: $ROLE (expected web|worker|beat)" >&2
    exit 1
    ;;
fi
