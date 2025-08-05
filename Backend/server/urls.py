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

urlpatterns = [
    # Admin URL
    re_path(r'^admin/', admin.site.urls),

    # Include app URLs
    re_path(r'^note_taking/', include('notes.urls')),
    re_path(r'^task_manager/', include('task_manager.urls')),
    re_path(r'^chatbot/', include('chatbot.urls')),
    re_path(r'^users/', include('users.urls')),

    # Auth API URLs
    re_path('get_user_info/', views.get_user_info, name= 'get_user_info'),
    re_path('login_page/', views.login_page, name='login_page'),
    re_path('signup_page/', views.signup_page, name='signup_page'),
    re_path('test_token_page/', views.test_token_page, name='test_token_page'),
    re_path('login/', views.login),
    re_path('signup/', views.signup),
    re_path('test_token/', views.test_token),

    # Navigation URLs
    re_path('chatbot_page/', views.chatbot_page, name='chatbot_page'),
    re_path('notes_page/', views.notes_page, name='notes_page'),
    re_path('task_manager_page/', views.task_manager_page, name='task_manager_page'),
    re_path('logout_user/', views.logout_view, name='logout_user'),
    re_path('myProfile/', views.my_profile, name='myProfile'),

    # Password reset URLs
    path('password_reset/', auth_views.PasswordResetView.as_view(template_name='password_reset_form.html'), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(template_name='password_reset_done.html'), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(template_name='password_reset_confirm.html'), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(template_name='password_reset_complete.html'), name='password_reset_complete'),
    path('forgot_password/', views.forgot_password, name='forgot_password'),
    # Home page
    re_path('', views.home_page, name='home_page')
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)