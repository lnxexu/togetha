from django.urls import path
from . import views

urlpatterns = [
    path('conversations/', views.ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<uuid:pk>/', views.ConversationDetailView.as_view(), name='conversation-detail'),
    path('conversations/<uuid:conversation_id>/messages/', views.send_message, name='send-message'),
    path('messages/<uuid:message_id>/feedback/', views.provide_message_feedback, name='message-feedback'),
    path('settings/', views.chatbot_settings, name='chatbot-settings'),
    path('chat/', views.chat_interface, name='chat-interface'),
    path('', views.chat_interface, name='chatbot-index'),  # Add this line
]