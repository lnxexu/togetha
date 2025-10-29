# Multi-stage not strictly required here; keep it simple and fast
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies (tesseract for OCR, libpq for Postgres)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr \
       libpq-dev \
       build-essential \
    && rm -rf /var/lib/apt/lists/*

FROM postgres:17

RUN apt-get update && \
    apt-get install -y postgresql-17-pgvector && \
    rm -rf /var/lib/apt/lists/*    
WORKDIR /app

# Install Python dependencies first (leverage Docker layer caching)
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy app code
COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Collect static files at build time (no DB connection required)
# Uses default insecure SECRET_KEY in settings if none provided during build
RUN python manage.py collectstatic --noinput || true

# Default PORT for local runs; Railway sets $PORT automatically
ENV PORT=8000

# One image supports Web, Worker, Beat based on ROLE env var
# ROLE=web|worker|beat
CMD ["/app/entrypoint.sh"]
# PostgreSQL 16 with pgvector preinstalled
# ✅ PostgreSQL with pgvector (latest stable)
