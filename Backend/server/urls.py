from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
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
    # Provide legacy/api prefix used by some frontend clients
    path('api/users/', include('users.urls')),
    path('notifications/', include('notifications.urls')),
    path('activity_logs/', include('logs.urls')),
    path('scheduler/', include('scheduler.urls')),
    path('usage/', include('usage_tracking.urls')),

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
    path('health/', views.health_check, name='health_check'),
    
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

# Serve media files - works in both development and production (local dev)
# For cloud production (Render, AWS, etc.), use cloud storage (S3) or CDN
if settings.DEBUG:
    # Development mode: use static() helper
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # Non-DEBUG mode (local testing): serve media files explicitly
    # This allows testing with DEBUG=False locally
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]