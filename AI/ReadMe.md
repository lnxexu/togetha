# 🔧 AI Document Processing Setup Guide

This guide will help you set up your local environment for running a document processing and retrieval system using **Ollama**, **LangChain**, and **Tesseract OCR**.

## 📥 Step 1: Install Ollama (Local LLM Engine)

1. Download the installer for your OS from the official Ollama site:  
   👉 [https://ollama.com/download](https://ollama.com/download)

2. Follow the installation instructions.

3. After installing, open **Command Prompt (CMD)** and run:

   ```bash
   ollama run llama3
⚠️ This will download the LLaMA 3 model and may take a few minutes depending on your internet speed.

💻 Step 2: Install Python Dependencies
Open VS Code or your terminal and install the required Python packages:

bash
Copy
Edit
pip install langchain faiss-cpu pypdf python-docx unstructured tiktoken pytesseract pillow
🧠 Step 3: Install Tesseract OCR
Tesseract is required for image-based OCR (Optical Character Recognition).

Visit the official UB Mannheim Tesseract page:
👉 https://github.com/UB-Mannheim/tesseract/wiki

Download and install the appropriate version (64-bit or 32-bit) for your system.

During installation, note the installation path, e.g.:

makefile
Copy
Edit
C:\Users\YourName\AppData\Local\Programs\Tesseract-OCR
⚙️ Step 4: Add Tesseract to System Environment Variables
Open Start Menu, search and open:

perl
Copy
Edit
Edit the system environment variables
Click on "Environment Variables…"

Under User Variables, do the following:

Click New

Variable Name: (Optional) TESSERACT_PATH

Variable Value: Paste your Tesseract install path

Then under the Path variable (still in User Variables):

Click Edit

Click New, and add the same path (e.g. C:\Users\YourName\AppData\Local\Programs\Tesseract-OCR)

Click OK to save all changes.

✅ You're All Set!
You can now:

Run ollama run llama3 to use LLMs locally

Use OCR via Tesseract for scanned image files

Process documents and retrieve context with LangChain
