from django.urls import path
from .views import ChatView, PDFUploadView

urlpatterns = [
    path("chat/", ChatView.as_view(), name="chat"),
    path("upload_pdf/", PDFUploadView.as_view(), name="upload_pdf"),
]
