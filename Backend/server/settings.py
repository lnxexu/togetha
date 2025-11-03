import os
import logging
import random
import urllib.parse
from decouple import config, Csv
import dj_database_url
from dotenv import load_dotenv
from pathlib import Path


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BASE_DIR / '.env')

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# PRODUCTION SETTINGS - Read from environment variables
SECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-dev-key")
DEBUG = os.environ.get("DEBUG", "False") == "True"

# DEVELOPMENT SETTINGS - Commented out for production
# Load from environment variable, fallback to insecure default for development only
# SECRET_KEY = config('SECRET_KEY', default='django-insecure-+^2p59aom-1u1r7%z0pg_vi4wg^y%10swf-=1!rpp!q6sr)q0p')

# Debug mode: enable serving of media/static files in development by default.
# Use environment variable DEBUG to override in non-development environments.
# DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,192.168.0.153,192.168.1.187,192.168.15.50,172.16.3.152,172.23.176.1,togetha-production-2546.up.railway.app', cast=Csv())

"""
Email configuration

Goal: Prefer SendGrid SMTP using credentials from env, with graceful fallback.
Essentials (env):
    - SENDGRID_API_KEY
    - EMAIL_FROM (sender address)
Optional overrides:
    - EMAIL_HOST, EMAIL_PORT, EMAIL_USE_TLS/SSL, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
"""

# Core credentials
# For SendGrid SMTP, username must literally be 'apikey' and the password is the API key.
SENDGRID_API_KEY = config('SENDGRID_API_KEY', default=None)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='apikey' if SENDGRID_API_KEY else None)
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default=SENDGRID_API_KEY)

# From address
DEFAULT_FROM_EMAIL = (
    config('EMAIL_FROM', default=None)
    or config('DEFAULT_FROM_EMAIL', default=None)
    or EMAIL_HOST_USER
)

# Use custom backend that can try multiple ports; we'll seed it with SendGrid defaults
EMAIL_BACKEND = 'server.email_backend.FallbackSMTPBackend'

# Primary SMTP configuration (can be overridden by env)
# Defaults to SendGrid SMTP if SENDGRID_API_KEY is present; otherwise falls back to Gmail-like defaults
EMAIL_HOST = config('EMAIL_HOST', default='smtp.sendgrid.net' if SENDGRID_API_KEY else 'smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587 if SENDGRID_API_KEY else 465, cast=int)
EMAIL_USE_SSL = config('EMAIL_USE_SSL', default=False if SENDGRID_API_KEY else True, cast=bool)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True if SENDGRID_API_KEY else False, cast=bool)
EMAIL_TIMEOUT = 60
EMAIL_USE_LOCALTIME = False

# Prefer SendGrid Web API (HTTPS) over SMTP to avoid blocked SMTP ports in some hosts
EMAIL_PREFER_SENDGRID_API = config('EMAIL_PREFER_SENDGRID_API', default=False, cast=bool)
# Control whether the custom SMTP backend should also try SMTPS:465 after 587
EMAIL_SMTP_TRY_SSL = config('EMAIL_SMTP_TRY_SSL', default=True, cast=bool)

# from decouple import Csv  # already imported above

# Debug/ops: optionally log verification codes to backend logs (disabled by default)
# Enable by setting LOG_VERIFICATION_CODES=True in the environment for non-DEBUG environments.
LOG_VERIFICATION_CODES = config('LOG_VERIFICATION_CODES', default=False, cast=bool)

# Gemini / Embeddings configuration
# Do NOT provide a hardcoded default for API keys. Require environment or .env to supply it.
GEMINI_API_KEY = config('GEMINI_API_KEY', default=None)
GEMINI_MODEL = config('GEMINI_MODEL', default='gemini-2.5-flash')
EMBEDDING_MODEL = config('EMBEDDING_MODEL', default='gemini-embedding-001')

# Ordered model candidates for graceful fallback
GEMINI_MODEL_CANDIDATES = config('GEMINI_MODEL_CANDIDATES', default='', cast=Csv())
if not GEMINI_MODEL_CANDIDATES:
    GEMINI_MODEL_CANDIDATES = [
        GEMINI_MODEL,
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite-preview',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ]

EMBEDDING_MODEL_CANDIDATES = config('EMBEDDING_MODEL_CANDIDATES', default='', cast=Csv())
if not EMBEDDING_MODEL_CANDIDATES:
    EMBEDDING_MODEL_CANDIDATES = [
        EMBEDDING_MODEL,
        'text-embedding-004',
        'text-embedding-004',
    ]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'pgvector.django',
    'django_celery_beat', 
    'rest_framework',
    'rest_framework.authtoken', 
    'corsheaders',
    'notes',
    'chatbot',
    'task_manager',
    'notifications',
    'users',
    'logs',
    'scheduler',
    'usage_tracking',
]

