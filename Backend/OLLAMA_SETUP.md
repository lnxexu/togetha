# Ollama Setup for AI Assistant

## Installation

1. **Download Ollama**:
   - Visit: https://ollama.ai/download
   - Download for your operating system

2. **Install llama3.2 model**:
   ```bash
   ollama pull llama3.2
   ```

3. **Start Ollama service**:
   ```bash
   ollama serve
   ```
   - This runs on `http://localhost:11434` by default

4. **Verify installation**:
   ```bash
   ollama list
   ```
   - Should show `llama3.2` in the list

## Usage

The AI assistant will automatically connect to Ollama when:
- Ollama service is running on localhost:11434
- llama3.2 model is available
- User queries text through the RAG pipeline

## Troubleshooting

- **Connection failed**: Ensure Ollama service is running
- **Model not found**: Run `ollama pull llama3.2`
- **Timeout errors**: Increase timeout in RAG_view.py if needed