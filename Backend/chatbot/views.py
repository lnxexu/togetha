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
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
import requests
import os

DOCS_FOLDER = "docs"



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


@api_auth_required(['POST'])
@parser_classes([MultiPartParser, FormParser])
def extract_text_from_images(request):
    if 'image' not in request.FILES:
        return Response({'error': 'No image file provided'}, status=400)
    
    try:
        # Get the uploaded file
        image_file = request.FILES['image']
        
        # Create a temporary file to save the uploaded image
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(image_file.name)[1]) as temp:
            for chunk in image_file.chunks():
                temp.write(chunk)
                
        # Process the image using OCR
        try:
            from PIL import Image
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = r"C:/Program Files/Tesseract-OCR/tesseract.exe"  # Update this path if necessary
            
            image = Image.open(temp.name)
            text = pytesseract.image_to_string(image).strip()
            
            # Clean up the temporary file
            os.unlink(temp.name)
            
            if text:
                return Response({'text': text})
            else:
                return Response({'error': 'No text was detected in the image'}, status=400)
        except Exception as e:
            return Response({'error': f'OCR processing error: {str(e)}'}, status=500)
    except Exception as e:
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
        
        # Generate AI response
        ai_response = generate_ai_response(message_content, conversation)
        
        return Response({
            'user_message': MessageSerializer(user_message).data,
            'ai_response': MessageSerializer(ai_response).data,
            'conversation_id': conversation.id
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