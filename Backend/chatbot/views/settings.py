from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chatbot_settings(request):
    """
    Return configurable chatbot settings (e.g. max tokens, temperature).
    Can later be expanded to per-user preferences.
    """
    return Response(
        {
            "model": "llama3.2",
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 2048,
        },
        status=status.HTTP_200_OK,
    )