# Enable Django Debug Toolbar only in development
if DEBUG:
    INSTALLED_APPS.append('debug_toolbar')


MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # WhiteNoise for static files in production
    'django.contrib.sessions.middleware.SessionMiddleware',
    'server.middleware.ClientTimezoneMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'server.middleware.UserActivityMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Opt-in developer middlewares (CSRF exemption and debug auth) — disabled in production
ENABLE_DEV_MIDDLEWARE = os.environ.get('ENABLE_DEV_MIDDLEWARE', 'False') == 'True'
if DEBUG or ENABLE_DEV_MIDDLEWARE:
    # Ensure CSRF exemption runs before the CsrfViewMiddleware
    try:
        _csrf_index = MIDDLEWARE.index('django.middleware.csrf.CsrfViewMiddleware')
        MIDDLEWARE.insert(_csrf_index, 'server.middleware.CSRFExemptAPIMiddleware')
    except ValueError:
        MIDDLEWARE.append('server.middleware.CSRFExemptAPIMiddleware')

    # Place DebugAuth just after AuthenticationMiddleware
    try:
        _auth_index = MIDDLEWARE.index('django.contrib.auth.middleware.AuthenticationMiddleware')
        MIDDLEWARE.insert(_auth_index + 1, 'server.middleware.DebugAuthMiddleware')
    except ValueError:
        MIDDLEWARE.append('server.middleware.DebugAuthMiddleware')

# Enable Debug Toolbar middleware only when DEBUG is true
if DEBUG:
    MIDDLEWARE.append('debug_toolbar.middleware.DebugToolbarMiddleware')

CSRF_USE_SESSIONS = False  
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'  
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:8000,http://192.168.0.153:8000,http://172.23.176.1:8000',
    cast=Csv()
)

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS', 
    default='http://localhost:3000,http://127.0.0.1:3000,http://192.168.0.153:3000',
    cast=Csv()
)
CORS_ALLOW_ALL_ORIGINS = False  # Disabled for security in production
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'Authorization', 
]

ROOT_URLCONF = 'server.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'server.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

# PRODUCTION DATABASE - prefer a database URL if provided by the host (DATABASE_URL, RAILWAY, etc.)
database_url = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("RAILWAY_DATABASE_URL")
    or os.environ.get("RAILWAY_POSTGRESQL_URI")
    or os.environ.get("RAILWAY_POSTGRESQL_URL")
    or os.environ.get("POSTGRES_URL")
)

if database_url:
    DATABASES = {
        "default": dj_database_url.parse(database_url, conn_max_age=600)
    }
else:
    # Some hosts provide individual PG_* env vars instead of a single DATABASE_URL
    if os.environ.get('PGHOST') and os.environ.get('PGDATABASE'):
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': os.environ.get('PGDATABASE'),
                'USER': os.environ.get('PGUSER', ''),
                'PASSWORD': os.environ.get('PGPASSWORD', ''),
                'HOST': os.environ.get('PGHOST', 'localhost'),
                'PORT': os.environ.get('PGPORT', '5432'),
            }
        }
    else:
        # DEVELOPMENT DATABASE - Fallback for local development
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': 'togetha',
                'USER': 'postgres',
                'PASSWORD': 'Kobe@1314',  # Only for local dev
                'HOST': 'localhost',
                'PORT': '5432',
            }
        }


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# REDIS configuration
# Prefer split URLs for cache vs broker; support Railway-style variables and TLS (rediss://)

# Gather possible env inputs (Railway may expose multiple names)
_env_redis_public_url = os.environ.get('REDIS_PUBLIC_URL') or os.environ.get('REDIS_URL')
_env_redis_cache_url = os.environ.get('REDIS_CACHE_URL')
_env_redis_broker_url = os.environ.get('REDIS_BROKER_URL')
_env_redis_host = os.environ.get('REDISHOST') or os.environ.get('REDIS_HOST')
_env_redis_port = os.environ.get('REDISPORT') or os.environ.get('REDIS_PORT')
_env_redis_password = os.environ.get('REDISPASSWORD') or os.environ.get('REDIS_PASSWORD')

def _with_db(url: str, db_index: int) -> str:
    try:
        parsed = urllib.parse.urlsplit(url)
        path = f"/{db_index}"
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))
    except Exception:
        return url

def _build_url(host: str, port: str, password: str | None, scheme: str = 'redis', db_index: int = 0) -> str:
    auth = f":{password}@" if password else ""
    return f"{scheme}://{auth}{host}:{port}/{db_index}"

# Derive broker/cache URLs with priority:
# 1) Explicit REDIS_BROKER_URL / REDIS_CACHE_URL
# 2) From REDIS_PUBLIC_URL / REDIS_URL by forcing db index 0/1
# 3) From REDIS(HOST|PORT|PASSWORD)
REDIS_BROKER_URL = _env_redis_broker_url
REDIS_CACHE_URL = _env_redis_cache_url

