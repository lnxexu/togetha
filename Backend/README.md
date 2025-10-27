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
- **Database**: PostgreSQL (production), SQLite (dev)
- **Cache**: Redis
- **Task Queue**: Celery + Redis
- **WSGI Server**: Gunicorn
- **Static Files**: WhiteNoise
- **AI/ML**: Sentence Transformers, FAISS, Torch

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
- `OLLAMA_TIMEOUT` - AI model timeout (default: 300)

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
Uses PostgreSQL by default (see settings.py)

### Production
- Uses Render PostgreSQL
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