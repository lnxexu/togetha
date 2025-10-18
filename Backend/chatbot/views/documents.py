from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from ..models import DocumentChunk
from ..rag import process_file_for_user, search_similar_for_user
import os
from ..models import ConversationFile, Conversation


class DocumentUploadView(APIView):
    """Accept file uploads and kick off processing/embedding for authenticated users.

    Uses DRF TokenAuthentication/SessionAuthentication via permission classes so
    API clients that send `Authorization: Token <token>` will be accepted.
    """
    permission_classes = [IsAuthenticated]

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

        # Create ConversationFile if conversation provided
        conv_id = request.POST.get('conversation_id') or request.GET.get('conversation_id')
        conv = None
        if conv_id:
            try:
                conv = Conversation.objects.get(pk=conv_id, user=user)
            except Exception:
                conv = None

        # If no conversation provided or lookup failed, create one to satisfy NOT NULL fk
        if conv is None:
            conv = Conversation.objects.create(user=user, title='Uploaded files')

        conversation_file = ConversationFile.objects.create(
            conversation=conv,
            message=None,
            file_name=file.name,
            file_path=file_path,
            file_type=file.content_type or 'application/octet-stream',
            file_size=getattr(file, 'size', 0) or 0,
            is_processed=False,
            processing_status='pending'
        )

        # process and embed
        process_file_for_user(file_path, user_id=user.id, document_name=file.name)

        # lookup and persist doc_id onto ConversationFile
        try:
            qs = DocumentChunk.objects.filter(user=user, document_name=file.name).values_list('doc_id', flat=True).distinct()
            doc_id = qs[0] if qs else None
            if doc_id:
                conversation_file.doc_id = doc_id
                conversation_file.is_processed = True
                conversation_file.processing_status = 'completed'
                conversation_file.save()
        except Exception:
            pass

        return Response(
            {"status": "processed", "filename": file.name},
            status=status.HTTP_201_CREATED,
        )


class DocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        docs = (
            DocumentChunk.objects.filter(user=request.user)
            .values("doc_id", "document_name")
            .distinct()
        )
        return Response(list(docs))


class EmbeddingsExportView(APIView):
    """Export embeddings for the authenticated user.

    Query params:
      - doc_id: optional UUID string to filter by document
      - page: page number (default 1)
      - page_size: number of items per page (default 1000)

    Returns JSON: { total, page, page_size, chunks: [ { doc_id, document_name, chunk_text, embedding, created_at }, ... ] }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        doc_id = request.GET.get("doc_id")
        try:
            page = int(request.GET.get("page", 1))
        except Exception:
            page = 1
        try:
            page_size = int(request.GET.get("page_size", 1000))
        except Exception:
            page_size = 1000

        qs = DocumentChunk.objects.filter(user=request.user)
        if doc_id:
            qs = qs.filter(doc_id=doc_id)

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        chunks = list(
            qs.order_by('created_at')
            .values('doc_id', 'document_name', 'chunk_text', 'embedding', 'created_at')[start:end]
        )

        # Ensure all embeddings are serializable lists (JSONField should already do this)
        for c in chunks:
            if c.get('embedding') is None:
                c['embedding'] = []

        return Response({
            'total': total,
            'page': page,
            'page_size': page_size,
            'chunks': chunks,
        })