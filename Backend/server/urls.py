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
from django.views.generic import TemplateView
from server import views


urlpatterns = [
    path('admin/', admin.site.urls),
    re_path(r'^note_taking/', include('notes.urls')),
    re_path('task_manager/', include('task_manager.urls')),
    path('chatbot/', include('chatbot.urls')),
    re_path('get_username', views.get_username, name= 'get_username'),
    re_path('login_page/', views.login_page, name='login_page'),
    re_path('signup_page/', views.signup_page, name='signup_page'),
    re_path('test_token_page/', views.test_token_page, name='test_token_page'),
    re_path('login', views.login),
    re_path('signup', views.signup),
    re_path('test_token', views.test_token),
    re_path('chatbot_page/', views.chatbot_page, name='chatbot_page'),
    re_path('notes_page/', views.notes_page, name='notes_page'),
    re_path('task_manager_page/', views.task_manager_page, name='task_manager_page'),
    re_path('', views.home_page, name='home_page')
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)