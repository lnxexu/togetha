import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS, joinUrl } from '@/constants/ApiConfig';

async function getAuthHeaders(isForm = false) {
  const token = await AsyncStorage.getItem('authToken');
  const headers: any = {};
  if (token) headers.Authorization = `Token ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';
  return headers;
}

// Upload PDF and return backend's document id (if provided)
export async function uploadPDF(fileUri: string, fileName: string): Promise<any> {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'application/pdf',
    name: fileName,
  } as any);

  const headers = await getAuthHeaders(true);

  const res = await fetch(joinUrl(API_URL, API_ENDPOINTS.PDF_RAG_UPLOAD), {
    method: 'POST',
    headers,
    body: formData,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.error || json.message || 'Upload failed');
  return json;
}

// Check RAG processing status for a given doc_id
export async function checkRAGStatus(docId: string): Promise<{ status: string }>
{
  const headers = await getAuthHeaders();
  const url = `${joinUrl(API_URL, API_ENDPOINTS.PDF_RAG_STATUS)}?doc_id=${encodeURIComponent(docId)}`;
  const res = await fetch(url, { method: 'GET', headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.error || 'Failed to fetch RAG status');
  return json as { status: string };
}

// Query embeddings/chat on server (annotations chat) - provide optional doc_ids
export async function queryRAG(query: string, docIds: string[] = []): Promise<any> {
  const headers = await getAuthHeaders();
  const payload: any = { query };
  if (docIds && docIds.length) payload.doc_ids = docIds.slice(0, 4);

  const res = await fetch(joinUrl(API_URL, API_ENDPOINTS.CHATBOT_RAG), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.error || json.message || 'Query failed');
  return json;
}

// Query the backend endpoint that uses Ollama for generation (RAG + Ollama)
export async function queryOllamaRAG(query: string, docIds: string[] = [], topK = 5): Promise<any> {
  const headers = await getAuthHeaders();
  const payload: any = { query, top_k: topK };
  if (docIds && docIds.length) payload.doc_ids = docIds.slice(0, 4);

  // Note: chatbot URLs are mounted under /chatbot/ then the app's urls.py
  // the Ollama RAG view is registered at path("chat/ollama_rag/") inside chatbot.urls,
  // so the full path is /chatbot/chat/ollama_rag/
  const res = await fetch(joinUrl(API_URL, '/chatbot/chat/ollama_rag/'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.detail || json.error || json.message || 'Ollama RAG query failed');
    // @ts-ignore attach metadata for callers
    err.status = res.status;
    // @ts-ignore
    err.body = json;
    throw err;
  }
  return json;
}