if not REDIS_BROKER_URL or not REDIS_CACHE_URL:
    base_url = _env_redis_public_url
    if base_url:
        REDIS_BROKER_URL = REDIS_BROKER_URL or _with_db(base_url, 0)
        REDIS_CACHE_URL = REDIS_CACHE_URL or _with_db(base_url, 1)

if (not REDIS_BROKER_URL or not REDIS_CACHE_URL) and _env_redis_host and _env_redis_port:
    # Use rediss if base_url indicates TLS; otherwise default to redis
    scheme = 'rediss' if (_env_redis_public_url or '').startswith('rediss://') else 'redis'
    REDIS_BROKER_URL = REDIS_BROKER_URL or _build_url(_env_redis_host, _env_redis_port, _env_redis_password, scheme, 0)
    REDIS_CACHE_URL = REDIS_CACHE_URL or _build_url(_env_redis_host, _env_redis_port, _env_redis_password, scheme, 1)

# Final fallbacks for local dev
REDIS_BROKER_URL = REDIS_BROKER_URL or os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
REDIS_CACHE_URL = REDIS_CACHE_URL or os.environ.get('REDIS_URL', 'redis://localhost:6379/1')

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_CACHE_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

USE_I18N = True

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'EXCEPTION_HANDLER': 'server.utils.custom_exception_handler',
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],

    'DATETIME_FORMAT': 'iso-8601',
}

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')  # For collectstatic in production
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'static'),
]

# WhiteNoise configuration for efficient static file serving
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Media files - WARNING: Local storage not persistent on Render
# For production, consider using AWS S3 or similar cloud storage
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# Sampling filter to reduce INFO/DEBUG log volume while always allowing WARNING+
class InfoSamplerFilter(logging.Filter):
    def __init__(self, rate: float = 0.05):
        try:
            self.rate = float(rate)
        except Exception:
            self.rate = 0.05

    def filter(self, record: logging.LogRecord) -> bool:
        # Always allow warnings and above
        if record.levelno >= logging.WARNING:
            return True
        # Sample lower-level logs
        return random.random() < self.rate

# Controls for production logging behavior
LOG_SAMPLE_RATE = float(os.environ.get('LOG_SAMPLE_RATE', '0.05'))
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'WARNING').upper()

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'info_sampler': {
            '()': InfoSamplerFilter,
            'rate': LOG_SAMPLE_RATE,
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'filters': ['info_sampler'],
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'email_debug.log',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOG_LEVEL,
    },
    'loggers': {
        # Framework and library loggers (keep noise down in production)
        'django': {
            'level': 'WARNING',
            'handlers': ['console'],
            'propagate': False,
        },
        'django.request': {
            'level': 'WARNING',
            'handlers': ['console'],
            'propagate': False,
        },
        'django.server': {
            'level': 'WARNING',
            'handlers': ['console'],
            'propagate': False,
        },
        'django.db.backends': {
            'level': 'ERROR',  # avoid per-query info
            'handlers': ['console'],
            'propagate': False,
        },
        'celery': {
            'level': 'WARNING',
            'handlers': ['console'],
            'propagate': False,
        },
        'scheduler.tasks': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        # Use file handler only in DEBUG; otherwise, console only
        'server.email_backend': {
            'handlers': ['console'] + (['file'] if DEBUG else []),
            'level': 'DEBUG',
            'propagate': False,
        },
        'users.email_service': {
            'handlers': ['console'] + (['file'] if DEBUG else []),
            'level': 'INFO',
            'propagate': False,
        },
        'django.core.mail': {
            'handlers': ['console'] + (['file'] if DEBUG else []),
            'level': 'DEBUG',
            'propagate': False,
        },
        # App-level loggers: keep at INFO but subject to sampling
        'users': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'server': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'logs': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

TIME_ZONE = 'UTC'
USE_TZ = True

# CELERY CONFIGURATION - Use derived REDIS_BROKER_URL
CELERY_BROKER_URL = REDIS_BROKER_URL
CELERY_RESULT_BACKEND = REDIS_BROKER_URL
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TIMEZONE = 'UTC'
CELERY_ENABLE_UTC = True
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_DISABLE_RATE_LIMITS = True

# Enable TLS/SSL for Redis if using rediss://
if REDIS_CACHE_URL.startswith('rediss://'):
    cache_options = CACHES['default'].setdefault('OPTIONS', {})
    # Allow connecting without requiring CA bundle (managed providers often use trusted certs)
    cache_options['CONNECTION_POOL_KWARGS'] = {'ssl_cert_reqs': None}

if REDIS_BROKER_URL.startswith('rediss://'):
    # Celery expects these names when loaded via namespace=CELERY
    CELERY_BROKER_USE_SSL = True
    CELERY_REDIS_BACKEND_USE_SSL = {'ssl_cert_reqs': None}