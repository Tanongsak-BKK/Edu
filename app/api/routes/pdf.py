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
                    if has_diagram:
                        # Analyze structural elements (graphs/networks) without repeating/duplicating standard text OCR
                        print(f"[PDF] Page {p.page_number} has diagrams. Running vision analysis...")
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
    
    # Save the original PDF file to static directory for visual rendering
    try:
        import os
        pdf_path = f"static/pdfs/{doc_id}.pdf"
        if not os.path.exists(pdf_path):
            pdf.file.seek(0)
            with open(pdf_path, "wb") as f:
                f.write(pdf.file.read())
    except Exception as e:
        print(f"[PDF] Warning: Could not save original PDF to disk: {e}")
    
    return {
        "document_id": doc_id, 
        "text": text,
        "pdf_url": f"http://localhost:8000/static/pdfs/{doc_id}.pdf"
    }
