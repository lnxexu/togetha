from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
import requests
import os
from PIL import Image
import pytesseract
from server.decorators import api_auth_required, parser_classes
from django.utils import timezone
from django.db.models import Q
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from .models import Conversation, Message, ChatbotSetting, ConversationFile
from .serializers import ConversationSerializer, MessageSerializer, ChatbotSettingSerializer, ConversationFileSerializer
import tempfile

DOCS_FOLDER = "docs"

from . import rag  # import your rag.py

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"  # Ollama running locally


# ✅ Chat endpoint with optional RAG and conversation saving
class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            messages = request.data.get("messages", [])
            conversation_id = request.data.get("conversation_id", None)
            
            if not messages:
                return Response({"error": "No messages provided"}, status=status.HTTP_400_BAD_REQUEST)

            query_text = messages[-1].get("content", "")
            if not query_text:
                return Response({"error": "Empty query"}, status=status.HTTP_400_BAD_REQUEST)

            # Get or create conversation
            if conversation_id:
                try:
                    conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
                except Conversation.DoesNotExist:
                    return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
            else:
                # Create new conversation
                conversation = Conversation.objects.create(
                    user=request.user,
                    title="New Conversation"
                )
                conversation_id = conversation.id

            # Save user message to database
            user_message = Message.objects.create(
                conversation=conversation,
                content=query_text,
                message_type='user'
            )

            # Build conversation history for Ollama
            conversation_messages = []
            
            # Add system prompt for formatting
            system_prompt = (
                "You are Rina, an AI tutoring assistant. Format your responses with proper markdown:"
                "- Use **bold** for emphasis and important points"
                "- Use *italics* for definitions or explanations"
                "- Use ### for headers and subheaders"
                "- Use bullet points (- ) for lists"
                "- Use numbered lists (1. ) when showing steps"
                "- Use | tables | when presenting data"
                "- Use `code blocks` for technical terms"
                "- Be clear, helpful, and educational in your responses."
                "- ALWAYS refer to the CURRENT CONVERSATION THREAD"
                "- NEVER reference previous conversations or topics outside this thread"
                "- If you don't know the answer, say 'I'm not sure about that. Could you please clarify or provide more details?'"
                "- If the user asks for 'more examples', 'another example', 'give me more', or similar, refer to YOUR LAST RESPONSE in this conversation"
                "- If asked to summarize, explain, or generate quizzes, refer to YOUR PREVIOUS MESSAGE in this conversation"
                "- Stay focused ONLY on the current conversation thread"
                ""
                "IMPORTANT CONTEXT RULES:"
                "- When users ask for 'more examples', 'another example', 'give me more', or similar, refer to YOUR LAST RESPONSE in this conversation"
                "- When asked to summarize, explain, or generate quizzes, refer to YOUR PREVIOUS MESSAGE in this conversation"
                "- Do NOT reference examples or content from previous conversations or different topics"
                "- Stay focused ONLY on the current conversation thread"

            )
            conversation_messages.append({"role": "system", "content": system_prompt})
            
            # Get existing messages from database for context (excluding the just-saved user message to avoid duplication)
            if conversation_id:
                existing_messages = Message.objects.filter(
                    conversation=conversation
                ).exclude(id=user_message.id).order_by('created_at')
                
                for msg in existing_messages:
                    conversation_messages.append({
                        "role": "user" if msg.message_type == 'user' else "assistant",
                        "content": msg.content
                    })
            
            # Try RAG search only if the query seems to reference documents or uploaded content
            # Skip RAG for conversational queries like "more examples", "explain", "yes", etc.
            use_rag = False
            rag_keywords = ["document", "file", "pdf", "uploaded", "based on", "according to", "from the"]
            exclude_rag_keywords = ["more example", "another example", "give me more", "explain", "summarize", "yes", "no", "tell me more", "continue"]
            
            query_lower = query_text.lower()
            
            # Check if query contains RAG keywords and doesn't contain exclusion keywords
            if any(keyword in query_lower for keyword in rag_keywords) and not any(exclude in query_lower for exclude in exclude_rag_keywords):
                use_rag = True
            
            context = ""
            if use_rag:
                try:
                    # Only search for chunks related to this user's files
                    similar_chunks = rag.search_similar_for_user(query_text, request.user.id, top_k=3)
                    context = "\n\n".join([txt for _, txt, _ in similar_chunks]) if similar_chunks else ""
                    print(f"RAG search for user {request.user.id}: Found {len(similar_chunks)} relevant chunks")
                except Exception as e:
                    print(f"RAG search failed: {e}")
                    context = ""
            current_query = query_text
            if context:
                current_query = f"Answer based on the following context:\n{context}\n\nUser: {query_text}"
            
            # Add the current user message to the conversation
            conversation_messages.append({"role": "user", "content": current_query})

            print(f"Conversation {conversation_id}: Sending {len(conversation_messages)} messages to Ollama")
            print(f"Messages preview: {[(msg['role'], msg['content'][:50] + '...') for msg in conversation_messages[-3:]]}")

            # Send to Ollama with full conversation history
            payload = {
                "model": "llama3.2",
                "messages": conversation_messages,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_tokens": 2048
                }
            }

            print(f"Sending to Ollama: {len(conversation_messages)} messages")
            response = requests.post(OLLAMA_URL, json=payload, timeout=120)
            response.raise_for_status()
            ollama_reply = response.json()

            # Extract content from response
            content = ollama_reply.get("message", {}).get("content") or ollama_reply.get("content")
            
            if not content:
                raise Exception("No content received from Ollama")

            # Save AI response to database
            ai_message = Message.objects.create(
                conversation=conversation,
                content=content,
                message_type='assistant',
                model_used="llama3.2"
            )

            # Update conversation title if it's the first exchange
            if conversation.messages.count() == 2:  # user + assistant message
                try:
                    conversation.generate_title()
                except Exception as e:
                    print(f"Title generation failed: {e}")

            return Response(
                {
                    "content": content, 
                    "source": "rag" if context else "chat",
                    "conversation_id": str(conversation_id),
                    "message_id": str(ai_message.id)
                },
                status=status.HTTP_200_OK,
            )

        except requests.exceptions.Timeout:
            return Response({"error": "Request timed out. The AI model is taking too long to respond."}, status=status.HTTP_502_BAD_GATEWAY)
        
        except requests.exceptions.ConnectionError:
            return Response({"error": "Cannot connect to AI model. Please ensure Ollama is running."}, status=status.HTTP_502_BAD_GATEWAY)
        
        except requests.exceptions.RequestException as e:
            print(f"Ollama request error: {e}")
            return Response({"error": f"AI model error: {str(e)}"}, status=status.HTTP_502_BAD_GATEWAY)

        except Exception as e:
            import traceback
            print("🔥 ChatView Error:", traceback.format_exc())
            return Response({"error": f"Server error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ✅ PDF upload endpoint with embedding and conversation linking
class PDFUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get("file")
        conversation_id = request.data.get("conversation_id", None)
        
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create conversation
        conversation = None
        if conversation_id:
            try:
                conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
            except Conversation.DoesNotExist:
                return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)

        # Save file inside chatbot/upload
        save_dir = os.path.join(settings.BASE_DIR, "chatbot", "upload")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, file_obj.name)

        with open(save_path, "wb+") as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)

        # Create file record
        conversation_file = ConversationFile.objects.create(
            conversation=conversation,
            file_name=file_obj.name,
            file_path=save_path,
            file_type=file_obj.content_type or 'application/pdf',
            file_size=file_obj.size,
            processing_status='processing'
        )

        try:
            # Step 1: Extract text
            full_text = rag.extract_text_from_pdf(save_path)

            # Step 2: Chunk text
            chunks = rag.chunk_text(full_text)

            # Step 3: Embed and save with user and conversation context
            embeddings = rag.embed_texts(chunks)
            rag.save_chunks(
                chunks, 
                embeddings, 
                user_id=request.user.id, 
                conversation_id=str(conversation.id) if conversation else None,
                document_name=file_obj.name
            )

            # Update file record
            conversation_file.is_processed = True
            conversation_file.processing_status = 'completed'
            conversation_file.extracted_text = full_text[:1000]  # Store first 1000 chars for preview
            conversation_file.save()

            return Response(
                {
                    "message": f"File '{file_obj.name}' processed and embeddings stored.",
                    "file_id": str(conversation_file.id),
                    "conversation_id": str(conversation.id) if conversation else None
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            # Update file record with error
            conversation_file.processing_status = 'failed'
            conversation_file.save()
            return Response(
                {"error": f"Failed to process file: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@api_auth_required(['POST'])
@parser_classes([MultiPartParser, FormParser])
def extract_text_from_images(request):
    if 'image' not in request.FILES:
        return Response({'error': 'No image file provided'}, status=400)
    
    try:
        # Get the uploaded file
        image_file = request.FILES['image']
        conversation_id = request.data.get('conversation_id', None)
        auto_send_to_chat = request.data.get('auto_send_to_chat', 'false').lower() == 'true'
        
        # Create a temporary file to save the uploaded image
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(image_file.name)[1]) as temp:
            for chunk in image_file.chunks():
                temp.write(chunk)
                
        # Process the image using OCR
        try:
            from PIL import Image
            import pytesseract
            
            # Try different potential Tesseract paths
            tesseract_paths = [
                r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
                r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
                "/usr/bin/tesseract",
                "/usr/local/bin/tesseract"
            ]
            
            tesseract_found = False
            for path in tesseract_paths:
                if os.path.exists(path):
                    pytesseract.pytesseract.tesseract_cmd = path
                    tesseract_found = True
                    break
            
            if not tesseract_found:
                # Try to use system PATH
                import shutil
                if shutil.which('tesseract'):
                    pytesseract.pytesseract.tesseract_cmd = 'tesseract'
                    tesseract_found = True
            
            if not tesseract_found:
                return Response({'error': 'Tesseract OCR not found. Please install Tesseract-OCR.'}, status=500)
            
            image = Image.open(temp.name)
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
                
            # Enhanced OCR with multiple configurations for better accuracy
            configs = [
                '--psm 6',  # Uniform block of text
                '--psm 3',  # Fully automatic page segmentation
                '--psm 4',  # Single column of text
                '--psm 8',  # Single word
            ]
            
            best_text = ""
            best_confidence = 0
            
            for config in configs:
                try:
                    text = pytesseract.image_to_string(image, config=config).strip()
                    if len(text) > len(best_text):
                        best_text = text
                except:
                    continue
            
            # Clean up the temporary file
            os.unlink(temp.name)
            
            if best_text:
                # If auto_send_to_chat is enabled and conversation_id is provided, send to chat
                if auto_send_to_chat and conversation_id:
                    try:
                        # Create a chat request with the extracted text
                        chat_data = {
                            "messages": [{"role": "user", "content": f"Please analyze this extracted text: {best_text}"}],
                            "conversation_id": conversation_id
                        }
                        
                        # Create a mock request for the chat view
                        from django.test import RequestFactory
                        from django.contrib.auth.models import AnonymousUser
                        
                        factory = RequestFactory()
                        chat_request = factory.post('/api/chatbot/chat/', chat_data, content_type='application/json')
                        chat_request.user = request.user
                        
                        # Call the chat view
                        chat_view = ChatView()
                        chat_response = chat_view.post(chat_request)
                        
                        return Response({
                            'text': best_text,
                            'chat_response': chat_response.data if hasattr(chat_response, 'data') else None,
                            'auto_sent_to_chat': True
                        })
                        
                    except Exception as e:
                        print(f"Auto-send to chat failed: {e}")
                        return Response({
                            'text': best_text,
                            'auto_sent_to_chat': False,
                            'error': f'OCR successful but failed to send to chat: {str(e)}'
                        })
                
                return Response({'text': best_text, 'auto_sent_to_chat': False})
            else:
                return Response({'error': 'No text was detected in the image'}, status=400)
                
        except Exception as e:
            print(f"OCR processing error: {e}")
            # Clean up the temporary file if it exists
            try:
                os.unlink(temp.name)
            except:
                pass
            return Response({'error': f'OCR processing error: {str(e)}'}, status=500)
            
    except Exception as e:
        print(f"Image upload error: {e}")
        return Response({'error': f'Server error: {str(e)}'}, status=500)

class ConversationViewSet(APIView):
    """
    Combined view for handling conversations
    """
    def get_permissions(self):
        return [IsAuthenticated()]
    
    def get_authenticators(self):
        return [TokenAuthentication(), SessionAuthentication()]
    
    def get(self, request, pk=None):
        user = request.user
        
        # List view
        if not pk:
            filter_type = request.query_params.get('filter', 'all')
            search_query = request.query_params.get('search', '')
            
            conversations = Conversation.objects.filter(user=user)
            
            # Apply filters
            if filter_type == 'archived':
                conversations = conversations.filter(is_archived=True)
            elif filter_type == 'pinned':
                conversations = conversations.filter(is_pinned=True)
            elif filter_type == 'active':
                conversations = conversations.filter(is_archived=False)
            elif filter_type == 'recent':
                today = timezone.now().date()
                conversations = conversations.filter(updated_at__date=today)
            
            # Apply search
            if search_query:
                conversations = conversations.filter(
                    Q(title__icontains=search_query) | 
                    Q(messages__content__icontains=search_query)
                ).distinct()
                
            serializer = ConversationSerializer(conversations, many=True)
            return Response(serializer.data)
        
        # Detail view
        try:
            conversation = Conversation.objects.get(pk=pk, user=user)
            serializer = ConversationSerializer(conversation)
            return Response(serializer.data)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request):
        """Create a new conversation"""
        serializer = ConversationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def put(self, request, pk):
        """Update conversation details"""
        try:
            conversation = Conversation.objects.get(pk=pk, user=request.user)
            serializer = ConversationSerializer(conversation, data=request.data)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    def patch(self, request, pk):
        """Partially update conversation"""
        try:
            conversation = Conversation.objects.get(pk=pk, user=request.user)
            serializer = ConversationSerializer(conversation, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    def delete(self, request, pk):
        """Delete a conversation"""
        try:
            conversation = Conversation.objects.get(pk=pk, user=request.user)
            conversation.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)

@api_auth_required(['GET', 'PUT'])
def chatbot_settings(request):
    """Get or update the user's chatbot settings"""
    user = request.user
    
    # Get or create settings
    settings, created = ChatbotSetting.objects.get_or_create(user=user)
    
    if request.method == 'GET':
        serializer = ChatbotSettingSerializer(settings)
        return Response(serializer.data)
    
    elif request.method == 'PUT':
        serializer = ChatbotSettingSerializer(settings, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_auth_required(['POST'])
def message_actions(request, message_id=None):
    """Combined view for message-related actions"""
    user = request.user
    action = request.data.get('action', '')
    
    # Feedback for a specific message
    if message_id and action == 'feedback':
        try:
            message = Message.objects.get(pk=message_id, conversation__user=user)
            message.was_helpful = request.data.get('was_helpful')
            message.feedback = request.data.get('feedback', '')
            message.save()
            return Response(MessageSerializer(message).data)
        except Message.DoesNotExist:
            return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)
    
    # Generate AI response to user message
    if action == 'send_message':
        message_content = request.data.get('message', '').strip()
        conversation_id = request.data.get('conversation_id')
        
        if not message_content:
            return Response({'error': 'Message content cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create conversation
        if conversation_id:
            try:
                conversation = Conversation.objects.get(pk=conversation_id, user=user)
            except Conversation.DoesNotExist:
                return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
        else:
            conversation = Conversation.objects.create(user=user, title='New conversation')
        
        # Create user message
        user_message = Message.objects.create(
            conversation=conversation,
            content=message_content,
            message_type='user'
        )
        
        # For now, return the user message (AI response is handled by ChatView)
        return Response({
            'user_message': MessageSerializer(user_message).data,
            'conversation_id': conversation.id,
            'message': 'Message saved. Use ChatView for AI responses.'
        }, status=status.HTTP_201_CREATED)
    
    # Clear all conversations
    elif action == 'clear_all':
        deleted = Conversation.objects.filter(user=user).delete()
        return Response({"message": f"Deleted {deleted[0]} conversations"})
    
    # Generate title for conversation
    elif action == 'generate_title':
        conversation_id = request.data.get('conversation_id')
        try:
            conversation = Conversation.objects.get(pk=conversation_id, user=user)
            title = conversation.generate_title()
            return Response({"title": title})
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)

@api_auth_required(['GET'])
def get_messages(request):
    """Get messages for a conversation"""
    user = request.user
    conversation_id = request.query_params.get('conversation_id')
    
    if not conversation_id:
        # Get the most recent conversation or create one
        conversation = Conversation.objects.filter(user=user).order_by('-updated_at').first()
        if not conversation:
            conversation = Conversation.objects.create(user=user, title='New conversation')
    else:
        try:
            conversation = Conversation.objects.get(pk=conversation_id, user=user)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    messages = Message.objects.filter(conversation=conversation).order_by('created_at')
    serializer = MessageSerializer(messages, many=True)
    
    return Response({
        'conversation': ConversationSerializer(conversation).data,
        'messages': serializer.data
    })


class MessageViewSet(APIView):
    """Handle individual message operations like deletion"""
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, pk):
        """Delete a specific message"""
        try:
            message = Message.objects.get(
                pk=pk, 
                conversation__user=request.user
            )
            
            # Store conversation for potential cleanup
            conversation = message.conversation
            
            # Delete the message
            message.delete()
            
            # If this was the last message, update conversation timestamp
            if conversation.messages.count() == 0:
                conversation.save()  # This updates the updated_at field
            
            return Response({"message": "Message deleted successfully"}, status=status.HTTP_204_NO_CONTENT)
            
        except Message.DoesNotExist:
            return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)