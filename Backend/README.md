# Togetha Backend

Django REST API backend for the Togetha application.

## 🚀 Quick Start

### Local Development

1. **Clone and Navigate**
   ```bash
   cd Backend
   ```

2. **Create Virtual Environment**
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set Up Environment Variables**
   - Copy `.env.example` to `.env`
   - Update with your local settings

5. **Run Migrations**
   ```bash
   python manage.py migrate
   ```

6. **Create Superuser**
   ```bash
   python manage.py createsuperuser
   ```

7. **Run Development Server**
   ```bash
   python manage.py runserver
   ```

8. **Run Celery (Optional - in separate terminals)**
### Local Postgres (pgvector) via Docker

You can spin up a local Postgres with the pgvector extension (plus Redis) using Docker Compose:

1. Start services
   - Ensure Docker Desktop is running
   - From `Backend/`: `docker compose up -d`
2. Configure your `.env`
   - `DATABASE_URL=postgres://Togetha:lol@localhost:5433/Togetha`
   - `REDIS_URL=redis://localhost:6379/1`
3. Run migrations and start the backend as usual

Alternatively on Windows PowerShell, you can use the helper script:

- `scripts/start_postgres_docker.ps1` (starts the same pgvector image on port 5433)

   ```bash
   # Worker
   celery -A server worker --loglevel=info --pool=solo

   # Beat (scheduled tasks)
   celery -A server beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
   ```

## 📦 Deployment to Render.com

### Quick Deploy
See **[DEPLOYMENT.md](DEPLOYMENT.md)** for comprehensive deployment guide.

### Checklist
See **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** for step-by-step checklist.

### Key Files
- `build.sh` - Build script for Render
- `Procfile` - Process definitions
- `render.yaml` - Infrastructure as code
- `runtime.txt` - Python version specification
- `.env.production` - Production environment template

## 🏗️ Project Structure

```
Backend/
├── chatbot/              # Chatbot and RAG functionality
├── logs/                 # Logging system
├── notes/                # Notes management
├── notifications/        # Notification system
├── scheduler/            # Task scheduling with Celery
├── server/               # Main Django settings and config
├── task_manager/         # Task management
├── usage_tracking/       # Usage analytics
├── users/                # User authentication and profiles
├── media/                # User uploads (use S3 in production)
├── templates/            # Django templates
├── manage.py             # Django management script
├── requirements.txt      # Python dependencies
└── build.sh              # Render build script
```

## ⚙️ Technologies

- **Framework**: Django 5.2.6
- **API**: Django REST Framework 3.16.1
- **Database**: PostgreSQL (dev and production)
- **Cache**: Redis
- **Task Queue**: Celery + Redis
- **WSGI Server**: Gunicorn
- **Static Files**: WhiteNoise
- **AI/ML**: Google Generative AI (Gemini) for embeddings; pgvector on Postgres for vector search

## 🔧 Configuration

### Environment Variables

#### Required
- `SECRET_KEY` - Django secret key
- `DEBUG` - Debug mode (True/False)
- `DATABASE_URL` - Database connection string
- `REDIS_URL` - Redis connection string
- `ALLOWED_HOSTS` - Comma-separated allowed hosts

#### Optional
- `CSRF_TRUSTED_ORIGINS` - Trusted origins for CSRF
- `CORS_ALLOWED_ORIGINS` - Allowed CORS origins
- `EMAIL_HOST_USER` - Email username
- `EMAIL_HOST_PASSWORD` - Email password
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Google Generative AI API key
- `GEMINI_MODEL` - Gemini model name (default: `gemini-1.5-flash`)
- `OLLAMA_TIMEOUT` - AI model timeout (legacy, not used when Gemini is enabled)

## 📝 API Documentation

### Authentication
- Token-based authentication
- Session authentication for admin

### Main Endpoints
- `/admin/` - Django admin interface
- `/api/users/` - User management
- `/api/chatbot/` - Chatbot interactions
- `/api/notes/` - Notes CRUD
- `/api/tasks/` - Task management
- `/api/notifications/` - Notifications

## 🧪 Testing

```bash
python manage.py test
```

## 📊 Database

### Local Development
Uses PostgreSQL by default (see `server/settings.py`)

### Production
- Uses managed PostgreSQL
- Configured via `DATABASE_URL` environment variable
- Migrations run automatically during deployment

## 🔐 Security

### Production Settings
- `DEBUG=False`
- Secure `SECRET_KEY`
- HTTPS enforced (automatic on Render)
- CSRF protection enabled
- CORS configured for trusted domains only

