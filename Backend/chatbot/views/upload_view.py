from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.files.storage import default_storage
import os
import tempfile
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
            # Save file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                for chunk in uploaded_file.chunks():
                    temp_file.write(chunk)
                temp_path = temp_file.name

            # Process with RAG pipeline
            rag_helper.process_file_for_user(
                file_path=temp_path,
                user_id=request.user.id,
                document_name=uploaded_file.name
            )

            # Clean up temp file
            os.unlink(temp_path)

            return Response({
                "message": "PDF processed successfully",
                "document_name": uploaded_file.name
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