import os
import sqlite3
from PyPDF2 import PdfReader
from sentence_transformers import SentenceTransformer
import numpy as np

DB_PATH = os.path.join(os.path.dirname(__file__), "rag.sqlite3")

# Load embedding model once
EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")


def init_db():
    """Ensure the SQLite DB and chunks table exist."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_text TEXT,
            embedding BLOB
        )
    """)
    conn.commit()
    conn.close()


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF."""
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        if page.extract_text():
            text += page.extract_text() + "\n"
    return text.strip()


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50):
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = words[i:i + chunk_size]
        chunks.append(" ".join(chunk))
        i += chunk_size - overlap
    return chunks


def embed_texts(texts):
    """Generate embeddings for a list of texts."""
    return EMBED_MODEL.encode(texts, convert_to_numpy=True)


def save_chunks(chunks, embeddings):
    """Store chunks + embeddings into SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    for txt, emb in zip(chunks, embeddings):
        cur.execute(
            "INSERT INTO chunks (chunk_text, embedding) VALUES (?, ?)",
            (txt, emb.tobytes())
        )
    conn.commit()
    conn.close()


def search_similar(query_text, top_k=5):
    """Search for most similar chunks to a query."""
    init_db()  # ensure table exists

    # 1. Embed query
    query_emb = EMBED_MODEL.encode([query_text])[0]

    # 2. Fetch all chunks
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, chunk_text, embedding FROM chunks")
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return []

    # 3. Compute cosine similarity
    results = []
    for cid, txt, emb_blob in rows:
        emb = np.frombuffer(emb_blob, dtype=np.float32)
        score = float(np.dot(query_emb, emb) / (np.linalg.norm(query_emb) * np.linalg.norm(emb)))
        results.append((cid, txt, score))

    # 4. Sort and return top-k
    results.sort(key=lambda x: x[2], reverse=True)
    return results[:top_k]


# 🔑 Ensure DB exists on import
init_db()
