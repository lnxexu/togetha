import os
import uuid
from PyPDF2 import PdfReader
import numpy as np
from django.conf import settings
from google import genai
from django.db import transaction
from django.db.models.expressions import RawSQL
from .models import DocumentChunk

# Configure Gemini/Embeddings
GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY"))
EMBEDDING_MODEL = getattr(settings, "EMBEDDING_MODEL", os.environ.get("EMBEDDING_MODEL", "text-embedding-004"))
EMBEDDING_MODEL_CANDIDATES = getattr(settings, "EMBEDDING_MODEL_CANDIDATES", [EMBEDDING_MODEL])

GENAI_CLIENT = None  # Client will be created lazily per call to reflect current config


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
    """Store chunks + embeddings into PostgreSQL with pgvector via Django ORM.

    Args:
        chunks: list[str]
        embeddings: list[np.ndarray]
        user_id: int or None
        conversation_id: optional string (currently unused)
        document_name: source file name
        page_num: unused placeholder for compatibility
        doc_id: UUID to group chunks from same source
    """
    if doc_id is None:
        doc_id = uuid.uuid4()

    try:
        with transaction.atomic():
            objs = []
            for txt, emb in zip(chunks, embeddings):
                emb_list = emb.astype(float).tolist()
                objs.append(
                    DocumentChunk(
                        user_id=user_id,
                        doc_id=doc_id,
                        document_name=document_name,
                        chunk_text=txt,
                        embedding=emb_list,
                        embedding_vec=emb_list,
                    )
                )
            if objs:
                DocumentChunk.objects.bulk_create(objs)
    except Exception:
        # Best-effort; let caller continue
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
    """Search most similar chunks for a user using pgvector cosine distance."""
    query_emb = _embed_one(query_text).astype(float).tolist()

    qs = (
        DocumentChunk.objects
        .filter(user_id=user_id)
        .exclude(embedding_vec__isnull=True)
        .annotate(distance=RawSQL("embedding_vec <=> %s", (query_emb,)))
        .order_by('distance')
    )

    rows = list(qs.values('id', 'chunk_text', 'document_name', 'distance')[:top_k])
    # Optionally convert distance to similarity (1 - distance)
    for r in rows:
        if r['distance'] is not None:
            r['similarity'] = 1 - float(r['distance'])
    return rows


def search_similar_for_user_in_docs(query_text, user_id, doc_ids, top_k=5):
    """Search most similar chunks for a user within specific document IDs using pgvector cosine distance.

    Args:
        query_text: The query string to embed and search with.
        user_id: The user whose chunks to search.
        doc_ids: Iterable of document UUID strings to restrict the search to.
        top_k: Number of top results to return.

    Returns:
        List[dict]: Each dict contains id, chunk_text, document_name, distance, and similarity.
    """
    if not doc_ids:
        return search_similar_for_user(query_text, user_id, top_k=top_k)

    query_emb = _embed_one(query_text).astype(float).tolist()

    qs = (
        DocumentChunk.objects
        .filter(user_id=user_id, doc_id__in=list(doc_ids))
        .exclude(embedding_vec__isnull=True)
        .annotate(distance=RawSQL("embedding_vec <=> %s", (query_emb,)))
        .order_by('distance')
    )

    rows = list(qs.values('id', 'chunk_text', 'document_name', 'distance')[:top_k])
    for r in rows:
        if r['distance'] is not None:
            r['similarity'] = 1 - float(r['distance'])
    return rows


def search_similar(query_text, top_k=5):
    """Search most similar chunks across all users using pgvector cosine distance."""
    query_emb = _embed_one(query_text).astype(float).tolist()
    qs = (
        DocumentChunk.objects
        .exclude(embedding_vec__isnull=True)
        .annotate(distance=RawSQL("embedding_vec <=> %s", (query_emb,)))
        .order_by('distance')
    )
    rows = list(qs.values('id', 'chunk_text', 'document_name', 'distance')[:top_k])
    for r in rows:
        if r['distance'] is not None:
            r['similarity'] = 1 - float(r['distance'])
    return rows

