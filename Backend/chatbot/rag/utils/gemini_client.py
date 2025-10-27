import os
import google as genai  # package name may vary; see SDK docs
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

genai.configure(api_key=GEMINI_API_KEY)

def generate_with_gemini(prompt: str, max_output_tokens: int = 512):
    """
    Returns text string from Gemini model.
    """
    model_name = GEMINI_MODEL
    # The SDK exposes 'generate' or 'GenerativeModel' based on version; adjust to the sdk you installed.
    # Example:
    response = genai.generate(
        model=model_name,
        input=prompt,
        max_output_tokens=max_output_tokens
    )
    # response shape differs by SDK version; try common fields:
    if hasattr(response, 'text'):  # some wrappers
        return response.text
    # else check nested dict
    if isinstance(response, dict):
        # e.g. response['candidates'][0]['output']
        cand = response.get('candidates')
        if cand and len(cand)>0 and 'output' in cand[0]:
            return cand[0]['output']
        # or response.get('output', '')
        return str(response)
    # fallback
    return str(response)
