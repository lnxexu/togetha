import { initLlama, LlamaContext } from "llama.rn";
import { ensureModel } from "../../../src/llama/setup";
import { Message, ChatResponse } from "./chatbotAPIService";
import RNFS from "react-native-fs";

const MODEL_NAME = "gemma-2-2b-it-Q4_K_M.gguf";

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
    messages?: Message[]
  ): Promise<ChatResponse> {
    if (!this.isInitialized || !this.context) {
      await this.initialize();
    }

    try {
      const conversationHistory = messages
        ?.slice(-5)
        ?.map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n") || "";

      const prompt = conversationHistory
        ? `${conversationHistory}\nUser: ${message}\nAssistant:`
        : `User: ${message}\nAssistant:`;

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
}

export const offlineChatService = new OfflineChatService();
export default offlineChatService;
