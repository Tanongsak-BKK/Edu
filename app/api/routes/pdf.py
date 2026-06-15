from fastapi import APIRouter, UploadFile, File, HTTPException
from app.utils.text import clean_text

router = APIRouter()

@router.post("/extract")
async def pdf_extract(pdf: UploadFile = File(...)):
    if not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "รองรับเฉพาะไฟล์ .pdf เท่านั้น")
    try:
        import pdfplumber
    except Exception:
        raise HTTPException(500, "กรุณาติดตั้ง pdfplumber: pip install pdfplumber")

    pages = []
    try:
        with pdfplumber.open(pdf.file) as doc:
            for p in doc.pages:
                pages.append(p.extract_text() or "")
    except Exception:
        raise HTTPException(422, "ไม่สามารถอ่านข้อความได้ (อาจเป็นไฟล์สแกน)")
    text = clean_text("\n\n".join(pages))
    if not text:
        raise HTTPException(422, "ไม่สามารถอ่านข้อความได้ (อาจเป็นไฟล์สแกน)")
    return {"text": text}
