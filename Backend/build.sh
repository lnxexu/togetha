#!/usr/bin/env bash
# exit on error
set -o errexit

# Install system dependencies for OCR functionality
apt-get update && apt-get install -y tesseract-ocr

pip install -r requirements.txt

python manage.py collectstatic --no-input
# Migrations are deferred to runtime/startup to ensure database credentials
# provided by the host (e.g., Railway) are available. Running migrations at
# build time can fail if the platform doesn't expose DATABASE_URL during build.
