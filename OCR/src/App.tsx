import React, { useState } from "react";
import Tesseract from "tesseract.js";

const OCRChatbot: React.FC = () => {
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedImage(file);
      setExtractedText(""); // Reset previous text
    }
  };

  const processImage = () => {
    if (!uploadedImage) {
      alert("Please upload an image first!");
      return;
    }

    setLoading(true);
    Tesseract.recognize(
      uploadedImage, // The uploaded image file
      "eng", // Language for OCR
      {
        logger: (info) => console.log(info), // Log progress
      }
    )
      .then(({ data: { text } }) => {
        setExtractedText(text.trim());
        setLoading(false);
      })
      .catch((error) => {
        console.error("OCR Error:", error);
        setLoading(false);
      });
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>🖼️ OCR Chatbot</h1>
      <p>Upload an image to extract text:</p>
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ marginBottom: "10px" }}
      />
      <button onClick={processImage} disabled={loading}>
        {loading ? "Processing..." : "Extract Text"}
      </button>
      {extractedText && (
        <div style={{ marginTop: "20px" }}>
          <h2>📜 Extracted Text:</h2>
          <p>{extractedText}</p>
        </div>
      )}
    </div>
  );
};

export default OCRChatbot;