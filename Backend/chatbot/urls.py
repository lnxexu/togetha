from django.urls import path
from . import views
from rest_framework.urlpatterns import format_suffix_patterns

urlpatterns = [
    # Conversation URLs
    path('conversations/', views.ConversationViewSet.as_view(), name='conversation_list'),
    path('conversations/<int:pk>/', views.ConversationViewSet.as_view(), name='conversation_detail'),
    
    # Settings
    path('settings/', views.chatbot_settings, name='chatbot_settings'),
    
    # Messages
    path('messages/', views.get_messages, name='get_messages'),
    path('message-actions/', views.message_actions, name='message_actions'),
    path('message-actions/<int:message_id>/', views.message_actions, name='message_action_detail'),
    
    # OCR
    path('extract-text/', views.extract_text_from_images, name='extract_text_from_images'),
]

urlpatterns = format_suffix_patterns(urlpatterns)