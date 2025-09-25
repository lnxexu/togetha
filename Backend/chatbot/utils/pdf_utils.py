from PyPDF2 import PdfReader

def extract_pdf_text(file_path):
    reader = PdfReader(file_path)
    return "\n".join([page.extract_text() or "" for page in reader.pages])
