from django.urls import path
from .views import (
    ChatView, 
    PDFUploadView, 
    ConversationViewSet, 
    MessageViewSet,
    message_actions, 
    get_messages, 
    chatbot_settings,
    extract_text_from_images
)

urlpatterns = [
    path("chat/", ChatView.as_view(), name="chat"),
    path("upload_pdf/", PDFUploadView.as_view(), name="upload_pdf"),
    path("extract_text/", extract_text_from_images, name="extract_text"),
    
    # Conversation management
    path("conversations/", ConversationViewSet.as_view(), name="conversations_list"),
    path("conversations/<uuid:pk>/", ConversationViewSet.as_view(), name="conversations_detail"),
    
    # Message operations
    path("messages/", get_messages, name="get_messages"),
    path("messages/<uuid:pk>/", MessageViewSet.as_view(), name="message_detail"),
    path("messages/actions/", message_actions, name="message_actions"),
    path("messages/<uuid:message_id>/actions/", message_actions, name="message_actions_detail"),
    
    # Settings
    path("settings/", chatbot_settings, name="chatbot_settings"),
]
