import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import * as mammoth from "mammoth"; // for docx
import "pdfjs-dist/build/pdf.worker.entry";

function UploadFile({ onTextExtracted }) {
  const [fileContent, setFileContent] = useState("");
  const [error, setError] = useState("");

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.type;
    setError("");
    setFileContent("");

    try {
      if (fileType === "application/pdf") {
        // Extract text from PDF
        const reader = new FileReader();
        reader.onload = async () => {
          const typedarray = new Uint8Array(reader.result);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          let text = "";
          for (let i = 0; i < pdf.numPages; i++) {
            const page = await pdf.getPage(i + 1);
            const content = await page.getTextContent();
            text += content.items.map((item) => item.str).join(" ") + "\n";
          }
          setFileContent(text);
          onTextExtracted?.(text);
        };
        reader.readAsArrayBuffer(file);
      } else if (
        fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        // Extract text from DOCX
        const reader = new FileReader();
        reader.onload = async () => {
          const result = await mammoth.extractRawText({
            arrayBuffer: reader.result,
          });
          setFileContent(result.value);
          onTextExtracted?.(result.value);
        };
        reader.readAsArrayBuffer(file);
      } else if (fileType === "text/plain") {
        // Extract text from TXT
        const reader = new FileReader();
        reader.onload = () => {
          setFileContent(reader.result);
          onTextExtracted?.(reader.result);
        };
        reader.readAsText(file);
      } else {
        setError("Unsupported file type. Please upload PDF, DOCX, or TXT.");
      }
    } catch (err) {
      console.error(err);
      setError("Error reading file. Please try again.");
    }
  };

  return (
    <div className="upload">
      <h2>Upload a File</h2>
      <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileChange} />
      {error && <p style={{ color: "red" }}>{error}</p>}
      {fileContent && (
        <div className="preview">
          <h3>Extracted Content:</h3>
          <pre>{fileContent.slice(0, 500)}...</pre>
        </div>
      )}
    </div>
  );
}

export default UploadFile;
