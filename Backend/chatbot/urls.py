from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views.conversations import ConversationViewSet, get_messages
from .views.messages import MessageViewSet, message_actions
from .views.chat import ChatView
from .views.files import FileUploadView
from .views.ocr import OCRView
from .views.RAG_view import ChatRAGView

router = DefaultRouter()
router.register(r"conversations", ConversationViewSet, basename="conversation")
router.register(r"messages", MessageViewSet, basename="message")

urlpatterns = [
    path("chat/", ChatView.as_view(), name="chatbot_chat"),
    path("upload_pdf/", FileUploadView.as_view(), name="chatbot_upload_pdf"),
    path("ocr/", OCRView.as_view(), name="chatbot_ocr"),
    path("chat/rag/", ChatRAGView.as_view(), name="chatbot_rag"),
    path("messages/actions/", message_actions, name="chatbot_message_actions"),
    path("conversations/<uuid:conversation_id>/messages/", get_messages, name="chatbot_conversation_messages"),
] + router.urls