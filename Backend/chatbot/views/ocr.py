# ocr.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.files.storage import default_storage
from ..utils.ocr_utils import extract_text_from_images
import logging

logger = logging.getLogger(__name__)

class OCRView(APIView):
    """
    Django REST Framework API endpoint for OCR text extraction.
    Accepts an image file and returns the extracted text.
    """

    def post(self, request, *args, **kwargs):
        file = request.FILES.get("file")

        # 🔍 Validate file upload
        if not file:
            return Response(
                {"success": False, "error": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save temporarily to storage
        file_path = default_storage.save(file.name, file)
        abs_path = default_storage.path(file_path)

        try:
            # Run OCR extraction
            text = extract_text_from_images(abs_path)

            return Response(
                {"success": True, "text": text},
                status=status.HTTP_200_OK,
            )

        except RuntimeError as e:
            # Handle OCR-specific issues
            logger.error(f"OCR processing failed: {str(e)}")
            return Response(
                {"success": False, "error": str(e)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,  # Unprocessable content
            )

        except Exception as e:
            # Handle unexpected issues
            logger.exception(f"Unexpected OCR error: {str(e)}")
            return Response(
                {
                    "success": False,
                    "error": "An unexpected error occurred while processing the image.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        finally:
            # Always clean up temporary file
            try:
                default_storage.delete(file_path)
            except Exception as cleanup_error:
                logger.warning(f"Failed to delete temporary OCR file: {cleanup_error}")
