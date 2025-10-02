from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import requests
import os
import json
import logging

logger = logging.getLogger(__name__)

# Base Ollama server URL
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


class ConceptHelpView(APIView):
    def post(self, request):
        text = request.data.get("text", "").strip()

        if not text:
            return Response({"error": "Missing 'text' in request body"}, status=status.HTTP_400_BAD_REQUEST)

        prompt = f"""
You are a dictionary assistant. 
For the word "{text}", return a JSON object with the following keys only:
- Meaning (string)
- PartOfSpeech (string)
- Synonyms (array of strings)
- Antonyms (array of strings, at least 1 item, use ["None"] if not applicable)
- Examples (array of exactly 2 sentences, always required)

Return ONLY valid JSON. Do not include explanations.
"""

        try:
            r = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": MODEL, "prompt": prompt, "format": "json", "stream": False},
                timeout=90,
            )
            r.raise_for_status()
            raw = r.json()

            logger.info("Ollama ConceptHelp raw response: %s", raw)

            response_str = raw.get("response", "")
            parsed = json.loads(response_str) if isinstance(response_str, str) else response_str

            # Fill missing keys with defaults
            required_keys = {
                "Meaning": [],
                "PartOfSpeech": [],
                "Synonyms": [],
                "Antonyms": [],
                "Examples": []
            }
            for key, default in required_keys.items():
                parsed.setdefault(key, default)

            return Response(parsed, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("❌ Error in ConceptHelpView")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
