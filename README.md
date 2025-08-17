# Togetha Project Setup

## Overview
This project consists of a React Native frontend (using Expo) and a Django backend with Celery for background task processing.

---

## Frontend Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Expo CLI

### Installation
1. Navigate to the Frontend directory:
   ```bash
   cd Frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npx expo start
   ```

4. Choose your platform:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app for physical device

---

## Backend Setup

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- Redis (for Celery broker)

### Virtual Environment Setup

1. Open Command Prompt as Administrator
2. Navigate to the project directory:
   ```bash
   cd Backend
   ```

3. Create virtual environment:
   ```bash
   python -m venv venv
   ```

4. Set execution policy (Windows):
   ```bash
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

5. Activate virtual environment:
   ```bash
   venv\Scripts\Activate
   ```

### Backend Installation

1. Upgrade pip:
   ```bash
   pip install --upgrade pip
   ```

2. Install required packages:
   ```bash
   pip install django
   pip install djangorestframework
   pip install django-cors-headers
   pip install celery
   pip install redis
   pip install django-celery-beat
   pip install django-celery-results
   pip install pillow
   pip install python-decouple
   ```

3. Navigate to server directory:
   ```bash
   cd server
   ```

4. Run migrations:
   ```bash
   python manage.py migrate
   ```

5. Create superuser (optional):
   ```bash
   python manage.py createsuperuser
   ```

6. Start Django server:
   ```bash
   python manage.py runserver
   ```

---

## Celery Setup and Activation

### What is Celery?
Celery is a distributed task queue that allows you to run background tasks asynchronously. In this project, it's used for:
- Sending scheduled notifications
- Processing background tasks
- Handling periodic tasks

### Redis Installation (Celery Broker)

#### Windows:
1. Download Redis from: https://github.com/microsoftarchive/redis/releases
2. Install and start Redis service
3. Verify installation:
   ```bash
   redis-cli ping
   ```
   Should return `PONG`

#### macOS:
```bash
brew install redis
brew services start redis
```

#### Linux (Ubuntu):
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

### Celery Configuration

The project already includes Celery configuration in `Backend/server/celery.py`. The key settings are:

```python
# Backend/server/celery.py
from celery import Celery
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

app = Celery('server')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

### Starting Celery Services

You need to run **3 separate terminals** for the complete backend:

#### Terminal 1: Django Server
```bash
venv\Scripts\Activate
cd Backend
python manage.py runserver 0.0.0.0:8000
```

#### Terminal 2: Celery Worker
```bash
cd Backend
venv\Scripts\Activate
cd Backend
celery -A server worker --loglevel=info --pool=solo
```

#### Terminal 3: Celery Beat (Scheduler)
```bash
venv\Scripts\Activate
cd Backend
celery -A server beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### Celery Commands Explained

- **Celery Worker**: Processes background tasks
- **Celery Beat**: Scheduler that triggers periodic tasks
- **Django Server**: Handles API requests

### Monitoring Celery (Optional)

Install Flower for web-based monitoring:
```bash
pip install flower
```

Start Flower:
```bash
celery -A server flower
```
Access at: http://localhost:5555

---

## Database Management

### SQLite Browser Setup
1. Download DB Browser: https://sqlitebrowser.org/dl/
2. Open the application
3. Click "Open Database"
4. Navigate to: `Backend/db.sqlite3`
5. View and manage your database tables

### Django Admin Panel
1. Create superuser: `python manage.py createsuperuser`
2. Access admin at: http://localhost:8000/admin/

---

## Environment Variables

Create a `.env` file in `Backend/server/`:

```env
# Backend/server/.env
DEBUG=True
SECRET_KEY=your-secret-key-here
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

---

## Project Structure

```
Togetha/
├── Frontend/                 # React Native (Expo) app
│   ├── app/                 # Main app screens
│   ├── components/          # Reusable components
│   └── assets/             # Images, fonts, icons
└── Backend/                # Django REST API
    ├── server/             # Main Django settings
    ├── task_manager/       # Task management app
    ├── users/              # User management app
    ├── notifications/      # Notification system
    ├── chatbot/           # AI chatbot functionality
    └── scheduler/         # Celery task scheduling
```

---

## Common Issues and Solutions

### Celery Worker Not Starting
- Ensure Redis is running: `redis-cli ping`
- Check if port 6379 is available
- Verify virtual environment is activated

### Database Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### CORS Issues
The project includes `django-cors-headers` for handling cross-origin requests between frontend and backend.

### Port Conflicts
- Django: http://localhost:8000
- Expo: http://localhost:8081
- Redis: localhost:6379
- Flower: http://localhost:5555

---

## Development Workflow

1. Start Redis server
2. Activate virtual environment
3. Start Django server (Terminal 1)
4. Start Celery worker (Terminal 2)
5. Start Celery beat (Terminal 3)
6. Start Frontend development server
7. Begin development!

---

## Deployment Notes

For production deployment:
- Use PostgreSQL instead of SQLite
- Use environment variables for sensitive data
- Configure proper Redis instance
- Use process managers like Supervisor for Celery
- Set up proper logging and monitoring

---

## Support

If you encounter issues:
1. Check if all services are running
2. Verify virtual environment is activated
3. Ensure Redis is accessible
4. Check Django logs for errors
5. Monitor Celery worker logs

Happy coding! 🚀