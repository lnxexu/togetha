from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views

urlpatterns = [
    path('profile/', views.user_profile, name='user_profile'),
    path('progress/', views.user_progress, name='user_progress'),
    path('session/', views.manage_session, name='manage_session'),
    path('csrf-token/', views.get_csrf_token, name='get_csrf_token'), 
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)