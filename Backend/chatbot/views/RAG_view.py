from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import numpy as np


# import the shared embedding model from rag helper
from .. import rag as rag_helper
from ..models import DocumentChunk

# views/rag_chat.py
class ChatRAGView(APIView):
    def post(self, request):
        query = request.data.get("query")
        doc_ids = request.data.get("doc_ids", [])
        top_k = int(request.data.get("top_k", 5))
        user_id = request.user.id

        results = []
        # enforce max 4 documents
        doc_ids = list(dict.fromkeys(doc_ids))[:4]

        if not query:
            return Response({"detail": "Missing query"}, status=status.HTTP_400_BAD_REQUEST)

        # If no doc_ids provided, fall back to global search in rag helper
        if not doc_ids:
            hits = rag_helper.search_similar_for_user(query, user_id=user_id, top_k=top_k)
            for cid, txt, score, doc_name, page_num in hits:
                results.append({
                    "doc_id": None,
                    "snippet": txt,
                    "score": score,
                    "document_name": doc_name,
                    "page": page_num,
                })
        else:
            # Embed query once
            try:
                query_emb = rag_helper.EMBED_MODEL.encode([query])[0]
            except Exception:
                # fallback: try embed_texts helper
                query_emb = rag_helper.embed_texts([query])[0]

            # Fetch chunks belonging to this user and the requested doc_ids
            # DocumentChunk.doc_id is a UUIDField; incoming doc_ids are expected as strings
            chunks_qs = DocumentChunk.objects.filter(user_id=user_id, doc_id__in=doc_ids)

            for chunk in chunks_qs:
                emb = chunk.embedding
                # embedding stored as JSON list of floats in the model
                try:
                    emb_arr = np.array(emb, dtype=np.float32)
                except Exception:
                    # skip malformed embeddings
                    continue

                # compute cosine similarity
                denom = (np.linalg.norm(query_emb) * np.linalg.norm(emb_arr))
                if denom == 0:
                    score = 0.0
                else:
                    score = float(np.dot(query_emb, emb_arr) / denom)

                results.append({
                    "doc_id": str(chunk.doc_id),
                    "snippet": chunk.chunk_text,
                    "score": score,
                    "document_name": chunk.document_name,
                    "page": getattr(chunk, 'page_num', None),
                })
        # sort globally by score and trim
        results = sorted(results, key=lambda r: r["score"], reverse=True)[:top_k]

        # send to LLM with context (pseudo-code)
        context = "\n".join([r["snippet"] for r in results])
        llm_answer = f"[LLM answer simulated based on context: {context[:200]}...]"

        return Response({
            "answer": llm_answer,
            "sources": results
        })
