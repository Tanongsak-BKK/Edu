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
        from app.services.image_analysis_service import ImageAnalysisService
        with pdfplumber.open(pdf.file) as doc:
            for p in doc.pages:
                extracted_text = p.extract_text() or ""
                cleaned_extracted = extracted_text.strip()
                
                # Check if this page is scanned (has very little digital text)
                is_scanned = len(cleaned_extracted) < 80
                
                # Check if there are complex diagrams/images on this page
                has_diagram = len(p.images) > 0 or len(p.curves) > 15
                
                if is_scanned:
                    # Scanned page: Run vision OCR only to extract text
                    print(f"[PDF] Page {p.page_number} detected as scanned. Running vision OCR...")
                    vision_text = ImageAnalysisService.process_pdf_page(p, ocr_only=True)
                    text = vision_text if vision_text else cleaned_extracted
                else:
                    # Searchable text page: Use clean digital text
                    text = cleaned_extracted
                    # Only analyze complex diagrams if images exist and digital text is minimal
                    if len(p.images) > 1 and len(cleaned_extracted) < 300:
                        print(f"[PDF] Page {p.page_number} has complex diagrams. Running vision analysis...")
                        vision_text = ImageAnalysisService.process_pdf_page(p, skip_ocr=True)
                        if vision_text:
                            text = text + "\n" + vision_text
                
                pages.append(text)
    except Exception as e:
        print(f"PDF Parsing Error: {e}")
        raise HTTPException(422, "ไม่สามารถอ่านข้อความได้ (อาจเป็นไฟล์สแกน)")
    text = clean_text("\n\n".join(pages))
    if not text:
        raise HTTPException(422, "ไม่สามารถอ่านข้อความได้ (อาจเป็นไฟล์สแกน)")
        
    from app.services.rag_service import RagService
    doc_id = RagService.save_document(text)
    
    # Read PDF content once
    pdf.file.seek(0)
    pdf_bytes = pdf.file.read()
    
    # Save original PDF locally for static rendering fallback
    try:
        import os
        pdf_path = f"static/pdfs/{doc_id}.pdf"
        if not os.path.exists(pdf_path):
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)
    except Exception as e:
        print(f"[PDF] Warning: Could not save original PDF to disk: {e}")
        
    # Upload original PDF to Firebase Cloud Storage
    from app.db.firebase import upload_file_to_storage
    firebase_url = upload_file_to_storage(pdf_bytes, f"pdfs/{doc_id}.pdf", content_type="application/pdf")
    pdf_url = firebase_url if firebase_url else f"/static/pdfs/{doc_id}.pdf"
    print(f"[PDF] Final PDF URL: {pdf_url}")

    return {
        "document_id": doc_id, 
        "text": text,
        "pdf_url": pdf_url
    }
