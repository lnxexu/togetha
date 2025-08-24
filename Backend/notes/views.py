from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework import status
from .models import Note, Folder, Tag
from .serializers import NoteSerializer, FolderSerializer, TagSerializer
from server.decorators import api_auth_required
from django.db.models import Q
from logs.views import create_log

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
            # Create logs for folder creation
            create_log(
                user=user,
                action='create',
                entity_type='folder',
                entity_id=serializer.data['id'],
                message=f'Folder "{serializer.data["name"]}" created successfully.'
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
        # Log the failed folder access attempt
        create_log(
            user=user,
            action='access',
            entity_type='folder',
            entity_id=pk,
            level='WARNING',
            message=f'Failed attempt to access non-existent folder (ID: {pk}).'
        )
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = FolderSerializer(folder)  
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        old_name = folder.name
        serializer = FolderSerializer(folder, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()  # No need to pass user again, it's already set
            
            # Log folder update
            create_log(
                user=user,
                action='update',
                entity_type='folder',
                entity_id=folder.id,
                message=f'Folder "{old_name}" updated to "{serializer.data["name"]}".'
            )
            
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        folder_name = folder.name
        folder.delete()
        
        # Log folder deletion
        create_log(
            user=user,
            action='delete',
            entity_type='folder',
            entity_id=pk,
            message=f'Folder "{folder_name}" was deleted.'
        )
        
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
            # Create a log for note creation
            create_log(
                user=user,
                action='create',
                entity_type='note',
                entity_id=serializer.data['id'],
                message=f'Note "{serializer.data["title"]}" created successfully.'
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
        # Log failed note access
        create_log(
            user=user,
            action='access',
            entity_type='note',
            entity_id=pk,
            level='WARNING',
            message=f'Failed attempt to access non-existent note (ID: {pk}).'
        )
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = NoteSerializer(note)
        
        # Log note access
        create_log(
            user=user,
            action='view',
            entity_type='note',
            entity_id=note.id,
            message=f'Note "{note.title}" was accessed.'
        )
        
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        old_title = note.title
        serializer = NoteSerializer(note, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            serializer.save()
            # Create a log for note update
            create_log(
                user=user,
                action='update',
                entity_type='note',
                entity_id=note.id,
                message=f'Note "{old_title}" updated to "{serializer.data["title"]}".'
            )
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        note_title = note.title
        note_id = note.id
        note.delete()
        # Create log for note deletion
        create_log(
            user=user,
            action='delete',
            entity_type='note',
            entity_id=note_id,
            message=f'Note "{note_title}" was deleted.'
        )
        
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_auth_required(['GET', 'POST'])
def tag_list(request):
    """Get list of tags or create a new tag"""
    user = request.user
    
    if request.method == 'GET':
        tags = Tag.objects.filter(user=user)
        serializer = TagSerializer(tags, many=True)
        
        # Log tag list access
        create_log(
            user=user,
            action='list',
            entity_type='tag',
            entity_id=None,
            message='User accessed tag list.'
        )
        
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = TagSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=user)
            
            # Log tag creation
            create_log(
                user=user,
                action='create',
                entity_type='tag',
                entity_id=serializer.data['id'],
                message=f'Tag "{serializer.data["name"]}" created successfully.'
            )
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_auth_required(['GET', 'PUT', 'PATCH', 'DELETE'])
def tag_detail(request, pk):
    """Get, update or delete a tag"""
    user = request.user
    
    try:
        tag = Tag.objects.get(pk=pk, user=user)
    except Tag.DoesNotExist:
        # Log failed tag access
        create_log(
            user=user,
            action='access',
            entity_type='tag',
            entity_id=pk,
            level='WARNING',
            message=f'Failed attempt to access non-existent tag (ID: {pk}).'
        )
        return Response({"error": "Tag not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = TagSerializer(tag)
        
        # Log tag access
        create_log(
            user=user,
            action='view',
            entity_type='tag',
            entity_id=tag.id,
            message=f'Tag "{tag.name}" was accessed.'
        )
        
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        old_name = tag.name
        serializer = TagSerializer(tag, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()
            
            # Log tag update
            create_log(
                user=user,
                action='update',
                entity_type='tag',
                entity_id=tag.id,
                message=f'Tag "{old_name}" updated to "{serializer.data["name"]}".'
            )
            
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        tag_name = tag.name
        tag.delete()
        
        # Log tag deletion
        create_log(
            user=user,
            action='delete',
            entity_type='tag',
            entity_id=pk,
            message=f'Tag "{tag_name}" was deleted.'
        )
        
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
        
        # Log the removal of notes from folders
        create_log(
            user=user,
            action='remove',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            message=f'Removed {updated} notes from their folders.'
        )
        
        return Response({"updated_notes": updated, "folder": None, "action": "removed"}, status=status.HTTP_200_OK)

    # Handle explicit assign/move/add action
    if action in ['assign', 'move', 'add'] and folder_id:
        try:
            folder = Folder.objects.get(pk=folder_id, user=user)
            updated = Note.objects.filter(id__in=note_ids, user=user).update(folder=folder)
            
            # Log moving notes to a folder
            create_log(
                user=user,
                action='organize',
                entity_type='note',
                entity_id=','.join(map(str, note_ids)),
                message=f'Assigned {updated} notes to folder "{folder.name}".'
            )
            
            return Response({
                "updated_notes": updated,
                "folder": FolderSerializer(folder).data,
                "action": "assigned"
            }, status=status.HTTP_200_OK)
        
        except Folder.DoesNotExist:
            # Log failed folder operation
            create_log(
                user=user,
                action='organize',
                entity_type='note',
                entity_id=','.join(map(str, note_ids)),
                level='ERROR',
                message=f'Failed to organize notes: folder (ID: {folder_id}) not found.'
            )
            
            return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)

    # Handle moving to "no folder" (unorganized)
    if folder_id in ['null', 'undefined', None, ''] or folder_id == 0:
        updated = Note.objects.filter(id__in=note_ids, user=user).update(folder=None)
        
        # Log moving notes to unorganized
        create_log(
            user=user,
            action='organize',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            message=f'Moved {updated} notes to unorganized (no folder).'
        )
        
        return Response({"updated_notes": updated, "folder": None}, status=status.HTTP_200_OK)

    # Handle moving to a specific folder
    try:
        folder = Folder.objects.get(pk=folder_id, user=user)
        updated = Note.objects.filter(id__in=note_ids, user=user).update(folder=folder)
        
        # Log moving notes to a folder
        create_log(
            user=user,
            action='organize',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            message=f'Moved {updated} notes to folder "{folder.name}".'
        )
        
        return Response({
            "updated_notes": updated,
            "folder": FolderSerializer(folder).data
        }, status=status.HTTP_200_OK)

    except Folder.DoesNotExist:
        # Log failed folder operation
        create_log(
            user=user,
            action='organize',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            level='ERROR',
            message=f'Failed to organize notes: folder (ID: {folder_id}) not found.'
        )
        
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)

@api_auth_required(['POST'])
def manage_note_tags(request):
    """Add or remove tags from notes"""
    user = request.user
    
    # Get parameters
    note_id = request.data.get('note_id')
    tag_ids = request.data.get('tag_ids', [])
    action = request.data.get('action', '').lower()  # 'add' or 'remove'
    
    if not note_id:
        return Response({"error": "No note specified"}, status=status.HTTP_400_BAD_REQUEST)
    
    if not tag_ids:
        return Response({"error": "No tags specified"}, status=status.HTTP_400_BAD_REQUEST)
    
    if action not in ['add', 'remove']:
        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        note = Note.objects.get(pk=note_id, user=user)
    except Note.DoesNotExist:
        # Log failed note tag operation
        create_log(
            user=user,
            action=f'tag_{action}',
            entity_type='note',
            entity_id=note_id,
            level='WARNING',
            message=f'Failed to {action} tags: note (ID: {note_id}) not found.'
        )
        
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    # Get valid tags that belong to the user
    valid_tags = Tag.objects.filter(id__in=tag_ids, user=user)
    
    if action == 'add':
        # Add tags to note
        for tag in valid_tags:
            note.tags.add(tag)
            
        # Log adding tags to note
        tag_names = ", ".join([tag.name for tag in valid_tags])
        create_log(
            user=user,
            action='tag_add',
            entity_type='note',
            entity_id=note_id,
            message=f'Added tags "{tag_names}" to note "{note.title}".'
        )
        
        serializer = NoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    elif action == 'remove':
        # Remove tags from note
        for tag in valid_tags:
            note.tags.remove(tag)
            
        # Log removing tags from note
        tag_names = ", ".join([tag.name for tag in valid_tags])
        create_log(
            user=user,
            action='tag_remove',
            entity_type='note',
            entity_id=note_id,
            message=f'Removed tags "{tag_names}" from note "{note.title}".'
        )
        
        serializer = NoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_200_OK)

@api_auth_required(['POST'])
def note_share(request):
    """Share a note with another user"""
    user = request.user
    
    # Get parameters
    note_id = request.data.get('note_id')
    recipient_email = request.data.get('recipient_email')
    permission = request.data.get('permission', 'read')  # Default to read-only
    
    if not note_id or not recipient_email:
        return Response({"error": "Note ID and recipient email are required"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        note = Note.objects.get(pk=note_id, user=user)
    except Note.DoesNotExist:
        # Log failed note share
        create_log(
            user=user,
            action='share',
            entity_type='note',
            entity_id=note_id,
            level='WARNING',
            message=f'Failed to share note: note (ID: {note_id}) not found.'
        )
        
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    # Here you would implement your actual sharing logic
    # For now we'll just log it
    
    # Log note sharing
    create_log(
        user=user,
        action='share',
        entity_type='note',
        entity_id=note_id,
        message=f'Note "{note.title}" shared with {recipient_email} with {permission} permission.'
    )
    
    return Response({"success": True, "message": f"Note shared with {recipient_email}"}, status=status.HTTP_200_OK)

@api_auth_required(['POST'])
def bulk_note_action(request):
    """Perform bulk actions on multiple notes"""
    user = request.user
    
    # Get parameters
    note_ids = request.data.get('note_ids', [])
    action = request.data.get('action', '').lower()
    
    if not note_ids:
        return Response({"error": "No notes specified"}, status=status.HTTP_400_BAD_REQUEST)
    
    if action not in ['delete', 'archive', 'unarchive']:
        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get valid notes that belong to the user
    valid_notes = Note.objects.filter(id__in=note_ids, user=user)
    
    if not valid_notes.exists():
        # Log failed bulk action
        create_log(
            user=user,
            action=f'bulk_{action}',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            level='WARNING',
            message=f'Failed to perform bulk {action}: no valid notes found.'
        )
        
        return Response({"error": "No valid notes found"}, status=status.HTTP_404_NOT_FOUND)
    
    count = valid_notes.count()
    
    if action == 'delete':
        # Store note titles for logging before deletion
        note_titles = list(valid_notes.values_list('title', flat=True))
        valid_notes.delete()
        
        # Log bulk deletion
        create_log(
            user=user,
            action='bulk_delete',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            message=f'Bulk deleted {count} notes: {", ".join(note_titles)}'
        )
        
        return Response({"deleted_count": count}, status=status.HTTP_200_OK)
    
    elif action == 'archive':
        valid_notes.update(archived=True)
        
        # Log bulk archiving
        create_log(
            user=user,
            action='bulk_archive',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            message=f'Archived {count} notes.'
        )
        
        return Response({"archived_count": count}, status=status.HTTP_200_OK)
    
    elif action == 'unarchive':
        valid_notes.update(archived=False)
        
        # Log bulk unarchiving
        create_log(
            user=user,
            action='bulk_unarchive',
            entity_type='note',
            entity_id=','.join(map(str, note_ids)),
            message=f'Unarchived {count} notes.'
        )
        
        return Response({"unarchived_count": count}, status=status.HTTP_200_OK)
    
@api_auth_required(['POST'])
def save_drawing(request, note_id):
    """Save drawing strokes for a specific note"""
    try:
        note = get_object_or_404(Note, id=note_id, user=request.user)
        strokes_data = request.data.get('strokes', [])
        
        # Validate strokes data
        if not isinstance(strokes_data, list):
            return Response({
                'error': 'Invalid strokes data format',
                'detail': 'Strokes must be an array'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        note.save_drawing_strokes(strokes_data)
        
        # Create log entry
        create_log(
            user=request.user,
            action='update',
            entity_type='note_drawing',
            entity_id=note.id,
            message=f'Drawing updated for note "{note.title}" with {len(strokes_data)} strokes.'
        )
        
        return Response({
            'message': 'Drawing saved successfully',
            'note_id': note.id,
            'stroke_count': len(strokes_data),
            'last_update': note.last_drawing_update
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': 'Failed to save drawing',
            'detail': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)

@api_auth_required(['GET'])
def get_drawing(request, note_id):
    """Retrieve drawing strokes for a specific note"""
    try:
        note = get_object_or_404(Note, id=note_id, user=request.user)
        
        return Response({
            'note_id': note.id,
            'strokes': note.get_drawing_strokes(),
            'has_drawing': note.has_drawing,
            'last_update': note.last_drawing_update
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': 'Failed to retrieve drawing',
            'detail': str(e)
        }, status=status.HTTP_404_NOT_FOUND)

@api_auth_required(['DELETE'])
def clear_drawing(request, note_id):
    """Clear drawing from a specific note"""
    try:
        note = get_object_or_404(Note, id=note_id, user=request.user)
        
        if not note.has_drawing:
            return Response({
                'message': 'No drawing to clear',
                'note_id': note.id
            }, status=status.HTTP_200_OK)
        
        note.drawing_data = None
        note.has_drawing = False
        note.save()
        
        # Create log entry
        create_log(
            user=request.user,
            action='delete',
            entity_type='note_drawing',
            entity_id=note.id,
            message=f'Drawing cleared from note "{note.title}".'
        )
        
        return Response({
            'message': 'Drawing cleared successfully',
            'note_id': note.id
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': 'Failed to clear drawing',
            'detail': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)