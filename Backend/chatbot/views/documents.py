from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.conf import settings
from ..models import DocumentChunk
from ..rag import process_file_for_user, search_similar_for_user
import os


class DocumentUploadView(APIView):
    @method_decorator(login_required)
    def post(self, request, *args, **kwargs):
        file = request.FILES["file"]
        user = request.user

        # Save into chatbot/upload
        upload_dir = os.path.join(settings.BASE_DIR, "chatbot", "upload")
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, file.name)
        with open(file_path, "wb+") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        # process and embed
        process_file_for_user(file_path, user_id=user.id, document_name=file.name)

        return Response(
            {"status": "processed", "filename": file.name},
            status=status.HTTP_201_CREATED,
        )


class DocumentListView(APIView):
    def get(self, request, *args, **kwargs):
        docs = (
            DocumentChunk.objects.filter(user=request.user)
            .values("doc_id", "document_name")
            .distinct()
        )
        return Response(list(docs))