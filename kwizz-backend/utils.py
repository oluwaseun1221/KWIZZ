# utils.py
from fastapi import UploadFile, HTTPException
from io import BytesIO
from docx import Document  # python-docx


def _extract_pdf_text(content: bytes) -> str:
    """Reads a PDF. Uses PyMuPDF when it works, otherwise falls back to PyPDF2.

    PyMuPDF is imported here (not at the top of the file) so that a broken
    PyMuPDF install on Windows can never stop the whole backend from starting.
    """
    fitz = None
    try:
        import pymupdf as fitz  # PyMuPDF (new name)
    except Exception:
        try:
            import fitz  # older PyMuPDF versions
        except Exception:
            fitz = None

    if fitz is not None:
        with fitz.open(stream=content, filetype="pdf") as doc:
            return "".join(page.get_text() for page in doc)

    from PyPDF2 import PdfReader  # pure Python, no DLLs needed

    reader = PdfReader(BytesIO(content))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


async def extract_text_from_file(file: UploadFile) -> str:
    """Extracts text from PDF, Word (.docx) and plain text files."""
    try:
        file_content = await file.read()
        file_type = file.content_type

        if file_type == "application/pdf":
            return _extract_pdf_text(file_content)
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
