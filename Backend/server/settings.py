from pathlib import Path
import os
from decouple import config, Csv
from dotenv import load_dotenv
from pathlib import Path


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BASE_DIR / '.env')

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# Load from environment variable, fallback to insecure default for development only
SECRET_KEY = config('SECRET_KEY', default='django-insecure-+^2p59aom-1u1r7%z0pg_vi4wg^y%10swf-=1!rpp!q6sr)q0p')

# Debug mode: enable serving of media/static files in development by default.
# Use environment variable DEBUG to override in non-development environments.
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='*,192.168.0.153,localhost,127.0.0.1', cast=Csv())

DEFAULT_FROM_EMAIL = 'kcorpuz_220000002183@uic.edu.ph'

EMAIL_BACKEND = 'server.email_backend.FallbackSMTPBackend'

# Primary SMTP configuration (these will be tried by the fallback backend)
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 465
EMAIL_USE_SSL = True  
EMAIL_USE_TLS = False
EMAIL_HOST_USER = 'wlage35@gmail.com'
EMAIL_HOST_PASSWORD = 'lbqi deda bbux ebxd'
EMAIL_TIMEOUT = 60 
EMAIL_USE_LOCALTIME = False
 
from decouple import Csv

# Gemini / Embeddings configuration
# Do NOT provide a hardcoded default for API keys. Require environment or .env to supply it.
GEMINI_API_KEY = config('GEMINI_API_KEY', default=None)
GEMINI_MODEL = config('GEMINI_MODEL', default='gemini-2.5-flash')
EMBEDDING_MODEL = config('EMBEDDING_MODEL', default='text-embedding-004')

# Ordered model candidates for graceful fallback
GEMINI_MODEL_CANDIDATES = config('GEMINI_MODEL_CANDIDATES', default='', cast=Csv())
if not GEMINI_MODEL_CANDIDATES:
    GEMINI_MODEL_CANDIDATES = [
        GEMINI_MODEL,
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash-lite-preview',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ]

EMBEDDING_MODEL_CANDIDATES = config('EMBEDDING_MODEL_CANDIDATES', default='', cast=Csv())
if not EMBEDDING_MODEL_CANDIDATES:
    EMBEDDING_MODEL_CANDIDATES = [
        EMBEDDING_MODEL,
        'embedding-001',
    ]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'debug_toolbar',
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


MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'server.middleware.ClientTimezoneMiddleware',
    'django.middleware.common.CommonMiddleware',
    'server.middleware.CSRFExemptAPIMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'server.middleware.DebugAuthMiddleware',  
    'server.middleware.UserActivityMiddleware',  
    "debug_toolbar.middleware.DebugToolbarMiddleware",
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CSRF_USE_SESSIONS = False  
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'  
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:8000,http://192.168.0.153:8000',
    cast=Csv()
)

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS', 
    default='http://localhost:3000,http://127.0.0.1:8000,http://192.168.0.153:8000',
    cast=Csv()
)
CORS_ALLOW_ALL_ORIGINS = True
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


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'Togetha',
        'USER': 'Togetha',
        'PASSWORD': 'lol',
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

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://localhost:6379/1',
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
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
STATIC_URL = '/static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'templates'), 
]

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'email_debug.log',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'scheduler.tasks': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'server.email_backend': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'django.core.mail': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

TIME_ZONE = 'UTC'
USE_TZ = True

CELERY_BROKER_URL = 'redis://localhost:6379/0'  
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
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