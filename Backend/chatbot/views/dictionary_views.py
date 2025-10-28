from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import requests
import os
import json
import logging
from django.conf import settings
from google import genai

logger = logging.getLogger(__name__)

# Google Gemini configuration (prefer Django settings, fallback to env)
GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
# Prefer the lite model by default; can be overridden via settings or env
GEMINI_MODEL = getattr(settings, "GEMINI_MODEL", None) or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")

def _gemini_candidates(preferred: str) -> list[str]:
    """Return ordered model candidates, preferring the provided model."""
    candidates = list(getattr(settings, "GEMINI_MODEL_CANDIDATES", []) or [])
    # Ensure we have reasonable fallbacks
    defaults = [
        preferred,
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite-preview",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]
    for m in defaults:
        if m and m not in candidates:
            candidates.append(m)
    # Move preferred to front
    if preferred in candidates:
        candidates.insert(0, candidates.pop(candidates.index(preferred)))
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for m in candidates:
        if m not in seen:
            seen.add(m)
            unique.append(m)
    return unique


class ConceptHelpView(APIView):
    def post(self, request):
        text = request.data.get("text", "").strip()

        if not text:
            return Response({"error": "Missing 'text' in request body"}, status=status.HTTP_400_BAD_REQUEST)

        prompt = f"""
You are a dictionary assistant.
For the word "{text}", return ONLY a JSON object with the following keys exactly:
- Meaning (array of 1 concise definition as string)
- PartOfSpeech (array with one string like ["noun"], ["verb"], etc.)
- Synonyms (array of strings)
- Antonyms (array of strings; at least one item, use ["None"] if not applicable)
- Examples (array of exactly 2 example sentences as strings)

Rules:
- Output strictly valid JSON, no markdown or prose.
- Do not include any keys other than those specified.
"""

        try:
            if not GEMINI_API_KEY:
                return Response({"error": "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Build generation config with correct camelCase keys expected by Gemini REST API
            base_generation_config = {
                "temperature": 0.2,
                "maxOutputTokens": 512,
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "object",
                    "properties": {
                        "Meaning": {"type": "array", "items": {"type": "string"}},
                        "PartOfSpeech": {"type": "array", "items": {"type": "string"}},
                        "Synonyms": {"type": "array", "items": {"type": "string"}},
                        "Antonyms": {"type": "array", "items": {"type": "string"}},
                        "Examples": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["Meaning", "PartOfSpeech", "Synonyms", "Antonyms", "Examples"],
                },
            }

            # Try preferred model first, then fall back across candidates on 4xx
            raw = None
            last_error = None
            for model in _gemini_candidates(GEMINI_MODEL):
                try:
                    url = (
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
                    )
                    payload = {
                        "contents": [
                            {"role": "user", "parts": [{"text": prompt}]}
                        ],
                        "generationConfig": base_generation_config,
                    }
                    r = requests.post(url, json=payload, timeout=90)
                    if r.status_code >= 400:
                        # Log and try next candidate for 4xx errors
                        try:
                            logger.warning(
                                "Gemini model '%s' returned %s: %s",
                                model,
                                r.status_code,
                                r.text[:500],
                            )
                        except Exception:
                            pass
                        last_error = (r.status_code, r.text)
                        # 5xx might be transient; still try next
                        continue
                    r.raise_for_status()
                    raw = r.json()
                    logger.info("Gemini ConceptHelp raw response (model=%s)", model)
                    break
                except requests.HTTPError as he:
                    last_error = (getattr(he.response, "status_code", None), str(he))
                    continue
                except Exception as e:
                    last_error = (None, str(e))
                    continue

            if raw is None:
                code, msg = last_error if isinstance(last_error, tuple) else (None, str(last_error))
                raise ValueError(f"Gemini request failed for all models. last_error={code} {msg}")

            logger.info("Gemini ConceptHelp raw response: %s", raw)

            # Extract the text content from Gemini response
            candidates = raw.get("candidates", []) or []
            if not candidates:
                raise ValueError("No candidates returned from Gemini")
            parts = (candidates[0].get("content", {}) or {}).get("parts", []) or []
            response_text = "".join(p.get("text", "") for p in parts)

            if not response_text:
                raise ValueError("Empty response text from Gemini")

            def extract_first_json_object(s: str) -> str | None:
                # Remove markdown code fences if present
                if s.strip().startswith("```"):
                    s = s.replace("```json", "").replace("```", "")
                # Stack-based extraction of the first balanced {...}
                depth = 0
                start_idx = -1
                for i, ch in enumerate(s):
                    if ch == '{':
                        if depth == 0:
                            start_idx = i
                        depth += 1
                    elif ch == '}':
                        if depth > 0:
                            depth -= 1
                            if depth == 0 and start_idx != -1:
                                return s[start_idx : i + 1]
                return None

            def sanitize_json_like(s: str) -> str:
                # Normalize quotes
                s = s.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
                # Remove trailing commas before } or ]
                import re
                s = re.sub(r",\s*([}\]])", r"\1", s)
                return s

            parsed = None
            try:
                parsed = json.loads(response_text)
            except json.JSONDecodeError as e1:
                candidate = extract_first_json_object(response_text) or ""
                if candidate:
                    try:
                        parsed = json.loads(candidate)
                    except json.JSONDecodeError:
                        try:
                            parsed = json.loads(sanitize_json_like(candidate))
                        except json.JSONDecodeError as e2:
                            logger.error("Failed to parse JSON after sanitize. e1=%s e2=%s text=%s...", e1, e2, candidate[:200])
                else:
                    logger.error("No JSON object found in response: %s...", response_text[:200])

            # If still not parsed, attempt a stricter retry with concise prompt
            if parsed is None:
                retry_prompt = f"""
Return ONLY valid JSON for the word \"{text}\" with keys: Meaning, PartOfSpeech, Synonyms, Antonyms, Examples.
Absolutely no markdown or extra text. Do not include backticks. Do not include explanations.
"""
                retry_generation_config = {
                    "temperature": 0.1,
                    "maxOutputTokens": 256,
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "object",
                        "properties": {
                            "Meaning": {"type": "array", "items": {"type": "string"}},
                            "PartOfSpeech": {"type": "array", "items": {"type": "string"}},
                            "Synonyms": {"type": "array", "items": {"type": "string"}},
                            "Antonyms": {"type": "array", "items": {"type": "string"}},
                            "Examples": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["Meaning", "PartOfSpeech", "Synonyms", "Antonyms", "Examples"],
                    },
                }
                # Try retry across candidates as well
                for model in _gemini_candidates(GEMINI_MODEL):
                    try:
                        url_retry = (
                            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
                        )
                        retry_payload = {
                            "contents": [{"role": "user", "parts": [{"text": retry_prompt}]}],
                            "generationConfig": retry_generation_config,
                        }
                        r2 = requests.post(url_retry, json=retry_payload, timeout=90)
                        if r2.status_code >= 400:
                            try:
                                logger.warning(
                                    "Gemini retry model '%s' returned %s: %s",
                                    model,
                                    r2.status_code,
                                    r2.text[:300],
                                )
                            except Exception:
                                pass
                            # Fallback attempt: try without responseSchema, keeping JSON mime type
                            try:
                                rs_cfg = dict(retry_generation_config)
                                rs_cfg.pop("responseSchema", None)
                                payload_no_schema = {
                                    "contents": [{"role": "user", "parts": [{"text": retry_prompt}]}],
                                    "generationConfig": rs_cfg,
                                }
                                r2b = requests.post(url_retry, json=payload_no_schema, timeout=90)
                                if r2b.status_code >= 400:
                                    continue
                                raw2b = r2b.json()
                                parts2b = (raw2b.get("candidates", [{}])[0].get("content", {}) or {}).get("parts", []) or []
                                text2b = "".join(p.get("text", "") for p in parts2b)
                                if text2b:
                                    try:
                                        parsed = json.loads(text2b)
                                        break
                                    except json.JSONDecodeError:
                                        cand2b = extract_first_json_object(text2b) or text2b
                                        try:
                                            parsed = json.loads(sanitize_json_like(cand2b))
                                            break
                                        except json.JSONDecodeError:
                                            pass
                            except Exception:
                                pass
                            continue
                        raw2 = r2.json()
                        parts2 = (raw2.get("candidates", [{}])[0].get("content", {}) or {}).get("parts", []) or []
                        text2 = "".join(p.get("text", "") for p in parts2)
                        if text2:
                            try:
                                parsed = json.loads(text2)
                                break
                            except json.JSONDecodeError:
                                cand2 = extract_first_json_object(text2) or text2
                                try:
                                    parsed = json.loads(sanitize_json_like(cand2))
                                    break
                                except json.JSONDecodeError as e3:
                                    logger.error("Retry parse failed for model %s: %s... (%s)", model, text2[:200], e3)
                    except Exception as re:
                        logger.error("Retry request to Gemini failed for model %s: %s", model, re)

            # If still not parsed, return a graceful fallback to avoid 500
            if parsed is None:
                fallback = {
                    "Meaning": [response_text.strip()[:200]] if response_text else [],
                    "PartOfSpeech": [],
                    "Synonyms": [],
                    "Antonyms": ["None"],
                    "Examples": [],
                }
                return Response(fallback, status=status.HTTP_200_OK)

            # Fill missing keys with defaults
            required_keys = [
                "Meaning",
                "PartOfSpeech",
                "Synonyms",
                "Antonyms",
                "Examples",
            ]
            for key in required_keys:
                if key not in parsed:
                    parsed[key] = []

            # Normalize to arrays of strings to match frontend expectations
            def ensure_array(value):
                if value is None:
                    return []
                if isinstance(value, list):
                    return [str(v).strip() for v in value if isinstance(v, (str, int, float)) and str(v).strip()]
                if isinstance(value, (str, int, float)):
                    s = str(value).strip()
                    return [s] if s else []
                return []

            parsed["Meaning"] = ensure_array(parsed.get("Meaning"))
            parsed["PartOfSpeech"] = ensure_array(parsed.get("PartOfSpeech"))
            parsed["Synonyms"] = ensure_array(parsed.get("Synonyms"))
            parsed["Antonyms"] = ensure_array(parsed.get("Antonyms"))
            parsed["Examples"] = ensure_array(parsed.get("Examples"))

            # Post-conditions
            if not parsed["Antonyms"]:
                parsed["Antonyms"] = ["None"]
            # Keep at most 2 examples if more were provided
            if len(parsed["Examples"]) > 2:
                parsed["Examples"] = parsed["Examples"][:2]

            return Response(parsed, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception("❌ Error in ConceptHelpView")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
