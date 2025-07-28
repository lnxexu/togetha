from django.urls import path, re_path
from . import views

urlpatterns = [
    re_path(r'^folders/$', views.folder_list, name='folder-list'),
    re_path(r'^folders/(?P<pk>[^/.]+)/$', views.folder_detail, name='folder-detail'),
    re_path(r'^notes/$', views.note_list, name='note-list'),
    re_path(r'^notes/(?P<pk>[^/.]+)/$', views.note_detail, name='note-detail'),
    re_path(r'^notes/edit/(?P<pk>[^/.]+)/$', views.note_detail, name='note-edit'),
    re_path(r'^audio-recordings/$', views.upload_audio_recording, name='upload-audio'),
    re_path(r'^audio-recordings/(?P<pk>[^/.]+)/transcribe/$', views.transcribe_audio, name='transcribe-audio'),
    re_path(r'^tags/$', views.tag_list, name='tag-list'),
    re_path(r'^tags/(?P<pk>[^/.]+)/$', views.tag_detail, name='tag-detail'),
    re_path(r'^search/$', views.search_notes, name='search-notes'),
    re_path(r'^notes/(?P<note_id>[^/.]+)/move-to-folder/$', views.move_note_to_folder, name='move-note-to-folder'),
    re_path(r'^notes/(?P<note_id>[^/.]+)/assign-to-folder/$', views.assign_notes_to_folder, name='assign-note-to-folder'),
    re_path(r'^notes/(?P<note_id>[^/.]+)/remove_note_from_folder/$', views.remove_note_from_folder, name='remove_note_from_folder'),
]