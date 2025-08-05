from users.views import user_profile
from django.urls import path, re_path
from . import views

urlpatterns = [
    path('profile/', user_profile, name='user_profile'),
    re_path(r'^user_progress/$', views.UserProgressView.as_view(), name='user-progress'),
    re_path(r'^upload_profile_picture/$', views.upload_profile_picture, name='upload-profile-picture'),
    re_path(r'^update_profile_picture/$', views.update_profile_picture, name='update-profile-picture'),
]