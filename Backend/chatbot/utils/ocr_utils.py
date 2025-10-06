from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
import os
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def extract_text_from_images(file_path: str) -> str:
    """
    Enhanced OCR text extraction utility using pytesseract.

    Args:
        file_path (str): Full path to the image file.

    Returns:
        str: Cleaned, extracted text from the image.
    """
    try:
        # Open the image file
        img = Image.open(file_path)

        # Convert to grayscale to improve contrast
        img = img.convert("L")

        # Apply light sharpening and contrast enhancement
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
        img = img.filter(ImageFilter.SHARPEN)

        # Perform OCR with language and layout optimization
        text = pytesseract.image_to_string(img, lang="eng", config="--psm 6")

        # Clean up and normalize whitespace
        cleaned_text = " ".join(text.split())

        return cleaned_text.strip()

    except Exception as e:
        # Raise a clear, readable error for the view layer
        raise RuntimeError(f"OCR failed while processing {file_path}: {str(e)}")