from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework import renderers
from rest_framework.views import APIView
from rest_framework.request import Request
from django.conf import settings
from ..models import Conversation, Message
from .. import rag
from google import genai
import os
import json
import traceback


def sse_event(event: str, data: dict) -> bytes:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


class EventStreamRenderer(renderers.BaseRenderer):
    media_type = 'text/event-stream'
    format = 'event-stream'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # We return a StreamingHttpResponse in the view, so this shouldn't be used.
        # This exists only to satisfy DRF content negotiation for Accept: text/event-stream.
        return data


class ChatStreamView(APIView):
    permission_classes = [IsAuthenticated]
    renderer_classes = [EventStreamRenderer]

    def _run_stream(self, request: Request, content: str | None, conversation_id: str | None):
        def stream():
            try:
                if not content:
                    yield sse_event("error", {"error": "Empty query"})
                    return

                # Conversation handling
                if conversation_id:
                    try:
                        conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
                    except Conversation.DoesNotExist:
                        yield sse_event("error", {"error": "Conversation not found"})
                        return
                else:
                    conversation = Conversation.objects.create(user=request.user, title="New Conversation")
                    conversation_id_local = str(conversation.id)
                    yield sse_event("conversation", {"conversation_id": conversation_id_local})

                # Save user message
                Message.objects.create(
                    conversation=conversation,
                    content=content,
                    message_type='user'
                )

                # System + history
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
                )
                conversation_messages = [{"role": "system", "content": system_prompt}]
                for msg in conversation.messages.order_by('created_at'):
                    conversation_messages.append({
                        "role": "user" if msg.message_type == 'user' else "assistant",
                        "content": msg.content,
                    })

                # RAG context when user mentions docs
                use_rag = any(k in content.lower() for k in ["document", "file", "pdf", "uploaded"])
                context = ""
                if use_rag:
                    try:
                        chunks = rag.search_similar_for_user(content, request.user.id, top_k=3)
                        context = "\n\n".join([c[1] for c in chunks]) if chunks else ""
                    except Exception as e:
                        # RAG failures don't abort the chat
                        yield sse_event("log", {"message": f"RAG failed: {str(e)}"})

                current_query = f"Answer using:\n{context}\n\nUser: {content}" if context else content
                conversation_messages.append({"role": "user", "content": current_query})

                # Combine to single prompt text
                history_text = []
                for m in conversation_messages:
                    if m["role"] == "system":
                        history_text.append(f"System: {m['content']}")
                    elif m["role"] == "user":
                        history_text.append(f"User: {m['content']}")
                    else:
                        history_text.append(f"Assistant: {m['content']}")
                prompt_text = "\n\n".join(history_text)

                # Prepare Google client
                api_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
                if not api_key:
                    yield sse_event("error", {"error": "AI provider not configured. Please set GEMINI_API_KEY on the server."})
                    return
                client = genai.Client(api_key=api_key)
                model = getattr(settings, "GEMINI_MODEL", os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
                fallback_model = getattr(settings, "GEMINI_FALLBACK_MODEL", os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash"))

                # Try to use configured model first
                used_model = model
                try:
                    resp = client.models.generate_content(model=used_model, contents=prompt_text)
                except Exception as api_err:
                    err_text = str(api_err)
                    if (
                        "API key not valid" in err_text
                        or "API_KEY_INVALID" in err_text
                        or "invalid API key" in err_text.lower()
                    ):
                        yield sse_event("error", {"error": "AI provider authentication failed: invalid GEMINI_API_KEY."})
                        return
                    live_like = used_model.endswith("-live") or "live" in used_model
                    requires_streaming = (
                        "stream" in err_text.lower() or "websocket" in err_text.lower() or "realtime" in err_text.lower() or "live" in err_text.lower()
                    )
                    if live_like or requires_streaming:
                        try:
                            used_model = fallback_model
                            resp = client.models.generate_content(model=used_model, contents=prompt_text)
                        except Exception as api_err2:
                            yield sse_event("error", {"error": f"AI provider error: {str(api_err2)}"})
                            return
                    else:
                        yield sse_event("error", {"error": f"AI provider error: {err_text}"})
                        return

                content = getattr(resp, "text", None)
                if not content:
                    try:
                        content = resp.candidates[0].content.parts[0].text
                    except Exception:
                        pass

                if not content:
                    yield sse_event("error", {"error": "No content from AI response"})
                    return

                # Emit incremental chunks to simulate token streaming
                chunk_size = 200
                for i in range(0, len(content), chunk_size):
                    delta = content[i:i + chunk_size]
                    yield sse_event("message", {"delta": delta})

                # Persist assistant message once at the end
                ai_message = Message.objects.create(
                    conversation=conversation,
                    content=content,
                    message_type='assistant',
                    model_used=used_model,
                )

                yield sse_event("end", {
                    "conversation_id": str(conversation.id),
                    "message_id": str(ai_message.id),
                    "source": "rag" if context else "chat",
                })
            except Exception:
                yield sse_event("error", {"error": "Server error", "detail": traceback.format_exc()})

        return StreamingHttpResponse(stream(), content_type="text/event-stream")

    def post(self, request: Request, *args, **kwargs):
        # Accept POST with JSON body
        conversation_id = request.data.get("conversation_id")
        # For compatibility, accept either messages array or a direct content string
        content = request.data.get("content")
        if not content:
            messages = request.data.get("messages", [])
            content = messages[-1].get("content") if messages else None
        return self._run_stream(request, content, conversation_id)

    def get(self, request: Request, *args, **kwargs):
        # Accept GET for EventSource clients (no request body)
        content = request.GET.get("content")
        conversation_id = request.GET.get("conversation_id")
        return self._run_stream(request, content, conversation_id)
