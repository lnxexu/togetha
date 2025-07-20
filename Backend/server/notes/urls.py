from django.urls import path
from . import views

urlpatterns = [
    path('folders/', views.folder_list, name='folder-list'),
    path('folders/<str:pk>/', views.folder_detail, name='folder-detail'),
    path('notes/', views.note_list, name='note-list'),
    path('notes/<str:pk>/', views.note_detail, name='note-detail'),
    path('audio-recordings/', views.upload_audio_recording, name='upload-audio'),
    path('audio-recordings/<str:pk>/transcribe/', views.transcribe_audio, name='transcribe-audio'),
]