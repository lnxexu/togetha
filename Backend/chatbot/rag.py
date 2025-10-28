import os
import sqlite3
import uuid
from PyPDF2 import PdfReader
import numpy as np
from django.conf import settings
from google import genai
from django.db import transaction
from .models import DocumentChunk

DB_PATH = os.path.join(os.path.dirname(__file__), "rag.sqlite3")

# Configure Gemini/Embeddings
GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY"))
EMBEDDING_MODEL = getattr(settings, "EMBEDDING_MODEL", os.environ.get("EMBEDDING_MODEL", "text-embedding-004"))
EMBEDDING_MODEL_CANDIDATES = getattr(settings, "EMBEDDING_MODEL_CANDIDATES", [EMBEDDING_MODEL])

GENAI_CLIENT = None  # Client will be created lazily per call to reflect current config


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


def _embed_one(text: str) -> np.ndarray:
    """Embed a single text using Google's embeddings."""
    api_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("AI provider not configured. Please set GEMINI_API_KEY on the server.")

    # Set the environment variable for the SDK
    os.environ["GEMINI_API_KEY"] = api_key

    client = genai.Client()
    errors = []
    for model_name in EMBEDDING_MODEL_CANDIDATES:
        try:
            res = client.models.embed_content(model=model_name, contents=text)
            values = res.embeddings[0].values
            return np.array(values, dtype=np.float32)
        except Exception as e:
            err_text = str(e)
            if any(k in err_text.lower() for k in ["rate limit", "quota", "exceeded", "resource exhausted", "insufficient", "invalid model", "not found"]):
                errors.append((model_name, err_text))
                continue
            errors.append((model_name, err_text))
            continue
    last = errors[-1][1] if errors else "Unknown embedding error"
    raise RuntimeError(f"Embedding error: {last}")


def embed_texts(texts):
    """Generate embeddings for a list of texts via Google embeddings API."""
    return [
        _embed_one(t)
        for t in texts
    ]


def save_chunks(chunks, embeddings, user_id=None, conversation_id=None, document_name="", page_num=-1, doc_id: uuid.UUID | None = None):
    """Store chunks + embeddings into SQLite with user/conversation context, and mirror to Django DB.

    Args:
        chunks: list[str] text chunks
        embeddings: list[np.ndarray] embedding vectors aligned with chunks
        user_id: int or None, owner of the chunks
        conversation_id: optional conversation id string
        document_name: original file name
        page_num: page number for PDF context, -1 if not applicable
        doc_id: UUID shared by all chunks from the same source document; auto-generated if None
    """
    if doc_id is None:
        doc_id = uuid.uuid4()

    # 1) Persist to local RAG SQLite for fast cosine search across all users
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    for txt, emb in zip(chunks, embeddings):
        cur.execute(
            """
            INSERT INTO chunks (user_id, conversation_id, document_name, page_num, chunk_text, embedding)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, conversation_id, document_name, page_num, txt, emb.astype(np.float32).tobytes())
        )
    conn.commit()
    conn.close()

    # 2) Mirror to primary Django DB (PostgreSQL) in DocumentChunk for doc-specific queries
    try:
        with transaction.atomic():
            objs = []
            for txt, emb in zip(chunks, embeddings):
                # Convert embedding to plain list[float] for JSONField
                emb_list = emb.astype(float).tolist()
                objs.append(
                    DocumentChunk(
                        user_id=user_id,
                        doc_id=doc_id,
                        document_name=document_name,
                        chunk_text=txt,
                        embedding=emb_list,
                    )
                )
            if objs:
                DocumentChunk.objects.bulk_create(objs, ignore_conflicts=True)
    except Exception:
        # Do not fail the request if the mirror write fails; best-effort
        pass

    return doc_id


def process_pdf(file_path: str, user_id=None, conversation_id=None, document_name="", doc_id: uuid.UUID | None = None):
    """
    Extract, chunk, embed, and save PDF page by page.
    Each page is chunked separately so context stays tighter.
    """
    pages = extract_text_by_page(file_path)
    if doc_id is None:
        doc_id = uuid.uuid4()

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
        )
    return {"doc_id": str(doc_id), "pages": len(pages)}


def process_file_for_user(file_path: str, user_id=None, conversation_id=None, document_name=None):
    """Generic file processor used by the upload view.

    - For PDFs, process page-by-page using existing pipeline.
    - For plain text files, read, chunk, embed, and save.
    - Other file types currently raise NotImplementedError.
    """
    if document_name is None:
        document_name = os.path.basename(file_path)

    lower = file_path.lower()
    if lower.endswith(".pdf"):
        return process_pdf(file_path, user_id=user_id, conversation_id=conversation_id, document_name=document_name)

    if lower.endswith(".txt"):
        # Simple text file handling: treat whole file as a single "page"
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        if not text.strip():
            return
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    embeddings = embed_texts(chunks)
    doc_id = save_chunks(chunks, embeddings, user_id=user_id, conversation_id=conversation_id, document_name=document_name, page_num=-1)
    return {"doc_id": str(doc_id), "pages": 1}

    # TODO: add OCR for images and other formats if needed
    raise NotImplementedError(f"Unsupported file type for processing: {file_path}")


def search_similar_for_user(query_text, user_id, top_k=5):
    """Search for most similar chunks to a query for a specific user."""
    init_db()

    # Embed query
    query_emb = _embed_one(query_text)

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


def search_similar(query_text, top_k=5):
    """Search for most similar chunks to a query across all users."""
    init_db()

    # Embed query
    query_emb = _embed_one(query_text)

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


# 🔑 Ensure DB exists on import
init_db()
