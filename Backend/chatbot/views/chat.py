from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from .. import rag
from ..models import Conversation, Message
from ..models import DocumentChunk
import traceback
import os
from google import genai

# Configure Gemini API
GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY"))
GEMINI_MODEL = getattr(settings, "GEMINI_MODEL", os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
GEMINI_MODEL_CANDIDATES = getattr(settings, "GEMINI_MODEL_CANDIDATES", [])
# Do not create a global client with a possibly missing/invalid key; create per-request.
GENAI_CLIENT = None

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

            # Optional doc restriction provided by client (e.g., uploaded doc context)
            doc_ids = request.data.get("doc_ids", []) or []
            if isinstance(doc_ids, str):
                # Accept comma-separated string too
                doc_ids = [d for d in doc_ids.split(",") if d]

            # Determine if we should bypass medical-only restriction
            attachments_exist = conversation.attached_files.exists()

            # If no explicit doc_ids, try to derive from conversation's attached files
            if not doc_ids and attachments_exist:
                try:
                    attached_names = list(conversation.attached_files.values_list('file_name', flat=True))
                    if attached_names:
                        derived_ids = (
                            DocumentChunk.objects
                            .filter(user_id=request.user.id, document_name__in=attached_names)
                            .values_list('doc_id', flat=True)
                            .distinct()
                        )
                        doc_ids = [str(d) for d in derived_ids if d]
                except Exception:
                    doc_ids = doc_ids  # leave unchanged if any error

            # RAG context check: trigger if keywords, attachments exist, or explicit doc_ids provided
            use_rag = bool(doc_ids) or attachments_exist or any(
                k in query_text.lower() for k in ["document", "file", "pdf", "uploaded"]
            )

            context = ""
            if use_rag:
                try:
                    # Prefer restricting to specific documents if provided
                    if doc_ids:
                        chunks = rag.search_similar_for_user_in_docs(query_text, request.user.id, doc_ids, top_k=3)
                    else:
                        chunks = rag.search_similar_for_user(query_text, request.user.id, top_k=3)

                    # chunks is a list of dicts with keys: chunk_text, distance, similarity, etc.
                    context = "\n\n".join([c.get("chunk_text", "") for c in chunks if c.get("chunk_text")]) if chunks else ""
                except Exception as e:
                    print("RAG failed:", e)

            bypass_medical = attachments_exist or bool(doc_ids) or (use_rag and bool(context))

            # Prepare system + history with conditional topic policy
            rules = [
                "ALWAYS refer to the CURRENT CONVERSATION THREAD only",
                # Topic policy: restrictive when not using docs, lenient otherwise
                (
                    "You may discuss any topic when it is grounded in or necessary to analyze the referenced or uploaded document(s); do not restrict to medical topics when documents are provided or RAG context is used."
                    if bypass_medical
                    else "Reject any context outside non-medical topics then remind to stay on medical related topics"
                ),
                "Include references if the response is based on online sources",
                "When files are attached to a message, they are specific to THAT message",
                "When users ask for 'more examples' or 'explain further', refer to YOUR LAST RESPONSE in this conversation",
                "When asked to summarize or generate quizzes, refer to YOUR PREVIOUS MESSAGE in this conversation",
                "If document is uploaded, they are available for analysis throughout the conversation and bypass the rule of only discussing medical topics",
                "Never reference previous conversations or unrelated topics",
                "If you don't have enough context, ask for clarification",
            ]

            formatting = [
                "Use **bold** for emphasis and important points",
                "Use *italics* for definitions or explanations",
                "Use ### for headers and subheaders",
                "Use bullet points (- ) for lists",
                "Use numbered lists (1. ) when showing steps",
                "Use | tables | when presenting data",
                "Use `code blocks` for technical terms",
                "Be clear, helpful, and educational in your responses.",
            ]

            system_prompt = (
                "You are an AI tutoring assistant. Format your responses with proper markdown:\n- "
                + "\n- ".join(formatting)
                + "\n\nCONTEXT HANDLING RULES:\n- "
                + "\n- ".join(rules)
                + "\n\nFILE HANDLING:\n- "
                + "\n- ".join([
                    "When text is extracted from images (OCR), treat it as direct content from the user and ignore it as the pytesseract source will be processed separately",
                    "When documents are uploaded, they become part of the knowledge base for this conversation",
                    "Always acknowledge when you're referencing uploaded content",
                    "If files failed to upload, work with the available information",
                ])
            )
            conversation_messages = [{"role": "system", "content": system_prompt}]
            for msg in conversation.messages.exclude(id=user_message.id).order_by('created_at'):
                conversation_messages.append({
                    "role": "user" if msg.message_type == 'user' else "assistant",
                    "content": msg.content
                })

            current_query = f"Answer using:\n{context}\n\nUser: {query_text}" if context else query_text
            conversation_messages.append({"role": "user", "content": current_query})

            # Compose prompt for Gemini (single-shot with context and history)
            history_text = []
            for m in conversation_messages:
                if m["role"] == "system":
                    history_text.append(f"System: {m['content']}")
                elif m["role"] == "user":
                    history_text.append(f"User: {m['content']}")
                else:
                    history_text.append(f"Assistant: {m['content']}")

            prompt_text = "\n\n".join(history_text)

            # Ensure API key exists
            api_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
            if not api_key:
                return Response({
                    "error": "AI provider not configured. Please set GEMINI_API_KEY on the server."
                }, status=status.HTTP_400_BAD_REQUEST)

            # Create client per request to reflect current configuration
            client = genai.Client(api_key=api_key)

            # Try candidates in order with graceful fallback
            errors = []
            used_model = None
            candidates = []
            # Ensure primary model is first, then configured candidates
            seen = set()
            for m in [GEMINI_MODEL] + list(GEMINI_MODEL_CANDIDATES):
                if m and m not in seen:
                    candidates.append(m)
                    seen.add(m)

            gemini_resp = None
            for model_name in candidates:
                try:
                    gemini_resp = client.models.generate_content(model=model_name, contents=prompt_text)
                    used_model = model_name
                    break
                except Exception as api_err:
                    err_text = str(api_err)
                    # Invalid API key -> immediate 400
                    if (
                        "API key not valid" in err_text
                        or "API_KEY_INVALID" in err_text
                        or "invalid api key" in err_text.lower()
                    ):
                        return Response({
                            "error": "AI provider authentication failed: invalid GEMINI_API_KEY. Contact an administrator."
                        }, status=status.HTTP_400_BAD_REQUEST)
                    # Limit/rate/quota -> try next candidate
                    if any(k in err_text.lower() for k in [
                        "rate limit", "quota", "exceeded", "resource exhausted", "insufficient"
                    ]):
                        errors.append((model_name, err_text))
                        continue
                    # Invalid model or not found -> try next
                    if any(k in err_text.lower() for k in ["not found", "invalid model", "unknown model"]):
                        errors.append((model_name, err_text))
                        continue
                    # Other errors -> try next but record
                    errors.append((model_name, err_text))
                    continue
            if gemini_resp is None:
                last = errors[-1][1] if errors else "No candidates available"
                return Response({"error": f"AI provider error: {last}"}, status=status.HTTP_502_BAD_GATEWAY)
            content = getattr(gemini_resp, "text", None)
            if not content:
                try:
                    content = gemini_resp.candidates[0].content.parts[0].text
                except Exception:
                    content = None
            if not content:
                raise Exception("No content from Gemini response")

            ai_message = Message.objects.create(
                conversation=conversation,
                content=content,
                message_type='assistant',
                model_used=used_model or GEMINI_MODEL
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

        except Exception as e:
            print("🔥 ChatView Error:", traceback.format_exc())
            return Response({"error": f"Server error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
