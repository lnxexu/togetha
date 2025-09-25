from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
import os
from ..rag import process_file_for_user


class FileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Save file temporarily
            upload_dir = os.path.join(settings.MEDIA_ROOT, "uploads")
            os.makedirs(upload_dir, exist_ok=True)

            file_path = os.path.join(upload_dir, uploaded_file.name)
            with open(file_path, "wb+") as dest:
                for chunk in uploaded_file.chunks():
                    dest.write(chunk)

            # Hand off to rag.py for OCR/embedding/etc.
            process_file_for_user(file_path, request.user.id)

            return Response(
                {"message": "File uploaded and processed successfully"},
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
