from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
import requests
import os

from . import rag  # import your rag.py

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"  # Ollama running locally


# ✅ Chat endpoint with optional RAG
class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            messages = request.data.get("messages", [])
            if not messages:
                return Response({"error": "No messages provided"}, status=status.HTTP_400_BAD_REQUEST)

            query_text = messages[-1].get("content", "")
            if not query_text:
                return Response({"error": "Empty query"}, status=status.HTTP_400_BAD_REQUEST)

            # Try RAG search
            try:
                similar_chunks = rag.search_similar(query_text, top_k=5)
            except Exception:
                similar_chunks = []

            context = "\n\n".join([txt for _, txt, _ in similar_chunks]) if similar_chunks else ""
            if context:
                query_text = f"Answer based on the following context:\n{context}\n\nUser: {query_text}"

            # Step 4: Send query to Ollama
            payload = {
                "model": "llama3.2",
                "messages": [{"role": "user", "content": query_text}],
                "stream": False,
            }

            response = requests.post(OLLAMA_URL, json=payload, timeout=60)
            response.raise_for_status()
            ollama_reply = response.json()

            # ✅ Flatten response
            content = ollama_reply.get("message", {}).get("content") or ollama_reply.get("content")

            return Response(
                {"content": content, "source": "rag" if context else "chat"},
                status=status.HTTP_200_OK,
            )

        except requests.exceptions.RequestException as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        except Exception as e:
            import traceback
            print("🔥 ChatView Error:", traceback.format_exc())
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ✅ PDF upload endpoint with embedding
class PDFUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        # Save file inside chatbot/upload
        save_dir = os.path.join(settings.BASE_DIR, "chatbot", "upload")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, file_obj.name)

        with open(save_path, "wb+") as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)

        # Step 1: Extract text
        full_text = rag.extract_text_from_pdf(save_path)

        # Step 2: Chunk text
        chunks = rag.chunk_text(full_text)

        # Step 3: Embed and save
        embeddings = rag.embed_texts(chunks)
        rag.save_chunks(chunks, embeddings)

        return Response(
            {"message": f"File '{file_obj.name}' processed and embeddings stored."},
            status=status.HTTP_201_CREATED,
        )
