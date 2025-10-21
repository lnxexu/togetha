from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.files.storage import default_storage
import os
import tempfile
import uuid
from .. import rag as rag_helper

class DocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if 'file' not in request.FILES:
            return Response({"detail": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        
        # Validate file type
        if not uploaded_file.name.lower().endswith('.pdf'):
            return Response({"detail": "Only PDF files are supported"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Generate unique document ID
            doc_id = str(uuid.uuid4())
            
            # Save file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                for chunk in uploaded_file.chunks():
                    temp_file.write(chunk)
                temp_path = temp_file.name

            # Process with RAG pipeline
            # If the client provided a note_id in form data, forward it so chunks carry this linkage
            note_id = request.POST.get('note_id') or request.data.get('note_id') if hasattr(request, 'data') else None
            rag_helper.process_file_for_user(
                file_path=temp_path,
                user_id=request.user.id,
                document_name=uploaded_file.name,
                doc_id=doc_id,
                note_id=note_id
            )

            # Clean up temp file
            os.unlink(temp_path)

            return Response({
                "message": "PDF processed successfully",
                "document_name": uploaded_file.name,
                "document_id": doc_id,
                "file_size": uploaded_file.size,
                "processed_at": rag_helper.get_current_timestamp()
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            # Clean up temp file if it exists
            if 'temp_path' in locals():
                try:
                    os.unlink(temp_path)
                except:
                    pass
            
            return Response({
                "detail": f"Failed to process PDF: {str(e)}"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)