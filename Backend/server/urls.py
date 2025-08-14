"""
URL configuration for server project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from server import views
from django.contrib.auth import views as auth_views
from rest_framework.authtoken import views as auth_view


urlpatterns = [
    # Admin URL
    path('admin/', admin.site.urls),

    # Include app URLs
    path('note_taking/', include('notes.urls')),
    path('task_manager/', include('task_manager.urls')),
    path('chatbot/', include('chatbot.urls')),
    path('users/', include('users.urls')),
    path('notifications/', include('notifications.urls')),
    path('logs/', include('logs.urls')),

    # Auth API URLs
    path('api-token-auth/', auth_view.obtain_auth_token, name='api-token-auth'),
    path('get_user_info/', views.get_user_info, name='get_user_info'),
    path('login_page/', views.login_page, name='login_page'),
    path('signup_page/', views.signup_page, name='signup_page'),
    path('test_token_page/', views.test_token_page, name='test_token_page'),
    path('login/', views.login_api, name='login'), 
    path('signup/', views.signup, name='signup'),
    path('test_token/', views.test_token, name='test_token'),
    path('validate_token/', views.validate_token, name='validate_token'),
    
    # Navigation URLs
    path('chatbot_page/', views.chatbot_page, name='chatbot_page'),
    path('notes_page/', views.notes_page, name='notes_page'),
    path('task_manager_page/', views.task_manager_page, name='task_manager_page'),
    path('logout_user/', views.user_logout, name='logout_user'),
    path('myProfile/', views.my_profile, name='myProfile'),

    # Password reset URLs
    path('password_reset/', auth_views.PasswordResetView.as_view(template_name='password_reset_form.html'), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(template_name='password_reset_done.html'), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(template_name='password_reset_confirm.html'), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(template_name='password_reset_complete.html'), name='password_reset_complete'),
    path('forgot_password/', views.forgot_password, name='forgot_password'),
    
    # Home page
    path('', views.home_page, name='home_page')
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)