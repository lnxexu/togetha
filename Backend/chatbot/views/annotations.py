import os
import tempfile
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.core.files.storage import default_storage
from ..rag import process_file_for_user, search_similar_for_user

class PDFEmbeddingUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Receive PDF file, process into embeddings, and log it."""
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        filename = file.name

        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            for chunk in file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            # Process PDF into chunks + embeddings
            process_file_for_user(tmp_path, user_id=user.id, document_name=filename)

            # Store log in DB (optional - if you have Document model)
            # Document.objects.create(user=user, name=filename, file=file)

            return Response({"message": "File processed successfully", "document_name": filename}, status=200)

        except Exception as e:
            return Response({"error": str(e)}, status=500)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


class PDFEmbeddingSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Search embeddings for a user."""
        query = request.data.get("query")
        if not query:
            return Response({"error": "Missing query"}, status=400)

        user = request.user
        results = search_similar_for_user(query, user.id, top_k=5)

        if not results:
            return Response({"message": "No relevant results found"}, status=404)

        # Filter by similarity threshold
        THRESHOLD = 0.5
        filtered = [r for r in results if r[2] >= THRESHOLD]
        if not filtered:
            return Response({"message": "Query out of scope"}, status=200)

        formatted = [
            {"id": r[0], "text": r[1], "score": round(r[2], 3), "document": r[3], "page": r[4]}
            for r in filtered
        ]
        return Response({"results": formatted}, status=200)