
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from ..models import Document

class RAGStatusView(APIView):
    def get(self, request):
        doc_id = request.query_params.get("doc_id")
        doc = Document.objects.filter(id=doc_id).first()
        if not doc:
            return Response({"status": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"status": doc.rag_status})  # e.g. "pending", "completed", "failed"
