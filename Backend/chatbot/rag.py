import os
import sqlite3
from PyPDF2 import PdfReader
from sentence_transformers import SentenceTransformer
import numpy as np

DB_PATH = os.path.join(os.path.dirname(__file__), "rag.sqlite3")

# Load embedding model once
EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")


def init_db():
    """Ensure the SQLite DB and chunks table exist with proper schema."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check if table exists and get its schema
    cur.execute("PRAGMA table_info(chunks)")
    columns = [row[1] for row in cur.fetchall()]

    if not columns:
        # Create new table with full schema
        cur.execute("""
            CREATE TABLE chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                conversation_id TEXT,
                document_name TEXT,
                page_num INTEGER,
                chunk_text TEXT,
                embedding BLOB,
                doc_id TEXT,
                note_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        # Add missing columns to existing table
        if "user_id" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN user_id INTEGER DEFAULT 1")
        if "conversation_id" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN conversation_id TEXT DEFAULT ''")
        if "document_name" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN document_name TEXT DEFAULT ''")
        if "page_num" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN page_num INTEGER DEFAULT -1")
        if "doc_id" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN doc_id TEXT DEFAULT ''")
        if "note_id" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN note_id TEXT DEFAULT ''")
        if "created_at" not in columns:
            cur.execute("ALTER TABLE chunks ADD COLUMN created_at TIMESTAMP DEFAULT '1970-01-01 00:00:00'")

    # Create indexes
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_user_id ON chunks(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_conversation_id ON chunks(conversation_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_page_num ON chunks(page_num)")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()


def extract_text_by_page(file_path: str):
    """Extract text from PDF page by page."""
    reader = PdfReader(file_path)
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append((i, text.strip()))
    return pages


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


def save_chunks(chunks, embeddings, user_id=None, conversation_id=None, document_name="", page_num=-1, doc_id=None, note_id=None):
    """Store chunks + embeddings into SQLite with user/conversation context.

    Stores doc_id and note_id (if provided) on each chunk row for later lookup.
    """
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Ensure doc_id and note_id columns exist
    cur.execute("PRAGMA table_info(chunks)")
    columns = [row[1] for row in cur.fetchall()]
    if "doc_id" not in columns:
        cur.execute("ALTER TABLE chunks ADD COLUMN doc_id TEXT")
        conn.commit()
    if "note_id" not in columns:
        cur.execute("ALTER TABLE chunks ADD COLUMN note_id TEXT")
        conn.commit()

    for txt, emb in zip(chunks, embeddings):
        cur.execute(
            """
            INSERT INTO chunks (user_id, conversation_id, document_name, page_num, chunk_text, embedding, doc_id, note_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, conversation_id, document_name, page_num, txt, emb.tobytes(), doc_id, note_id)
        )
    conn.commit()
    conn.close()


def process_pdf(file_path: str, user_id=None, conversation_id=None, document_name="", doc_id=None, note_id=None):
    """
    Extract, chunk, embed, and save PDF page by page.
    Each page is chunked separately so context stays tighter.
    """
    pages = extract_text_by_page(file_path)

    for page_num, text in pages:
        chunks = chunk_text(text, chunk_size=500, overlap=50)
        if not chunks:
            continue

        embeddings = embed_texts(chunks)
        save_chunks(
            chunks,
            embeddings,
            user_id=user_id,
            conversation_id=conversation_id,
            document_name=document_name,
            page_num=page_num,
            doc_id=doc_id,
            note_id=note_id
        )


def process_file_for_user(file_path: str, user_id=None, conversation_id=None, document_name=None, doc_id=None, note_id=None):
    """Generic file processor used by the upload view.

    - For PDFs, process page-by-page using existing pipeline.
    - For plain text files, read, chunk, embed, and save.
    - Other file types currently raise NotImplementedError.
    """
    if document_name is None:
        document_name = os.path.basename(file_path)

    lower = file_path.lower()
    if lower.endswith(".pdf"):
        return process_pdf(file_path, user_id=user_id, conversation_id=conversation_id, document_name=document_name, doc_id=doc_id, note_id=note_id)

    if lower.endswith(".txt"):
        # Simple text file handling: treat whole file as a single "page"
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        if not text.strip():
            return
        chunks = chunk_text(text, chunk_size=500, overlap=50)
        embeddings = embed_texts(chunks)
        save_chunks(chunks, embeddings, user_id=user_id, conversation_id=conversation_id, document_name=document_name, page_num=-1, doc_id=doc_id, note_id=note_id)
        return

    # TODO: add OCR for images and other formats if needed
    raise NotImplementedError(f"Unsupported file type for processing: {file_path}")


def search_similar_for_user(query_text, user_id, top_k=5):
    """Search for most similar chunks to a query for a specific user."""
    init_db()

    # Embed query
    query_emb = EMBED_MODEL.encode([query_text])[0]

    # Fetch chunks for this user
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, chunk_text, embedding, document_name, page_num FROM chunks WHERE user_id = ?", (user_id,))
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return []

    # Compute cosine similarity
    results = []
    for cid, txt, emb_blob, doc_name, page_num in rows:
        emb = np.frombuffer(emb_blob, dtype=np.float32)
        score = float(np.dot(query_emb, emb) / (np.linalg.norm(query_emb) * np.linalg.norm(emb)))
        results.append((cid, txt, score, doc_name, page_num))

    results.sort(key=lambda x: x[2], reverse=True)
    return results[:top_k]


def search_similar_for_user_docs(query_text, user_id, doc_ids, top_k=5):
    """Search for similar chunks belonging to specific doc_ids for a user.

    Returns list of tuples: (id, chunk_text, score, document_name, page_num, doc_id)
    """
    init_db()

    if not doc_ids:
        return search_similar_for_user(query_text, user_id=user_id, top_k=top_k)

    # Embed query
    query_emb = EMBED_MODEL.encode([query_text])[0]

    # Build parameter placeholders for IN clause
    placeholders = ",".join(["?" for _ in doc_ids])
    sql = f"SELECT id, chunk_text, embedding, document_name, page_num, doc_id, note_id FROM chunks WHERE user_id = ? AND doc_id IN ({placeholders})"

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    params = [user_id] + list(doc_ids)
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return []

    results = []
    for cid, txt, emb_blob, doc_name, page_num, doc_id, note_id in rows:
        emb = np.frombuffer(emb_blob, dtype=np.float32)
        denom = (np.linalg.norm(query_emb) * np.linalg.norm(emb))
        score = 0.0 if denom == 0 else float(np.dot(query_emb, emb) / denom)
        results.append((cid, txt, score, doc_name, page_num, doc_id, note_id))

    results.sort(key=lambda x: x[2], reverse=True)
    return results[:top_k]


def search_similar(query_text, top_k=5):
    """Search for most similar chunks to a query across all users."""
    init_db()

    # Embed query
    query_emb = EMBED_MODEL.encode([query_text])[0]

    # Fetch all chunks
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, chunk_text, embedding, document_name, page_num FROM chunks")
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return []

    # Compute cosine similarity
    results = []
    for cid, txt, emb_blob, doc_name, page_num in rows:
        emb = np.frombuffer(emb_blob, dtype=np.float32)
        score = float(np.dot(query_emb, emb) / (np.linalg.norm(query_emb) * np.linalg.norm(emb)))
        results.append((cid, txt, score, doc_name, page_num))

    results.sort(key=lambda x: x[2], reverse=True)
    return results[:top_k]


def get_current_timestamp():
    """Get current timestamp in ISO format."""
    from datetime import datetime
    return datetime.now().isoformat()

# 🔑 Ensure DB exists on import
init_db()
