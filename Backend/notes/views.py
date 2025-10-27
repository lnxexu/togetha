from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from .models import Note, Folder
from .serializers import NoteSerializer, FolderSerializer
from server.decorators import api_auth_required
from django.db.models import Q
from logs.views import create_log
from django.utils import timezone

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
                message=f'Folder "{serializer.data["name"]}" created successfully.',
                request=request
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
            message=f'Failed attempt to access non-existent folder (ID: {pk}).',
            request=request
        )
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = FolderSerializer(folder)  
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        old_name = folder.name
        serializer = FolderSerializer(folder, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()
            
            # Log folder update
            create_log(
                user=user,
                action='update',
                entity_type='folder',
                entity_id=folder.id,
                message=f'Folder "{old_name}" updated to "{serializer.data["name"]}".',
                request=request
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
            message=f'Folder "{folder_name}" was deleted.',
            request=request
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
            
        serializer = NoteSerializer(notes, many=True, context={'request': request})
        return Response(serializer.data)
    
    elif request.method == 'POST':
        # Check for potential duplicates based on title and recent creation time (within last 5 seconds)
        from django.utils import timezone
        from datetime import timedelta
        
        # Remove any client-provided ID from the data to prevent UUID validation errors
        # The backend will always generate its own UUID for new notes
        request_data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if 'id' in request_data:
            # Client sent an ID (likely a local temporary ID), ignore it
            del request_data['id']
        
        # Ensure title is never completely empty - provide default
        title = request_data.get('title', '').strip()
        if not title:
            request_data['title'] = 'Untitled Note'
            title = 'Untitled Note'
        
        # Check for potential duplicate creations occurring in a short burst (e.g., autosave + back)
        if title:
            five_seconds_ago = timezone.now() - timedelta(seconds=5)
            existing_note = Note.objects.filter(
                user=user,
                title=title,
                created_at__gte=five_seconds_ago
            ).first()
            
            if existing_note:
                # Return the existing note instead of creating a duplicate
                serializer = NoteSerializer(existing_note, context={'request': request})
                return Response({
                    **serializer.data,
                    'message': 'Note already exists, returning existing note'
                }, status=status.HTTP_200_OK)
        
        serializer = NoteSerializer(data=request_data, context={'request': request})
        if serializer.is_valid():
            note = serializer.save(user=user, last_modified_by=user)
            # Create a log for note creation
            create_log(
                user=user,
                action='create',
                entity_type='note',
                entity_id=serializer.data['id'],
                message=f'Note "{serializer.data["title"]}" created successfully.',
                request=request
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

@api_auth_required(['GET', 'PUT', 'PATCH', 'DELETE'])
def note_detail(request, pk):
    """Get, update or delete a note"""
    user = request.user
    
    # Check if the pk is a valid UUID format
    import re
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)
    if not uuid_pattern.match(str(pk)):
        # Not a valid UUID - this is likely a temporary local ID from the client
        # The client should create the note first, which will return a server-generated UUID
        return Response({
            "error": "Invalid note ID format",
            "detail": "Please create the note first to get a valid server ID"
        }, status=status.HTTP_400_BAD_REQUEST)
    
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
            message=f'Failed attempt to access non-existent note (ID: {pk}).',
            request=request
        )
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        # Update last_accessed when a note is viewed
        note.last_accessed = timezone.now()
        note.save(update_fields=['last_accessed'])
        serializer = NoteSerializer(note, context={'request': request})
        
        # Log note access
        create_log(
            user=user,
            action='view',
            entity_type='note',
            entity_id=note.id,
            message=f'Note "{note.title}" was accessed.',
            request=request
        )
        
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        old_title = note.title
        current_version = note.version
        
        # Check for version conflicts if version is provided in request
        provided_version = request.data.get('version')
        if provided_version is not None and int(provided_version) != current_version:
            return Response({
                "error": "Version conflict detected",
                "current_version": current_version,
                "provided_version": provided_version,
                "message": "This note has been modified by another session. Please refresh and try again."
            }, status=status.HTTP_409_CONFLICT)
        
        serializer = NoteSerializer(note, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            # Check if this is an auto-save request
            is_auto_save = request.data.get('is_auto_save', False)
            
            # Set last_modified_by to current user and pass auto-save flag
            serializer.save(last_modified_by=user, is_auto_save=is_auto_save)
            
            # Create a log for note update (less verbose for auto-saves)
            if is_auto_save:
                create_log(
                    user=user,
                    action='auto_save',
                    entity_type='note',
                    entity_id=note.id,
                    level='DEBUG',
                    message=f'Note "{note.title}" auto-saved.',
                    request=request
                )
            else:
                create_log(
                    user=user,
                    action='update',
                    entity_type='note',
                    entity_id=note.id,
                    message=f'Note "{old_title}" updated to "{serializer.data["title"]}".',
                    request=request
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
            message=f'Note "{note_title}" was deleted.',
            request=request
        )
        
        return Response(status=status.HTTP_204_NO_CONTENT)

# Combine note-folder operations into a single view
@api_auth_required(['POST'])
def manage_note_folders(request):
    user = request.user
    folder_id = request.data.get('folder_id')
    note_ids = request.data.get('note_ids', [])
    note_id = request.data.get('note_id')
    action = request.data.get('action', '').lower() 

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
            message=f'Removed {updated} notes from their folders.',
            request=request
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
                message=f'Assigned {updated} notes to folder "{folder.name}".',
                request=request
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
                message=f'Failed to organize notes: folder (ID: {folder_id}) not found.',
                request=request
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
            message=f'Moved {updated} notes to unorganized (no folder).',
            request=request
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
            message=f'Moved {updated} notes to folder "{folder.name}".',
            request=request
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
            message=f'Failed to organize notes: folder (ID: {folder_id}) not found.',
            request=request
        )
        
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)

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
            message=f'Failed to share note: note (ID: {note_id}) not found.',
            request=request
        )
        
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    # Log note sharing
    create_log(
        user=user,
        action='share',
        entity_type='note',
        entity_id=note_id,
        message=f'Note "{note.title}" shared with {recipient_email} with {permission} permission.',
        request=request
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
            message=f'Failed to perform bulk {action}: no valid notes found.',
            request=request
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
            message=f'Bulk deleted {count} notes: {", ".join(note_titles)}',
            request=request
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
            message=f'Archived {count} notes.',
            request=request
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
            message=f'Unarchived {count} notes.',
            request=request
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
            message=f'Drawing updated for note "{note.title}" with {len(strokes_data)} strokes.',
            request=request
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
        # Touch last_accessed when retrieving drawing
        note.last_accessed = timezone.now()
        note.save(update_fields=['last_accessed'])
        
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
            message=f'Drawing cleared from note "{note.title}".',
            request=request
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


@api_auth_required(['POST'])
def upload_document(request):
    """Upload a document and create a note"""
    user = request.user
    
    try:
        # Get the uploaded file
        document = request.FILES.get('document')
        if not document:
            return Response({
                'error': 'No document file provided'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate file type
        allowed_types = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/rtf'
        ]
        
        if document.content_type not in allowed_types:
            return Response({
                'error': f'Unsupported file type: {document.content_type}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Extract document metadata
        document_metadata = {
            'file_name': document.name,
            'file_size': document.size,
            'content_type': document.content_type,
            'page_count': 1  # Default for non-PDF files
        }
        
        # Extract PDF-specific metadata
        if document.content_type == 'application/pdf':
            try:
                import PyPDF2
                import io
                
                # Reset file pointer to beginning
                document.seek(0)
                
                # Create a PDF reader from the uploaded file
                pdf_bytes = document.read()
                pdf_file = io.BytesIO(pdf_bytes)
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                
                # Extract page count
                document_metadata['page_count'] = len(pdf_reader.pages)
                
                # Extract additional PDF metadata if available
                if pdf_reader.metadata:
                    pdf_info = pdf_reader.metadata
                    if '/Title' in pdf_info:
                        document_metadata['pdf_title'] = pdf_info['/Title']
                    if '/Author' in pdf_info:
                        document_metadata['pdf_author'] = pdf_info['/Author']
                    if '/Subject' in pdf_info:
                        document_metadata['pdf_subject'] = pdf_info['/Subject']
                    if '/Creator' in pdf_info:
                        document_metadata['pdf_creator'] = pdf_info['/Creator']
                
                # Use the pdf_bytes as file content
                file_content = pdf_bytes
                
            except Exception as e:
                # If PDF processing fails, continue with default metadata
                print(f"Error processing PDF metadata: {e}")
                document_metadata['page_count'] = 1
                document_metadata['metadata_error'] = str(e)
                # Read file content normally
                document.seek(0)
                file_content = document.read()
        else:
            # Read file content for non-PDF files
            document.seek(0)
            file_content = document.read()
        
        # Create note data
        title = request.data.get('title', document.name)
        content = request.data.get('content', '')  # Default to empty content for documents
        folder_id = request.data.get('folder')
        
        # Read file content
        file_content = document.read()
        
        # Create the note
        note_data = {
            'title': title,
            'content': content,
            'type': 'document',
            'document_content': file_content,
            'document_filename': document.name,
            'document_content_type': document.content_type,
            'document_metadata': document_metadata,
            'last_accessed': timezone.now(),
        }
        
        if folder_id:
            try:
                folder = Folder.objects.get(id=folder_id, user=user)
                note_data['folder'] = folder
            except Folder.DoesNotExist:
                pass  # Ignore invalid folder ID
        
        # Create note with document
        note = Note.objects.create(user=user, **note_data)
        
        # Log the document upload
        create_log(
            user=user,
            action='create',
            entity_type='document',
            entity_id=note.id,
            message=f'Document "{document.name}" uploaded successfully.',
            request=request
        )
        
        serializer = NoteSerializer(note, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response({
            'error': 'Failed to upload document',
            'detail': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_auth_required(['GET', 'POST', 'PUT'])
def document_annotations(request, note_id):
    """Handle document annotations"""
    user = request.user
    
    try:
        note = Note.objects.get(id=note_id, user=user, type='document')
    except Note.DoesNotExist:
        return Response({
            'error': 'Document note not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        # Get existing annotations
        annotations = note.document_annotations or []
        return Response({
            'annotations': annotations,
            'note_id': note.id
        }, status=status.HTTP_200_OK)
    
    elif request.method == 'POST':
        # Add new annotation
        annotation_data = request.data
        
        if not note.document_annotations:
            note.document_annotations = []
        
        # Add timestamp and ID to annotation
        import uuid
        from django.utils import timezone as dj_timezone
        
        annotation_data['id'] = str(uuid.uuid4())
        annotation_data['created_at'] = dj_timezone.now().isoformat()
        
        note.document_annotations.append(annotation_data)
        note.save()
        
        # Log annotation creation
        create_log(
            user=user,
            action='create',
            entity_type='annotation',
            entity_id=note.id,
            message=f'Annotation added to document "{note.title}".',
            request=request
        )
        
        return Response({
            'message': 'Annotation added successfully',
            'annotation': annotation_data
        }, status=status.HTTP_201_CREATED)
    
    elif request.method == 'PUT':
        # Update all annotations
        annotations = request.data.get('annotations', [])
        note.document_annotations = annotations
        note.save()
        
        # Log annotation update
        create_log(
            user=user,
            action='update',
            entity_type='annotation',
            entity_id=note.id,
            message=f'Annotations updated for document "{note.title}".',
            request=request
        )
        
        return Response({
            'message': 'Annotations updated successfully',
            'annotations': annotations
        }, status=status.HTTP_200_OK)


@api_auth_required(['DELETE'])
def delete_annotation(request, note_id, annotation_id):
    """Delete a specific annotation"""
    user = request.user
    
    try:
        note = Note.objects.get(id=note_id, user=user, type='document')
    except Note.DoesNotExist:
        return Response({
            'error': 'Document note not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    if not note.document_annotations:
        return Response({
            'error': 'No annotations found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Find and remove the annotation
    annotations = note.document_annotations
    original_count = len(annotations)
    annotations = [ann for ann in annotations if ann.get('id') != annotation_id]
    
    if len(annotations) == original_count:
        return Response({
            'error': 'Annotation not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    note.document_annotations = annotations
    note.save()
    
    # Log annotation deletion
    create_log(
        user=user,
        action='delete',
        entity_type='annotation',
        entity_id=note.id,
        message=f'Annotation deleted from document "{note.title}".',
        request=request
    )
    
    return Response({
        'message': 'Annotation deleted successfully'
    }, status=status.HTTP_200_OK)


def serve_document(request, note_id):
    """Serve document file with proper CORS headers for PDF.js compatibility.

    This view performs lightweight, manual auth/method checks instead of using
    the DRF `api_view` wrapper to avoid DRF content-negotiation returning
    406 Not Acceptable for binary PDF responses and to allow HEAD/OPTIONS
    requests coming from PDF.js clients.
    """
    from django.http import JsonResponse, HttpResponseNotAllowed

    # Allow preflight
    if request.method == 'OPTIONS':
        response = HttpResponse()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response['Access-Control-Max-Age'] = '86400'  # Cache preflight for 24 hours
        return response

    # Ensure the request is an allowed method
    if request.method not in ('GET', 'HEAD'):
        return HttpResponseNotAllowed(['GET', 'HEAD', 'OPTIONS'])

    # Authentication: prefer session/user if already set (useful for test
    # harnesses or session auth). Otherwise, extract Token from Authorization
    # header or `?token=` and validate.
    user = getattr(request, 'user', None)
    if not (user and getattr(user, 'is_authenticated', False)):
        auth_header = request.META.get('HTTP_AUTHORIZATION') or (
            request.headers.get('Authorization') if hasattr(request, 'headers') else None
        )
        token_key = None
        if auth_header and isinstance(auth_header, str) and auth_header.startswith('Token '):
            token_key = auth_header.split(' ', 1)[1].strip()
        elif request.GET.get('token'):
            token_key = request.GET.get('token')

        if token_key:
            try:
                from rest_framework.authtoken.models import Token
                token = Token.objects.get(key=token_key)
                user = token.user
            except Exception:
                return JsonResponse({'error': 'Unauthorized - invalid token'}, status=401)
        else:
            return JsonResponse({'error': 'Unauthorized - token missing'}, status=401)
    
    try:
        # Get the note and verify ownership
        note = get_object_or_404(Note, id=note_id, user=user)
        
        # If a file is stored on disk, redirect to its media URL (served by Django in DEBUG)
        if getattr(note, 'document_file') and note.document_file:
            # Update last_accessed and return redirect to media URL
            note.last_accessed = timezone.now()
            note.save(update_fields=['last_accessed'])
            try:
                file_url = note.document_file.url
                # Return a 302 redirect to the media URL
                from django.shortcuts import redirect
                return redirect(file_url)
            except Exception:
                # Fall back to serving binary content below
                pass

        if not note.document_content:
            return JsonResponse({
                'error': 'No document content found for this note'
            }, status=404)
        
        # Update last accessed for documents
        note.last_accessed = timezone.now()
        note.save(update_fields=['last_accessed'])

        # Create response with document content from database (legacy)
        response = HttpResponse(note.document_content, content_type=note.document_content_type or 'application/octet-stream')

        # Add CORS headers for PDF.js compatibility - include HEAD and OPTIONS
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        # Removed restrictive COEP and COOP headers that can cause 406 errors with PDF.js
        # response['Cross-Origin-Embedder-Policy'] = 'require-corp'
        # response['Cross-Origin-Opener-Policy'] = 'same-origin'

        # Add content disposition for proper handling
        filename = note.document_filename or 'document'
        response['Content-Disposition'] = f'inline; filename="{filename}"'

        # Log document access
        create_log(
            user=user,
            action='view',
            entity_type='document',
            entity_id=note.id,
            message=f'Document "{note.title}" served successfully.',
            request=request
        )

        return response
        
    except Exception as e:
        print(f"Error serving document: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'error': 'Failed to serve document',
            'detail': str(e)
        }, status=400)


@api_auth_required(['POST'])
def touch_note_access(request, note_id):
    """Explicitly update last_accessed for a note"""
    try:
        # Check if the note_id is a valid UUID format
        import re
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)
        if not uuid_pattern.match(str(note_id)):
            # Not a valid UUID - this is likely a temporary local ID from the client
            return Response({
                'error': 'Invalid note ID format',
                'detail': 'Please create the note first to get a valid server ID'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        note = get_object_or_404(Note, id=note_id, user=request.user)
        note.last_accessed = timezone.now()
        note.save(update_fields=['last_accessed'])
        return Response({'status': 'ok', 'last_accessed': note.last_accessed}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': 'Failed to touch note', 'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_auth_required(['POST'])
def upload_document(request):
    """Upload a document file and create a note"""
    user = request.user
    
    try:
        # Get the uploaded file from request.FILES
        uploaded_file = request.FILES.get('document')
        if not uploaded_file:
            return Response({
                'error': 'No document file provided'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Validate file type
        allowed_types = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/rtf'
        ]
        if uploaded_file.content_type not in allowed_types:
            return Response({'error': f'Unsupported file type: {uploaded_file.content_type}'}, status=status.HTTP_400_BAD_REQUEST)

        # Get other form data
        title = request.POST.get('title', uploaded_file.name or 'Untitled Document')
        content = request.POST.get('content', '')
        note_type = request.POST.get('type', 'document')

        # Read bytes for metadata extraction and saving
        uploaded_file.seek(0)
        file_bytes = uploaded_file.read()
        if not file_bytes:
            return Response({'error': 'Empty file provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Extract metadata (PDF page count if applicable)
        document_metadata = {
            'file_name': uploaded_file.name,
            'file_size': uploaded_file.size,
            'content_type': uploaded_file.content_type,
            'page_count': 1
        }
        if uploaded_file.content_type == 'application/pdf':
            try:
                import PyPDF2, io
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
                document_metadata['page_count'] = len(pdf_reader.pages)
            except Exception as e:
                document_metadata['metadata_error'] = str(e)

        # Create the note (store file via FileField)
        note = Note.objects.create(
            user=user,
            title=title,
            content=content,
            type=note_type,
            document_filename=uploaded_file.name,
            document_content_type=uploaded_file.content_type,
            document_metadata=document_metadata,
            last_accessed=timezone.now(),
        )

        # Save file to storage (MEDIA_ROOT/documents/)
        from django.core.files.base import ContentFile
        note.document_file.save(uploaded_file.name, ContentFile(file_bytes))
        note.save()

        # Serialize and return the created note
        serializer = NoteSerializer(note, context={'request': request})

        # Log document upload
        create_log(
            user=user,
            action='create',
            entity_type='document',
            entity_id=note.id,
            message=f'Document "{note.title}" uploaded successfully.',
            request=request
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        print(f"Error uploading document: {e}")
        import traceback
        traceback.print_exc()
        return Response({
            'error': 'Failed to upload document',
            'detail': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)