import os
import tempfile
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from ..rag import process_file_for_user, search_similar_for_user

class PDFEmbeddingUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Upload a PDF, process it into embeddings, and link to the user."""
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        filename = file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            for chunk in file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            note_id = request.POST.get('note_id') or request.data.get('note_id') if hasattr(request, 'data') else None
            process_file_for_user(tmp_path, user_id=user.id, document_name=filename, note_id=note_id)
            return Response({
                "message": "File processed successfully",
                "document_name": filename
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


class PDFEmbeddingSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Search or chat based on embeddings."""
        query = request.data.get("query")
        if not query:
            return Response({"error": "Missing query"}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        results = search_similar_for_user(query, user.id, top_k=5)

        if not results:
            return Response({"message": "No relevant results found"}, status=status.HTTP_404_NOT_FOUND)

        THRESHOLD = 0.5
        filtered = [r for r in results if r[2] >= THRESHOLD]
        if not filtered:
            return Response({"message": "Query out of scope"}, status=status.HTTP_200_OK)

        formatted = [
            {"id": r[0], "text": r[1], "score": round(r[2], 3), "document": r[3], "page": r[4]}
            for r in filtered
        ]

        return Response({"results": formatted}, status=status.HTTP_200_OK)