### Best Practices
- Never commit `.env` files
- Use environment variables for secrets
- Regular security updates
- Monitor access logs

## ⚠️ Important Notes

### Media Files
- Local file storage NOT persistent on Render
- Use AWS S3 or Cloudinary for production
- Configure in Django settings

### Celery Workers
- Required for background tasks
- Deploy separately on Render
- Needs Redis connection

### Database Migrations
- Run automatically during deployment
- Manual migration: `python manage.py migrate`
- Check status: `python manage.py showmigrations`

## 🐛 Troubleshooting

### Common Issues

**Import Error: dj_database_url**
```bash
pip install dj-database-url
```

**Static Files Not Loading**
```bash
python manage.py collectstatic --noinput
```

**Database Connection Error**
- Check `DATABASE_URL` format
- Verify database is running
- Check network connectivity

**Redis Connection Error**
- Ensure Redis is running
- Check `REDIS_URL` configuration
- Verify Redis service is accessible

### Email Delivery on Railway (SendGrid)

This project is configured to use SendGrid SMTP by default and will automatically try common SendGrid ports (587 TLS, 465 SSL). On some hosts, outbound SMTP can be restricted. To make email verification robust on Railway:

- Set the following variables in Railway → Variables:
   - `SENDGRID_API_KEY` — your SendGrid API key
   - `EMAIL_HOST` = `smtp.sendgrid.net`
   - `EMAIL_PORT` = `587`
   - `EMAIL_USE_TLS` = `True`
   - `EMAIL_USE_SSL` = `False`
   - `EMAIL_HOST_USER` = `apikey` (literally this word)
   - `EMAIL_FROM` or `DEFAULT_FROM_EMAIL` — a verified sender in SendGrid

- The backend will attempt SMTP first. If SMTP fails (e.g., due to egress/port restrictions), it will automatically fall back to the SendGrid Web API over HTTPS using `SENDGRID_API_KEY`.
   - You can force API-first sending by setting `EMAIL_PREFER_SENDGRID_API=True` in Railway variables.
   - To avoid waiting on SMTPS:465 timeouts, set `EMAIL_SMTP_TRY_SSL=False`.

- Never commit your real API keys. Ensure `.env` is not checked in and set secrets only in Railway.

- If you use the optional SendGrid Event Webhook, add `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` and expose `POST /users/sendgrid/webhook/` from your app.

#### SMTP Connectivity Health Check

Run an on-platform SMTP probe similar to the bash snippet you provided:

```bash
python manage.py check_smtp --host smtp.sendgrid.net --ports 25 465 587 2525 --timeout 3 --starttls
```

This will print reachability and attempt TLS/STARTTLS handshakes, which is more reliable than plain TCP checks.

#### Domain + DNS for Reliable Delivery

To maximize deliverability and satisfy SendGrid requirements:

1. Verify a sender domain in SendGrid (recommended) or a Single Sender (temporary/testing).
2. Add the DNS records SendGrid provides for your domain:
   - SPF: `TXT @  v=spf1 include:sendgrid.net ~all`
   - DKIM: three `CNAME` records as instructed in SendGrid
   - Return-Path: optional `CNAME` for bounce handling
   - DMARC (recommended): `TXT _dmarc  v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain.com`
3. Use a From address on the verified domain, e.g. `no-reply@your-domain.com`.

Notes when using Railway for your web app domain:
- Root/apex domains usually need ALIAS/ANAME or CNAME flattening at your DNS provider.
- Subdomains and wildcards cannot overlap unless managed by the same service.
- Railway issues and renews TLS certs (90-day certs, renewed automatically); issuance typically completes within an hour.
- SNI is required for HTTPS certificate matching; browsers/clients handle this automatically. SMTP does not use SNI.

Security reminders:
- Never commit real API keys to git. `.env` is already ignored, but rotate any exposed keys immediately in SendGrid.
- Ensure `DEFAULT_FROM_EMAIL`/`EMAIL_FROM` matches a verified sender identity in SendGrid.

## 📚 Documentation

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Celery Documentation](https://docs.celeryproject.org/)
- [Render Documentation](https://render.com/docs)

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit pull request

## 📄 License

[Your License Here]

## 📧 Support

For deployment issues, see:
- `DEPLOYMENT.md` - Full deployment guide
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step checklist

For code issues:
- Check application logs
- Review Django documentation
- Contact development team