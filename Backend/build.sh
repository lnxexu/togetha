#!/usr/bin/env bash
# exit on error
set -o errexit

# Install system dependencies for OCR functionality
apt-get update && apt-get install -y tesseract-ocr

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --noinput
