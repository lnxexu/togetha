from PIL import Image
import pytesseract

def extract_text_from_images(file_path):
    img = Image.open(file_path)
    return pytesseract.image_to_string(img)
