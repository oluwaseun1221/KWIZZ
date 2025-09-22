# utils.py
from fastapi import UploadFile, HTTPException
import pypandoc
from io import BytesIO
import fitz  # PyMuPDF

async def extract_text_from_file(file: UploadFile) -> str:
    """Extracts text from various file types."""
    try:
        file_content = await file.read()
        file_type = file.content_type

        if file_type == "application/pdf":
            with fitz.open(stream=file_content, filetype="pdf") as doc:
                text = ""
                for page in doc:
                    text += page.get_text()
            return text
        elif file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            # Assuming pypandoc is configured to use pandoc correctly
            # You may need to install pandoc on your system for this to work
            return pypandoc.convert_text(file_content, "plain", format="docx")
        elif file_type == "text/plain":
            return file_content.decode("utf-8")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {e}")