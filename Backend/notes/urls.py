from django.urls import path, re_path
from . import views

urlpatterns = [
    re_path(r'^folders/$', views.folder_list, name='folder-list'),
    re_path(r'^folders/(?P<pk>[^/.]+)/$', views.folder_detail, name='folder-detail'),
    re_path(r'^notes/$', views.note_list, name='note-list'),
    re_path(r'^notes/(?P<pk>[^/.]+)/$', views.note_detail, name='note-detail'),
    re_path(r'^notes/edit/(?P<pk>[^/.]+)/$', views.note_detail, name='note-edit'),
    re_path(r'^audio-recordings/$', views.upload_audio_recording, name='upload-audio'),
    re_path(r'^audio-recordings/(?P<pk>[^/.]+)/transcribe/$', views.transcribe_audio, name='transcribe-audio')
]