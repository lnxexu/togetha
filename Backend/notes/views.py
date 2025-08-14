from rest_framework.response import Response
from rest_framework import status
from .models import Note, Folder, Tag
from .serializers import NoteSerializer, FolderSerializer, TagSerializer
from server.decorators import api_auth_required
from django.db.models import Q
from notifications.views import create_notification

@api_auth_required(['GET', 'POST'])
def folder_list(request):
    """Get list of folders or create a new folder"""
    # User is guaranteed to be authenticated by the decorator
    user = request.user
        
    if request.method == 'GET':
        folders = Folder.objects.filter(user=user)
        serializer = FolderSerializer(folders, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    elif request.method == 'POST':
        serializer = FolderSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(user=user)
            # Create notification for folder creation
            create_notification(
                user=user,
                notification_type='system',
                title='Folder Created',
                message=f'Your folder "{serializer.data["name"]}" has been created successfully.',
                priority='low'
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_auth_required(['GET', 'PUT', 'PATCH', 'DELETE'])
def folder_detail(request, pk):
    """Get, update or delete a folder"""
    user = request.user
        
    try:
        folder = Folder.objects.get(pk=pk, user=user)
    except Folder.DoesNotExist:
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = FolderSerializer(folder)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = FolderSerializer(folder, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()  # No need to pass user again, it's already set
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        folder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_auth_required(['GET', 'POST'])
def note_list(request):
    """Get list of notes or create a new note"""
    user = request.user
    
    if request.method == 'GET':
        folder_id = request.query_params.get('folder_id', None)
        tag_id = request.query_params.get('tag_id', None)
        search_query = request.query_params.get('search', '')
        
        notes = Note.objects.filter(user=user)
        
        # Apply folder filter
        if folder_id:
            if folder_id == 'null' or folder_id == 'undefined':
                notes = notes.filter(folder__isnull=True)
            else:
                notes = notes.filter(folder_id=folder_id)
        
        # Apply tag filter
        if tag_id:
            notes = notes.filter(tags__id=tag_id)
            
        # Apply search query if provided
        if search_query:
            notes = notes.filter(
                Q(title__icontains=search_query) | 
                Q(content__icontains=search_query)
            )
            
        serializer = NoteSerializer(notes, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = NoteSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(user=user)
            # Create notification for note creation
            create_notification(
                user=user,
                notification_type='note',
                title='New Note Created',
                message=f'You created a new note: "{serializer.data["title"]}"',
                priority='low'
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

@api_auth_required(['GET', 'PUT', 'PATCH', 'DELETE'])
def note_detail(request, pk):
    """Get, update or delete a note"""
    user = request.user
    
    try:
        note = Note.objects.get(pk=pk, user=user)
    except Note.DoesNotExist:
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = NoteSerializer(note)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = NoteSerializer(note, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            serializer.save()
            # Create notification for note update
            create_notification(
                user=user,
                notification_type='note',
                title='Note Updated',
                message=f'Your note "{serializer.data["title"]}" has been updated successfully.',
                action_id=str(note.id),
                priority='low'
            )
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        note.delete()
        # Create notification for note deletion
        create_notification(
            user=user,
            notification_type='note',
            title='Note Deleted',
            message=f'Your note "{note.title}" has been deleted successfully.',
            action_id=str(note.id),
            priority='low'
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_auth_required(['GET', 'POST'])
def tag_list(request):
    """Get list of tags or create a new tag"""
    user = request.user
    
    if request.method == 'GET':
        tags = Tag.objects.filter(user=user)
        serializer = TagSerializer(tags, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = TagSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_auth_required(['GET', 'PUT', 'PATCH', 'DELETE'])
def tag_detail(request, pk):
    """Get, update or delete a tag"""
    user = request.user
    
    try:
        tag = Tag.objects.get(pk=pk, user=user)
    except Tag.DoesNotExist:
        return Response({"error": "Tag not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = TagSerializer(tag)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = TagSerializer(tag, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        tag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# Combine note-folder operations into a single view
@api_auth_required(['POST'])
def manage_note_folders(request):
    user = request.user

    # Get parameters
    folder_id = request.data.get('folder_id')
    note_ids = request.data.get('note_ids', [])
    note_id = request.data.get('note_id')
    action = request.data.get('action', '').lower()  # New: action parameter

    # If specific note_id is provided, convert to list format
    if note_id and not note_ids:
        note_ids = [note_id]

    if not note_ids:
        return Response({"error": "No notes specified"}, status=status.HTTP_400_BAD_REQUEST)

    # Handle explicit remove action (remove notes from any folder)
    if action == 'remove':
        updated = Note.objects.filter(id__in=note_ids, user=user).update(folder=None)
        return Response({"updated_notes": updated, "folder": None, "action": "removed"}, status=status.HTTP_200_OK)

    # Handle moving to "no folder" (unorganized)
    if folder_id in ['null', 'undefined', None, ''] or folder_id == 0:
        updated = Note.objects.filter(id__in=note_ids, user=user).update(folder=None)
        return Response({"updated_notes": updated, "folder": None}, status=status.HTTP_200_OK)

    # Handle moving to a specific folder
    try:
        folder = Folder.objects.get(pk=folder_id, user=user)
        updated = Note.objects.filter(id__in=note_ids, user=user).update(folder=folder)
        return Response({
            "updated_notes": updated,
            "folder": FolderSerializer(folder).data
        }, status=status.HTTP_200_OK)

    except Folder.DoesNotExist:
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
