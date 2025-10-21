import { initLlama, LlamaContext } from "llama.rn";
import { ensureModel } from "../../../src/llama/setup";
import { Message, ChatResponse } from "./chatbotTypes";
import RNFS from "react-native-fs";

const MODEL_NAME = "llama-3.2-3b-instruct-q4_k_m.gguf";

const SYSTEM_PROMPT = `
You are an AI tutoring assistant. Your goal is to provide clear, educational, and well-structured responses.

### Formatting Rules
- Use **bold** for emphasis and key points
- Use *italics* for definitions or explanations
- Use ### for headers and subheaders
- Use - for bullet lists
- Use 1. for numbered steps
- Use | tables | for structured data
- Use \`code blocks\` for technical terms or snippets
- Always be clear, helpful, and educational

### Context Handling
- Always refer only to the CURRENT conversation thread
- Files attached to a message apply only to THAT message
- If asked for "more examples" or "explain further," build on YOUR LAST RESPONSE
- If asked to summarize or generate quizzes, use YOUR PREVIOUS MESSAGE
- Uploaded documents remain available for analysis throughout the conversation
- Never reference unrelated conversations or external context
- If context is insufficient, ask the user for clarification

### File Handling
- Uploaded documents become part of the knowledge base for this conversation
- Acknowledge and use uploaded files when referenced
- If a file fails to upload, work with available information and ask the user to retry
`;


class OfflineChatService {
  private context: LlamaContext | null = null;
  private isInitialized = false;
  private isDownloading = false;

  async isModelDownloaded(): Promise<boolean> {
    const modelPath = `${RNFS.DocumentDirectoryPath}/${MODEL_NAME}`;
    return await RNFS.exists(modelPath);
  }

  async preloadModel(onProgress?: (progress: number) => void): Promise<void> {
    if (await this.isModelDownloaded()) {
      console.log("✅ Model already downloaded");
      return;
    }

    if (this.isDownloading) {
      throw new Error("Model download already in progress");
    }

    try {
      this.isDownloading = true;
      console.log("⬇️ Preloading offline model...");
      await ensureModel();
      console.log("✅ Model preloaded successfully");
    } catch (error) {
      console.error("❌ Model preload failed:", error);
      throw new Error("Failed to download offline model");
    } finally {
      this.isDownloading = false;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log("🔄 Initializing offline AI...");
      const modelPath = await ensureModel();
      
      this.context = await initLlama({
        model: modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 0,
      });

      this.isInitialized = true;
      console.log("✅ Offline AI ready");
    } catch (error) {
      console.error("❌ Offline AI init failed:", error);
      throw new Error("Failed to initialize offline AI");
    }
  }

  async sendMessage(
    message: string,
    conversationId?: string,
    messages?: Message[],
    onToken?: (token: string) => void
  ): Promise<ChatResponse> {
    if (!this.isInitialized || !this.context) {
      await this.initialize();
    }

    try {
      const conversationHistory = messages
        ?.slice(-5)
        ?.map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n") || "";

      // 🧩 Combine the system priming, conversation history, and new message
      const prompt = `
${SYSTEM_PROMPT.trim()}

${conversationHistory}

User: ${message}
Assistant:
      `.trim();

      let fullResponse = "";

      const response = await this.context!.completion(
        {
          prompt,
          n_predict: 512,
          temperature: 0.7,
          top_p: 0.9,
          stop: ["User:"],
        },
        (data) => {
          if (data.token) {
            fullResponse += data.token;
            try {
              if (onToken) onToken(data.token);
            } catch (e) {
              // Ensure token callbacks don't break generation
              console.warn('onToken callback error:', e);
            }
          }
        }
      );

      const finalContent = (fullResponse || response.text || "").trim();

      return {
        content: finalContent || "I'm processing your request offline. Please try again.",
        source: "offline",
        conversation_id: conversationId || "offline-" + Date.now(),
        message_id: "msg-" + Date.now(),
      };
    } catch (error) {
      console.error("❌ Offline message failed:", error);
      throw new Error("Offline AI processing failed. Please check if the model is properly downloaded.");
    }
  }

  async release(): Promise<void> {
    if (this.context) {
      await this.context.release();
      this.context = null;
      this.isInitialized = false;
      console.log("🔄 Offline AI released");
    }
  }

