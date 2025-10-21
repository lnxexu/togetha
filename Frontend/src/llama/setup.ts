import RNFS from "react-native-fs";

const MODEL_NAME = "llama-3.2-3b-instruct-q4_k_m.gguf";
const MODEL_URL =
  "https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf";

export async function ensureModel(): Promise<string> {
  const modelPath = `${RNFS.DocumentDirectoryPath}/${MODEL_NAME}`;
  console.log("📂 Model path:", modelPath);

  const exists = await RNFS.exists(modelPath);
  if (exists) {
    console.log("✅ Model ready");
    return modelPath;
  }

  console.log("⬇️ Downloading Llama model...");

  const download: any = RNFS.downloadFile({
    fromUrl: MODEL_URL,
    toFile: modelPath,
    progressDivider: 1,
    begin: () => console.log("📦 Starting download..."),
    progress: (res: any) => {
      const percent = Math.floor((res.bytesWritten / res.contentLength) * 100);
      console.log(`📥 Downloading: ${percent}%`);
    },
  });

  const result = await download.promise;

  if (result.statusCode === 200) {
    console.log("✅ Download complete!");
    return modelPath;
  }
  throw new Error(`Download failed with status: ${result.statusCode}`);
}
