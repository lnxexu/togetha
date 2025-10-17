from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
import os
from ..rag import process_file_for_user
from ..models import ConversationFile, DocumentChunk, Conversation


class FileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Save into chatbot/upload
            upload_dir = os.path.join(settings.BASE_DIR, "chatbot", "upload")
            os.makedirs(upload_dir, exist_ok=True)

            file_path = os.path.join(upload_dir, uploaded_file.name)
            with open(file_path, "wb+") as dest:
                for chunk in uploaded_file.chunks():
                    dest.write(chunk)

            # Create ConversationFile record if conversation_id provided
            conv_id = request.POST.get('conversation_id') or request.GET.get('conversation_id')
            conv = None
            if conv_id:
                try:
                    conv = Conversation.objects.get(pk=conv_id, user=request.user)
                except Exception:
                    conv = None

            conversation_file = ConversationFile.objects.create(
                conversation=conv,
                message=None,
                file_name=uploaded_file.name,
                file_path=file_path,
                file_type=uploaded_file.content_type or 'application/octet-stream',
                file_size=uploaded_file.size or 0,
                is_processed=False,
                processing_status='pending'
            )

            # Hand off to rag.py for OCR/embedding/etc.
            process_file_for_user(file_path, request.user.id, document_name=uploaded_file.name)

            # After processing, try to find the doc_id created for this document and persist it
            try:
                qs = DocumentChunk.objects.filter(user=request.user, document_name=uploaded_file.name).values_list('doc_id', flat=True).distinct()
                doc_id = qs[0] if qs else None
                if doc_id:
                    conversation_file.doc_id = doc_id
                    conversation_file.is_processed = True
                    conversation_file.processing_status = 'completed'
                    conversation_file.save()
            except Exception:
                # leave processing flags as-is if lookup failed
                pass

            return Response(
                {"message": "File uploaded and processed successfully"},
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)