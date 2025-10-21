from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import os
import numpy as np
import requests
from .. import rag as rag_helper
from ..models import DocumentChunk

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
            # Use the local rag sqlite DB to fetch page-level chunks for the given doc_ids
            # This ensures chunking/search is performed per-page rather than on the whole document
            try:
                hits = rag_helper.search_similar_for_user_docs(query, user_id=user_id, doc_ids=doc_ids, top_k=top_k)
            except Exception:
                hits = []

            # hits tuples: (cid, txt, score, doc_name, page_num, doc_id)
            for hit in hits:
                if len(hit) >= 6:
                    cid, txt, score, doc_name, page_num, hit_doc_id = hit
                else:
                    cid, txt, score, doc_name, page_num = hit
                    hit_doc_id = None

                results.append({
                    "doc_id": str(hit_doc_id) if hit_doc_id is not None else None,
                    "snippet": txt,
                    "score": score,
                    "document_name": doc_name,
                    "page": page_num,
                })
        # sort globally by score and trim
        results = sorted(results, key=lambda r: r["score"], reverse=True)[:top_k]

        # Generate answer using Ollama llama3.2
        context = "\n".join([r["snippet"] for r in results])
        
        if context.strip():
            prompt = f"Based on the following context, answer the question: {query}\n\nContext:\n{context}\n\nAnswer:"
        else:
            prompt = f"Please answer the following question: {query}"
        
        try:
            ollama_base = os.environ.get('OLLAMA_API_URL', 'http://localhost:11434').rstrip('/')
            ollama_endpoint = f"{ollama_base}/api/generate"
            ollama_response = requests.post(
                ollama_endpoint,
                json={
                    "model": "llama3.2",
                    "prompt": prompt,
                    "stream": False
                },
                timeout=30
            )
            
            if ollama_response.status_code == 200:
                llm_answer = ollama_response.json().get("response", "No response generated")
            else:
                llm_answer = "AI assistant is currently unavailable. Please try again later."
        except Exception as e:
            llm_answer = "AI assistant is currently unavailable. Please try again later."

        return Response({
            "answer": llm_answer,
            "sources": results
        })


class OllamaRAGView(APIView):
    """RAG-backed query that forwards context to a local Ollama instance for generation.

    Request body: { query: str, doc_ids?: [str], top_k?: int }
    Response: { answer: str, sources: [ { doc_id, snippet, score, document_name, page } ] }
    """
    def post(self, request):
        query = request.data.get("query")
        doc_ids = request.data.get("doc_ids", [])
        top_k = int(request.data.get("top_k", 5))
        user_id = request.user.id

        if not query:
            return Response({"detail": "Missing query"}, status=status.HTTP_400_BAD_REQUEST)

        results = []
        doc_ids = list(dict.fromkeys(doc_ids))[:4]

        # If doc_ids provided, fetch DocumentChunk objects for those docs (per-user)
        if doc_ids:
            # Use rag helper's sqlite-backed search that returns page-level chunks
            try:
                hits = rag_helper.search_similar_for_user_docs(query, user_id=user_id, doc_ids=doc_ids, top_k=top_k)
            except Exception:
                hits = []

            for hit in hits:
                # (cid, txt, score, doc_name, page_num, doc_id)
                if len(hit) >= 6:
                    cid, txt, score, doc_name, page_num, hit_doc_id = hit
                else:
                    cid, txt, score, doc_name, page_num = hit
                    hit_doc_id = None

                results.append({
                    "doc_id": str(hit_doc_id) if hit_doc_id is not None else None,
                    "snippet": txt,
                    "score": score,
                    "document_name": doc_name,
                    "page": page_num,
                })
        else:
            # fallback: use rag_helper search for this user
            hits = rag_helper.search_similar_for_user(query, user_id=user_id, top_k=top_k)
            for cid, txt, score, doc_name, page_num in hits:
                results.append({
                    "doc_id": None,
                    "snippet": txt,
                    "score": score,
                    "document_name": doc_name,
                    "page": page_num,
                })

        # sort and trim
        results = sorted(results, key=lambda r: r.get('score', 0), reverse=True)[:top_k]

        context = "\n".join([r['snippet'] for r in results])
        if context.strip():
            prompt = f"Based on the following context, answer the question: {query}\n\nContext:\n{context}\n\nAnswer:"
        else:
            prompt = f"Please answer the following question: {query}"

        # Call Ollama generate API
        ollama_base = os.environ.get('OLLAMA_API_URL', 'http://localhost:11434').rstrip('/')
        ollama_url = f"{ollama_base}/api/generate"
        try:
            resp = requests.post(
                ollama_url,
                json={"model": "llama3.2", "prompt": prompt, "stream": False},
                
            )
        except Exception as e:
            # Failed to reach Ollama — return 503 with debug info
            return Response(
                {"detail": "Failed to contact Ollama server", "error": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # If Ollama returned a non-200, forward status and body
        if resp.status_code != 200:
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            return Response(
                {"detail": "Ollama returned an error", "status_code": resp.status_code, "body": body},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            parsed = resp.json()
            llm_answer = parsed.get('response') or parsed.get('text') or parsed.get('output') or ''
        except Exception:
            llm_answer = ''

        return Response({"answer": llm_answer, "sources": results})
