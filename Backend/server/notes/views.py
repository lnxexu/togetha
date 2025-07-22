from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.response import Response
from rest_framework import status
from .models import Note, Folder, AudioRecording
from .serializers import NoteSerializer, FolderSerializer, AudioRecordingSerializer

@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def folder_list(request):
    if request.method == 'GET':
        folders = Folder.objects.filter(user=request.user)
        serializer = FolderSerializer(folders, many=True)
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
def note_list(request):
    if request.method == 'GET':
        folder_id = request.query_params.get('folder_id', None)
        if folder_id:
            notes = Note.objects.filter(user=request.user, folder_id=folder_id)
        else:
            notes = Note.objects.filter(user=request.user)
        serializer = NoteSerializer(notes, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = NoteSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Associate note with the current user
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def note_detail(request, pk):
    try:
        note = Note.objects.get(pk=pk, user=request.user)
    except Note.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = NoteSerializer(note)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = NoteSerializer(note, data=request.data, partial=request.method=='PATCH')
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
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
        duration=0  # You might want to calculate this
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