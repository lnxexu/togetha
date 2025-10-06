from django.urls import path
from .views.conversations import ConversationViewSet, get_messages
from .views.messages import MessageViewSet, message_actions
from .views.settings import chatbot_settings
from .views.chat import ChatView
from .views.ocr import OCRView
from .views.files import FileUploadView
from .utils.ocr_utils import extract_text_from_images
from .views.documents import DocumentUploadView, DocumentListView
from .views.RAG_view import ChatRAGView
from .views.dictionary_views import ConceptHelpView

urlpatterns = [
    path("chat/", ChatView.as_view(), name="chat"),
    path("upload_pdf/", FileUploadView.as_view(), name="upload_pdf"),
    path("upload_file/", FileUploadView.as_view(), name="upload_file"),
   
    # sa image to text (OCR)
    path("ocr/extract_text/", OCRView.as_view(), name="extract_text"),

    # Sa conversations ni handlers
    path("conversations/", ConversationViewSet.as_view({"get": "list", "post": "create"}), name="conversations_list"),
    path("conversations/<uuid:pk>/", ConversationViewSet.as_view({"get": "retrieve", "put": "update", "delete": "destroy"}), name="conversations_detail"),
    
    # Messages
    path("messages/<uuid:conversation_id>/", get_messages, name="get_messages"),
    path("messages/<uuid:pk>/", MessageViewSet.as_view({"get": "retrieve"}), name="message_detail"),
    path("messages/actions/", message_actions, name="message_actions"),

    # Settings
    path("settings/", chatbot_settings, name="chatbot_settings"),

    # Para sa document management sa multiple document handling
    path("documents/upload/", DocumentUploadView.as_view(), name="upload_document"),
    path("documents/list/", DocumentListView.as_view(), name="list_documents"),
    path("chat/rag/", ChatRAGView.as_view(), name="chat_rag"),
    #Para ni sa dictionary
    path("dictionary/concept/", ConceptHelpView.as_view(), name="concept_help"),
]