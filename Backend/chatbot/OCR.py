import os
import glob
import pytesseract
from PIL import Image
from langchain.schema import Document

# Set path to Tesseract executable (update this if your path is different)
pytesseract.pytesseract.tesseract_cmd = r"C:/Program Files/Tesseract-OCR/tesseract.exe"

DOCS_FOLDER = "docs"

def extract_text_from_images():
    all_docs = []
    print("🖼️ Mode: OCR (Image to Text) RAG")

    for path in glob.glob(os.path.join(DOCS_FOLDER, "*.[jp][pn]g")):  # jpg/jpeg/png
        try:
            image = Image.open(path)
            text = pytesseract.image_to_string(image).strip()  # Remove surrounding whitespace
            print(f"📜 Extracted Text from {path}:\n{text}\n")
            if text:  # Only add if non-empty
                doc = Document(page_content=text, metadata={"source": path})
                all_docs.append(doc)
                print(f"✅ OCR Processed: {path}")
            else:
                print(f"⚠️ OCR Output Empty: {path}")
        except Exception as e:
            print(f"❌ OCR Failed: {path} ({e})")
    
    return all_docs