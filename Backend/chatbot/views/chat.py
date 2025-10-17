from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
import requests
from django.conf import settings
from .. import rag
from ..models import Conversation, Message
from ..models import DocumentChunk
import traceback

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
# Timeout (seconds) for requests to the Ollama API; configurable in Django settings
OLLAMA_TIMEOUT = getattr(settings, "OLLAMA_TIMEOUT", 300)

class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            messages = request.data.get("messages", [])
            conversation_id = request.data.get("conversation_id")

            if not messages:
                return Response({"error": "No messages provided"}, status=status.HTTP_400_BAD_REQUEST)

            query_text = messages[-1].get("content", "")
            if not query_text:
                return Response({"error": "Empty query"}, status=status.HTTP_400_BAD_REQUEST)

            # Conversation handling
            if conversation_id:
                try:
                    conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
                except Conversation.DoesNotExist:
                    return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
            else:
                conversation = Conversation.objects.create(user=request.user, title="New Conversation")
                conversation_id = conversation.id

            # Save user message
            user_message = Message.objects.create(
                conversation=conversation,
                content=query_text,
                message_type='user'
            )

            # Prepare system + history
            system_prompt = (
                "You are an AI tutoring assistant. Format your responses with proper markdown:"
                "- Use **bold** for emphasis and important points"
                "- Use *italics* for definitions or explanations"
                "- Use ### for headers and subheaders"
                "- Use bullet points (- ) for lists"
                "- Use numbered lists (1. ) when showing steps"
                "- Use | tables | when presenting data"
                "- Use `code blocks` for technical terms"
                "- Be clear, helpful, and educational in your responses."
                ""
                "CONTEXT HANDLING RULES:"
                "- ALWAYS refer to the CURRENT CONVERSATION THREAD only"
                "- When files are attached to a message, they are specific to THAT message"
                "- When users ask for 'more examples' or 'explain further', refer to YOUR LAST RESPONSE in this conversation"
                "- When asked to summarize or generate quizzes, refer to YOUR PREVIOUS MESSAGE in this conversation"
                "- If documents are uploaded, they are available for analysis throughout the conversation"
                "- Never reference previous conversations or unrelated topics"
                "- If you don't have enough context, ask for clarification"
                "- If the user asks about "
                ""
                "FILE HANDLING:"
                "- When text is extracted from images (OCR), treat it as direct content from the user and ignore it as the pytesseract source will be processed separatelySS"
                "- When documents are uploaded, they become part of the knowledge base for this conversation"
                "- Always acknowledge when you're referencing uploaded content"
                "- If files failed to upload, work with the available information"
            )
            conversation_messages = [{"role": "system", "content": system_prompt}]
            for msg in conversation.messages.exclude(id=user_message.id).order_by('created_at'):
                conversation_messages.append({
                    "role": "user" if msg.message_type == 'user' else "assistant",
                    "content": msg.content
                })

            # RAG context: allow specifying doc_ids in request, or derive from
            # conversation attached files (matching by filename -> document_name).
            context = ""
            try:
                doc_ids = request.data.get('doc_ids', []) or []

                # If no doc_ids supplied, derive from conversation attached files
                if not doc_ids and hasattr(conversation, 'attached_files'):
                    file_names = [f.file_name for f in conversation.attached_files.all() if getattr(f, 'file_name', None)]
                    if file_names:
                        # Find distinct doc_ids for these filenames
                        qs = DocumentChunk.objects.filter(user=request.user, document_name__in=file_names).values_list('doc_id', flat=True).distinct()
                        doc_ids = [str(d) for d in qs]

                if doc_ids:
                    # Use the provided doc_ids to compute RAG over those documents
                    # Embed query once
                    try:
                        query_emb = rag.EMBED_MODEL.encode([query_text])[0]
                    except Exception:
                        query_emb = rag.embed_texts([query_text])[0]

                    # Fetch chunks for these doc_ids belonging to this user
                    chunks_qs = DocumentChunk.objects.filter(user=request.user, doc_id__in=doc_ids)
                    results = []
                    import numpy as np
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
                        results.append((chunk.id, chunk.chunk_text, score, chunk.document_name, getattr(chunk, 'page_num', None)))

                    results.sort(key=lambda x: x[2], reverse=True)
                    top_hits = results[:3]
                    context = "\n\n".join([r[1] for r in top_hits]) if top_hits else ""
                else:
                    # Fallback: keyword-based user-level search
                    use_rag = any(k in query_text.lower() for k in ["document", "file", "pdf", "uploaded"])
                    if use_rag:
                        chunks = rag.search_similar_for_user(query_text, request.user.id, top_k=3)
                        context = "\n\n".join([c[1] for c in chunks]) if chunks else ""
            except Exception as e:
                print("RAG failed:", e)

            current_query = f"Answer using:\n{context}\n\nUser: {query_text}" if context else query_text
            conversation_messages.append({"role": "user", "content": current_query})

            # Send to Ollama
            payload = {
                "model": "llama3.2",
                "messages": conversation_messages,
                "stream": False,
                "options": {"temperature": 0.7, "top_p": 0.9, "max_tokens": 2048}
            }
            response = requests.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
            response.raise_for_status()
            ollama_reply = response.json()

            content = ollama_reply.get("message", {}).get("content") or ollama_reply.get("content")
            if not content:
                raise Exception("No content from Ollama")

            ai_message = Message.objects.create(
                conversation=conversation,
                content=content,
                message_type='assistant',
                model_used="llama3.2"
            )

            if conversation.messages.count() == 2:
                try:
                    conversation.generate_title()
                except Exception:
                    pass

            return Response(
                {
                    "content": content,
                    "source": "rag" if context else "chat",
                    "conversation_id": str(conversation_id),
                    "message_id": str(ai_message.id)
                },
                status=status.HTTP_200_OK
            )

        except requests.exceptions.RequestException as e:
            return Response({"error": f"AI model error: {str(e)}"}, status=status.HTTP_502_BAD_GATEWAY)

        except Exception as e:
            print("🔥 ChatView Error:", traceback.format_exc())
            return Response({"error": f"Server error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
