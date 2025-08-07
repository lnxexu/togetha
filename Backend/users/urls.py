from django.urls import path
from . import views

urlpatterns = [
    path('profile/', views.user_profile, name='user_profile'),
    path('progress/', views.user_progress, name='user_progress'),
    path('session/', views.manage_session, name='manage_session'),
    path('csrf-token/', views.get_csrf_token, name='get_csrf_token'), 
]