# views/documents.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from ..models import DocumentChunk
from ..rag import process_file_for_user, search_similar_for_user
import os, tempfile

class DocumentUploadView(APIView):
    @method_decorator(login_required)
    def post(self, request, *args, **kwargs):
        file = request.FILES["file"]
        user = request.user
        tmp_path = os.path.join(tempfile.gettempdir(), file.name)
        with open(tmp_path, "wb+") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        # process and embed
        process_file_for_user(tmp_path, user_id=user.id, document_name=file.name)

        return Response({"status": "processed", "filename": file.name}, status=status.HTTP_201_CREATED)


class DocumentListView(APIView):
    def get(self, request, *args, **kwargs):
        docs = (
            DocumentChunk.objects.filter(user=request.user)
            .values("doc_id", "document_name")
            .distinct()
        )
        return Response(list(docs))
