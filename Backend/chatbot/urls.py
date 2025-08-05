from django.urls import path
from . import views

urlpatterns = [
    path('conversations/', views.ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<uuid:pk>/', views.ConversationDetailView.as_view(), name='conversation-detail'),
    path('conversations/<uuid:conversation_id>/messages/', views.send_message_api, name='send-message'),
    path('conversations/<uuid:conversation_id>/generate-title/', views.generate_conversation_title, name='generate-title'),
    path('messages/<uuid:message_id>/feedback/', views.provide_message_feedback, name='message-feedback'),
    path('settings/', views.chatbot_settings, name='chatbot-settings'),
    path('clear-conversations/', views.clear_conversations, name='clear-conversations'),
    path('chat/', views.chat_interface, name='chat-interface'),
    path('api/send/', views.send_message_api, name='send-message-api'),  # New endpoint for API calls
    path('api/messages/', views.get_messages, name='get-messages'), 
    path('api/ocr/', views.extract_text_from_images, name='ocr-image-upload'),  # New endpoint for OCR
    path('', views.chat_interface, name='chatbot-index'),
]   