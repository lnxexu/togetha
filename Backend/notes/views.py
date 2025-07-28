from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.response import Response
from rest_framework import status
from .models import Note, Folder, AudioRecording, Tag
from .serializers import NoteSerializer, FolderSerializer, AudioRecordingSerializer, TagSerializer

@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def folder_list(request):
    if request.method == 'GET':
        folders = Folder.objects.filter(user=request.user)
        serializer = FolderSerializer(folders, many=True)
        # if there is no folders, return an empty list
        if not folders:
            return Response([], status=status.HTTP_200_OK)
        else:
            # Return the serialized data    
            return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = FolderSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Associate folder with the current user
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def folder_detail(request, pk):
    try:
        folder = Folder.objects.get(pk=pk, user=request.user)
    except Folder.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = FolderSerializer(folder)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = FolderSerializer(folder, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        folder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def tag_list(request):
    if request.method == 'GET':
        tags = Tag.objects.filter(user=request.user)
        serializer = TagSerializer(tags, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = TagSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
@api_view(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def note_list(request):
    try:
        note = Note.objects.get(pk=request.query_params.get('pk'), user=request.user)
    except Note.DoesNotExist:
        note = None

    if request.method == 'GET':
        folder_id = request.query_params.get('folder_id', None)
        tag_id = request.query_params.get('tag_id', None)
        
        notes = Note.objects.filter(user=request.user)
        
        if folder_id:
            notes = notes.filter(folder_id=folder_id)
        
        if tag_id:
            notes = notes.filter(tags__id=tag_id)
            
        serializer = NoteSerializer(notes, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = NoteSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Associate note with the current user
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = NoteSerializer(note, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def note_detail(request, pk):
    print(f"Processing note_detail for pk={pk}, method={request.method}")
    try:
        note = Note.objects.get(pk=pk, user=request.user)
        print(f"Found note: {note}")
    except Note.DoesNotExist:
        print(f"Note {pk} not found")
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = NoteSerializer(note)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        print(f"Request data: {request.data}")
        serializer = NoteSerializer(note, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            print("Data is valid, saving with user...")
            # Always preserve the user relationship
            serializer.save(user=request.user)
            return Response(serializer.data)
        print(f"Validation errors: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def upload_audio_recording(request):
    if 'audio_file' not in request.FILES:
        return Response({'error': 'No audio file provided'}, status=status.HTTP_400_BAD_REQUEST)
    
    note_id = request.data.get('note')
    if not note_id:
        return Response({'error': 'Note ID is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        note = Note.objects.get(pk=note_id, user=request.user)
    except Note.DoesNotExist:
        return Response({'error': 'Note not found'}, status=status.HTTP_404_NOT_FOUND)
    
    audio_file = request.FILES['audio_file']
    recording = AudioRecording.objects.create(
        note=note,
        audio_file=audio_file,
        duration=0  
    )
    
    serializer = AudioRecordingSerializer(recording)
    return Response(serializer.data, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def transcribe_audio(request, pk):
    try:
        recording = AudioRecording.objects.get(pk=pk)
        note = recording.note
        if note.user != request.user:
            return Response(status=status.HTTP_403_FORBIDDEN)
    except AudioRecording.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    # Here you would implement audio transcription
    # For now, just mark it as transcribed
    recording.transcribed = True
    recording.save()
    
    serializer = AudioRecordingSerializer(recording)
    return Response(serializer.data)

@api_view(['GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def search_notes(request):
    query = request.query_params.get('q', '')
    if not query:
        return Response([], status=status.HTTP_200_OK)
    
    notes = Note.objects.filter(user=request.user, title__icontains=query)
    serializer = NoteSerializer(notes, many=True)
    return Response(serializer.data)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def tag_detail(request, pk):
    try:
        tag = Tag.objects.get(pk=pk, user=request.user)
    except Tag.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
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
    

@api_view(['GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def tag_list(request):
    tags = Tag.objects.filter(user=request.user)
    serializer = TagSerializer(tags, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def assign_notes_to_folder(request):
    """
    Assign multiple notes to a folder
    """
    folder_id = request.data.get('folder_id')
    note_ids = request.data.get('note_ids', [])
    
    if not folder_id or not note_ids:
        return Response({"error": "folder_id and note_ids are required"}, 
                        status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Verify folder belongs to user
        folder = Folder.objects.get(pk=folder_id, user=request.user)
        
        # Update all notes that belong to the user
        updated = Note.objects.filter(id__in=note_ids, user=request.user).update(folder=folder)
        
        return Response({"updated_notes": updated}, status=status.HTTP_200_OK)
    except Folder.DoesNotExist:
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
    
@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def move_note_to_folder(request, note_id):
    """
    Move a single note to a different folder
    """
    folder_id = request.data.get('folder_id')
    
    # Check if folder_id is None (which means removing from any folder)
    if folder_id is None:
        try:
            note = Note.objects.get(pk=note_id, user=request.user)
            note.folder = None
            note.save()
            serializer = NoteSerializer(note)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Note.DoesNotExist:
            return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    
    # If folder_id is provided, verify it exists and belongs to the user
    try:
        note = Note.objects.get(pk=note_id, user=request.user)
        folder = Folder.objects.get(pk=folder_id, user=request.user)
        
        # Move the note to the specified folder
        note.folder = folder
        note.save()
        
        serializer = NoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Note.DoesNotExist:
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)
    except Folder.DoesNotExist:
        return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
    
@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def remove_note_from_folder(request, note_id):
    """
    Remove a note from its current folder (make it unorganized)
    """
    try:
        note = Note.objects.get(pk=note_id, user=request.user)
        note.folder = None
        note.save()
        serializer = NoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Note.DoesNotExist:
        return Response({"error": "Note not found"}, status=status.HTTP_404_NOT_FOUND)    