# Deploying the Backend to Railway

This guide deploys the Django + DRF app with Celery worker and Celery beat to Railway, using Postgres and Redis. OCR is enabled by installing Tesseract via Nixpacks.

## 1) Prerequisites

- A Railway account and project.
- This repo connected to Railway with the `Backend/` as the root for your service.
- Add managed services in Railway:
  - PostgreSQL (for your main DB)
  - Redis (for Celery broker and results)

## 2) System packages (Tesseract)

pytesseract requires the Tesseract binary at runtime. This repo contains `nixpacks.toml` which installs it automatically:

```toml
[phases.setup]
nixPkgs = ["tesseract"]
```

You don’t need to change code paths: the code only sets a Windows path override when running on Windows.

## 3) Services layout in Railway

Create three services from the same repo (or use Railway Deploy Templates):

- Web (Django + Gunicorn)
- Worker (Celery worker)
- Beat (Celery beat scheduler)

Railway will detect `nixpacks.toml`. You can pick which process each service should run from the defined processes:

```toml
[processes]
web = "gunicorn server.wsgi:application --workers 3 --bind 0.0.0.0:$PORT"
worker = "celery -A server worker --loglevel=info"
beat = "celery -A server beat --loglevel=info"
```

## 4) Environment variables (all services)

Set these in Railway → Variables for each service (web, worker, beat):

- Core
  - SECRET_KEY = <strong random value>
  - DEBUG = False
  - ALLOWED_HOSTS = your-domain.up.railway.app,your-custom-domain.com
  - CSRF_TRUSTED_ORIGINS = https://your-domain.up.railway.app,https://your-custom-domain.com
  - CORS_ALLOWED_ORIGINS = https://your-frontend-domain
- Database & cache/broker
  - DATABASE_URL = (from Railway Postgres service)
  - REDIS_URL = (from Railway Redis service)
- Email (if used)
  - EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
- RAG/Embeddings
  - GEMINI_API_KEY (required)
  - GEMINI_MODEL (optional, defaults in settings)
  - EMBEDDING_MODEL (optional, defaults in settings)
- Python version (optional, already set via runtime.txt and nixpacks.toml)
  - PYTHON_VERSION = 3.11.0

## 5) Build & start commands

`nixpacks.toml` includes install and build steps:

```toml
[phases.install]
cmds = [
  "pip install --upgrade pip",
  "pip install -r requirements.txt"
]

[phases.build]
cmds = [
  "python manage.py collectstatic --noinput",
  "python manage.py migrate"
]
```

For each Railway service, choose the corresponding process:
- Web → `web`
- Worker → `worker`
- Beat → `beat`

Alternatively, you can override the start command per service in Railway’s UI.

## 6) Static and media files

- Static: Collected by `collectstatic` and served by WhiteNoise (already configured in `server/settings.py`).
- Media: Railway disk is ephemeral. For uploads, consider S3 or another persistent object store in production.

## 7) Verifications

After deployment:
- Web logs: Confirm Gunicorn starts and Django loads.
- Worker logs: Confirm Celery connects to Redis and finds tasks.
- Beat logs: Confirm schedules are registered (e.g., `check_due_tasks` entries).

## 8) Notes & tips

- Debug Toolbar: Consider disabling in production or gating by IP/DEBUG flag.
- RAG vector search: The RAG pipeline stores embeddings in Postgres using pgvector (see `chatbot/models.py -> DocumentChunk`). Ensure your Railway Postgres has the `pgvector` extension enabled; the included migrations will attempt to create it automatically.
- Migrations: Keeping `migrate` in the build step works fine; you can also run it manually if you prefer controlled rollouts.
