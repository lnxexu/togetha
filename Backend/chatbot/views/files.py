from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
import os
from ..rag import process_file_for_user, extract_text_by_page
from ..models import Conversation, ConversationFile


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

            # Optional conversation context
            conversation_id = request.data.get("conversation_id") or request.data.get("conversation")

            # Hand off to rag.py for OCR/embedding/etc. This returns { doc_id, pages }
            result = process_file_for_user(file_path, request.user.id, conversation_id=conversation_id)

            # Build a small preview (first page snippet for PDFs)
            extracted_preview = None
            if uploaded_file.name.lower().endswith('.pdf'):
                try:
                    pages = extract_text_by_page(file_path)
                    if pages:
                        extracted_preview = pages[0][1][:300]
                except Exception:
                    extracted_preview = None

            # If a conversation was provided, create a ConversationFile record so chat can derive doc_ids later
            try:
                if conversation_id:
                    conv = Conversation.objects.filter(pk=conversation_id, user=request.user).first()
                    if conv:
                        ConversationFile.objects.create(
                            conversation=conv,
                            message=None,
                            file_name=uploaded_file.name,
                            file_path=file_path,
                            file_type=getattr(uploaded_file, 'content_type', '') or 'application/octet-stream',
                            file_size=getattr(uploaded_file, 'size', 0) or 0,
                            is_processed=True,
                            processing_status='completed',
                            extracted_text=extracted_preview or ''
                        )
            except Exception:
                # Non-fatal; uploading should still succeed
                pass

            payload = {
                "message": "File uploaded and processed successfully",
                "extracted_preview": extracted_preview,
                "doc_id": result.get("doc_id") if isinstance(result, dict) else None,
                "pages": result.get("pages") if isinstance(result, dict) else None,
                "conversation_id": conversation_id,
            }
            return Response(payload, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)