  // Fetch embeddings from backend and persist as JSON locally.
  async syncEmbeddingsToLocal(opts?: { docId?: string; pageSize?: number; onProgress?: (p: number) => void; }) {
    const docId = opts?.docId;
    const pageSize = opts?.pageSize || 1000;
    const onProgress = opts?.onProgress;

    let page = 1;
    let allChunks: any[] = [];

    // Dynamically import chatbotAPI here to avoid circular static imports between
    // offlineServices and chatbotAPIService. This keeps module initialization order safe.
    const { chatbotAPI } = await import('./chatbotAPIService');

    while (true) {
      const resp = await chatbotAPI.exportEmbeddings(docId, page, pageSize);
      const chunks = resp.chunks || [];
      allChunks = allChunks.concat(chunks);

      const total = resp.total || allChunks.length;
      const fetched = allChunks.length;
      if (onProgress) onProgress(Math.min(1, fetched / (total || 1)));

      if (fetched >= total || chunks.length === 0) break;
      page += 1;
    }

    const output = {
      exported_at: new Date().toISOString(),
      total: allChunks.length,
      chunks: allChunks,
    };

    const filename = `embeddings_export_${docId || 'all'}_${Date.now()}.json`;
    const path = `${RNFS.DocumentDirectoryPath}/${filename}`;

    await RNFS.writeFile(path, JSON.stringify(output), 'utf8');
    // use any to avoid typing mismatch with RNFS types
    const stat: any = await (RNFS as any).stat(path);
    return { path, filename, size: stat.size };
  }

  // --- Local embeddings index helpers ---
  private getLocalIndexPath(): string {
    return `${RNFS.DocumentDirectoryPath}/embeddings_index.json`;
  }

  private async loadLocalIndex(): Promise<{ exported_at?: string; total?: number; chunks: any[] }> {
    const path = this.getLocalIndexPath();
    try {
      const exists = await RNFS.exists(path);
      if (!exists) return { chunks: [] };
      const raw = await RNFS.readFile(path, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.chunks)) return { chunks: [] };
      return parsed;
    } catch (err) {
      console.warn('Failed to load local embeddings index:', err);
      return { chunks: [] };
    }
  }

  private async saveLocalIndex(index: { exported_at?: string; total?: number; chunks: any[] }) {
    const path = this.getLocalIndexPath();
    try {
      await RNFS.writeFile(path, JSON.stringify(index), 'utf8');
      return { path };
    } catch (err) {
      console.error('Failed to save local embeddings index:', err);
      throw err;
    }
  }

  // Import embeddings JSON file (created by syncEmbeddingsToLocal) into local index.
  // Performs simple deduplication using (doc_id + created_at + first-100-chars-of-chunk) key.
  async importEmbeddingsFromLocal(filePath: string, opts?: { onProgress?: (p: number) => void; mergeStrategy?: 'skip' | 'replace' }) {
    const onProgress = opts?.onProgress;
    const mergeStrategy = opts?.mergeStrategy || 'skip';

    // Read external file
    let raw: string;
    try {
      raw = await RNFS.readFile(filePath, 'utf8');
    } catch (err) {
      console.error('Failed to read embeddings file:', err);
      throw new Error('Unable to read embeddings file');
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON in embeddings file:', err);
      throw new Error('Invalid JSON file');
    }

    const incoming: any[] = Array.isArray(payload.chunks) ? payload.chunks : [];
    if (incoming.length === 0) return { imported: 0, total: 0 };

    // Load existing local index
    const local = await this.loadLocalIndex();
    const existing = local.chunks || [];

    // Build dedupe set
    const makeKey = (c: any) => `${c.doc_id || 'none'}|${c.created_at || ''}|${(c.chunk_text || '').slice(0, 100)}`;
    const existingKeys = new Set(existing.map(makeKey));

    let imported = 0;
    const total = incoming.length;

    for (let i = 0; i < incoming.length; i++) {
      const c = incoming[i];
      if (!c) continue;
      const key = makeKey(c);
      if (existingKeys.has(key)) {
        if (mergeStrategy === 'replace') {
          // find and replace
          const idx = existing.findIndex(e => makeKey(e) === key);
          if (idx !== -1) existing[idx] = c;
          imported += 1;
        } else {
          // skip
          continue;
        }
      } else {
        existing.push(c);
        existingKeys.add(key);
        imported += 1;
      }

      if (onProgress && total > 0) onProgress((i + 1) / total);
    }

    // Persist merged index
    const out = {
      exported_at: new Date().toISOString(),
      total: existing.length,
      chunks: existing,
    };

    await this.saveLocalIndex(out);

    return { imported, total, local_total: existing.length, path: this.getLocalIndexPath() };
  }
}

export const offlineChatService = new OfflineChatService();
export default offlineChatService;

// Persist embeddings JSON to device storage
// Note: syncEmbeddingsToLocal is implemented as a class method above.
