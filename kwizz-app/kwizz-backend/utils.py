# utils.py
from fastapi import UploadFile, HTTPException
from io import BytesIO
try:
    import pymupdf as fitz  # PyMuPDF (new name)
except ImportError:
    import fitz  # older PyMuPDF versions
from docx import Document  # python-docx

async def extract_text_from_file(file: UploadFile) -> str:
    """Extracts text from PDF, Word (.docx) and plain text files."""
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
            # python-docx reads .docx directly, so no pandoc install is needed
            doc = Document(BytesIO(file_content))
            return "\n".join(p.text for p in doc.paragraphs)
        elif file_type == "text/plain":
            return file_content.decode("utf-8")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {e}")
