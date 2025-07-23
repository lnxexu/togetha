# rag_runner.py

import os
import glob
import pytesseract
from PIL import Image

from langchain.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS
from langchain.embeddings import OllamaEmbeddings
from langchain.llms import Ollama
from langchain.chains import RetrievalQA
from langchain.schema import Document

pytesseract.pytesseract.tesseract_cmd = r"C:/Users/Dragger24/AppData/Local/Programs/Tesseract-OCR/tesseract.exe"
# --------- CONFIG ---------
DOCS_FOLDER = "docs"
MODEL_NAME = "llama3"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
# --------------------------

def load_documents_from_files(mode="pdf"):
    all_docs = []

    if mode == "pdf":
        print("📄 Mode: AI PDF/DOCX Document RAG")

        # PDF files
        for path in glob.glob(os.path.join(DOCS_FOLDER, "*.pdf")):
            try:
                loader = PyPDFLoader(path)
                docs = loader.load()
                all_docs.extend(docs)
                print(f"✅ Loaded PDF: {path}")
            except Exception as e:
                print(f"❌ Failed PDF: {path} ({e})")

        # DOCX files
        for path in glob.glob(os.path.join(DOCS_FOLDER, "*.docx")):
            try:
                loader = Docx2txtLoader(path)
                docs = loader.load()
                all_docs.extend(docs)
                print(f"✅ Loaded DOCX: {path}")
            except Exception as e:
                print(f"❌ Failed DOCX: {path} ({e})")

    elif mode == "image":
        print("🖼️ Mode: OCR (Image to Text) RAG")

        for path in glob.glob(os.path.join(DOCS_FOLDER, "*.[jp][pn]g")):  # jpg/jpeg/png
            try:
                image = Image.open(path)
                text = pytesseract.image_to_string(image).strip()  # Clean up whitespace
                print(f"📜 Extracted Text from {path}:\n{text}\n")  # Print the extracted text
                if text:  # Only add non-empty text
                    doc = Document(page_content=text, metadata={"source": path})
                    all_docs.append(doc)
                    print(f"✅ OCR Processed: {path}")
                else:
                    print(f"⚠️ OCR Output Empty: {path}")
            except Exception as e:
                print(f"❌ OCR Failed: {path} ({e})")

    return all_docs

def split_documents(docs):
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    return splitter.split_documents(docs)

def build_vector_store(chunks):
    embeddings = OllamaEmbeddings(model=MODEL_NAME)
    db = FAISS.from_documents(chunks, embeddings)
    return db

def run_query(chain, user_query):
    response = chain(user_query)
    print("\n🔍 Query:\n", user_query)
    print("\n🧠 Answer:\n", response['result'])

    print("\n📚 Sources:")
    for doc in response['source_documents']:
        print(f" - {doc.metadata.get('source', 'Unknown')}")


if __name__ == "__main__":
    print("🤖 Select RAG Mode:")
    print("1 = AI PDF/DOCX Reader")
    print("2 = OCR Image to Text")

    choice = input("Enter mode number: ").strip()
    mode = "pdf" if choice == "1" else "image"

    print("\n📂 Reading files from:", os.path.abspath(DOCS_FOLDER))
    documents = load_documents_from_files(mode=mode)

    if not documents:
        print("❌ No documents found.")
        exit()

    print(f"✅ Loaded {len(documents)} files.")

    # Stop after extracting information for OCR mode
    if mode == "image":
        print("\n🔄 Returning to menu...")
        exit()

    print("🔪 Splitting into chunks...")
    chunks = split_documents(documents)
    print(f"✅ Total Chunks: {len(chunks)}")

    print("🔎 Building vector store...")
    db = build_vector_store(chunks)

    llm = Ollama(model=MODEL_NAME)
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=db.as_retriever(),
        return_source_documents=True
    )

    print("\n✅ Ready! Type your question (type 'exit' to quit):")
    while True:
        q = input("\n❓ Question: ")
        if q.lower() in ["exit", "quit"]:
            break
        run_query(qa_chain, q)