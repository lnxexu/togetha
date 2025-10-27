from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import numpy as np
from .. import rag as rag_helper
from ..models import DocumentChunk
from django.conf import settings
import os
from google import genai

GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY"))
GEMINI_MODEL = getattr(settings, "GEMINI_MODEL", os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
GEMINI_MODEL_CANDIDATES = getattr(settings, "GEMINI_MODEL_CANDIDATES", [])
GENAI_CLIENT = None  # create per-request

class ChatRAGView(APIView):
    def post(self, request):
        query = request.data.get("query")
        doc_ids = request.data.get("doc_ids", [])
        top_k = int(request.data.get("top_k", 5))
        user_id = request.user.id

        results = []
        doc_ids = list(dict.fromkeys(doc_ids))[:4]

        if not query:
            return Response({"detail": "Missing query"}, status=status.HTTP_400_BAD_REQUEST)

        # Build results either from user-wide search or specific documents
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
            try:
                query_emb = rag_helper.embed_texts([query])[0]
            except Exception:
                return Response({"detail": "Embedding service unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            chunks_qs = DocumentChunk.objects.filter(user_id=user_id, doc_id__in=doc_ids)
            for chunk in chunks_qs:
                emb = chunk.embedding
                try:
                    emb_arr = np.array(emb, dtype=np.float32)
                except Exception:
                    continue

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

        # Sort and trim
        results = sorted(results, key=lambda r: r["score"], reverse=True)[:top_k]

        # Compose context and query LLM with fallback models
        context = "\n".join([r["snippet"] for r in results])
        api_key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return Response({"detail": "AI provider not configured. Please set GEMINI_API_KEY on the server."}, status=status.HTTP_400_BAD_REQUEST)
        client = genai.Client(api_key=api_key)
        prompt = (
            "You are a helpful assistant. Answer the user's query using ONLY the context provided.\n"
            "If the answer is not contained in the context, say you don't have enough information.\n\n"
            f"Context:\n{context}\n\nQuery: {query}\nAnswer:"
        )

        errors = []
        used_model = None
        candidates = []
        seen = set()
        for m in [GEMINI_MODEL] + list(GEMINI_MODEL_CANDIDATES):
            if m and m not in seen:
                candidates.append(m)
                seen.add(m)

        resp = None
        for model_name in candidates:
            try:
                resp = client.models.generate_content(model=model_name, contents=prompt)
                used_model = model_name
                break
            except Exception as api_err:
                err_text = str(api_err)
                if (
                    "API key not valid" in err_text
                    or "API_KEY_INVALID" in err_text
                    or "invalid api key" in err_text.lower()
                ):
                    return Response({"detail": "AI provider authentication failed: invalid GEMINI_API_KEY."}, status=status.HTTP_400_BAD_REQUEST)
                if any(k in err_text.lower() for k in ["rate limit", "quota", "exceeded", "resource exhausted", "insufficient"]):
                    errors.append((model_name, err_text))
                    continue
                if any(k in err_text.lower() for k in ["not found", "invalid model", "unknown model"]):
                    errors.append((model_name, err_text))
                    continue
                errors.append((model_name, err_text))
                continue

        if resp is None:
            last = errors[-1][1] if errors else "No candidates available"
            return Response({"detail": f"Gemini error: {last}"}, status=status.HTTP_502_BAD_GATEWAY)

        llm_answer = getattr(resp, "text", None)
        if not llm_answer:
            llm_answer = resp.candidates[0].content.parts[0].text

        return Response({
            "answer": llm_answer,
            "sources": results
        })
