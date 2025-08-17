(venv) C:\Users\loren\OneDrive\Documents\Togetha\Backend>celery -A server worker --loglevel=info --pool=solo

(venv) C:\Users\loren\OneDrive\Documents\Togetha\Backend>celery -A server beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler