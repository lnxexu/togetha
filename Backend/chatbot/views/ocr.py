from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.files.storage import default_storage
from ..utils.ocr_utils import extract_text_from_images

class OCRView(APIView):
    def post(self, request, *args, **kwargs):
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        # Save temporarily
        file_path = default_storage.save(file.name, file)
        
        try:
            text = extract_text_from_images(default_storage.path(file_path))
            return Response({"text": text}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            default_storage.delete(file_path)