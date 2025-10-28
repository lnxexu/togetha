import os
from google import genai  # Updated import for latest SDK
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

# No need to configure globally; client will use GEMINI_API_KEY env var

def generate_with_gemini(prompt: str, max_output_tokens: int = 512):
    """
    Returns text string from Gemini model.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    # Ensure the env var is set
    os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY

    client = genai.Client()
    model_name = GEMINI_MODEL

    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=genai.GenerateContentConfig(max_output_tokens=max_output_tokens)
    )

    # Get the text from the response
    if hasattr(response, 'text') and response.text:
        return response.text
    elif response.candidates and response.candidates[0].content.parts:
        return response.candidates[0].content.parts[0].text
    else:
        return "No response generated"
