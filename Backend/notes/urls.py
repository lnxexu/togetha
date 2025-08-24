from django.urls import path
from . import views

urlpatterns = [
    # Folder URLs
    path('folders/', views.folder_list, name='folder_list'),
    path('folders/<str:pk>/', views.folder_detail, name='folder_detail'),
    
    # Note URLs
    path('notes/', views.note_list, name='note_list'),
    path('notes/<str:pk>/', views.note_detail, name='note_detail'),
    
    # Tag URLs
    path('tags/', views.tag_list, name='tag_list'),
    path('tags/<str:pk>/', views.tag_detail, name='tag_detail'),
    
    # Combined note folder management
    path('manage-note-folders/', views.manage_note_folders, name='manage_note_folders'),

    # Drawing URLs
    path('notes/<str:note_id>/drawing/save/', views.save_drawing, name='save_drawing'),
    path('notes/<str:note_id>/drawing/', views.get_drawing, name='get_drawing'),
    path('notes/<str:note_id>/drawing/clear/', views.clear_drawing, name='clear_drawing'),
]