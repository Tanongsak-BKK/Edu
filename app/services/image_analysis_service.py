import base64
import json
import traceback
from io import BytesIO
from typing import Dict, Any

from app.services.ai_service import client

class ImageAnalysisService:
    
    @staticmethod
    def encode_image(pil_image) -> str:
        buffered = BytesIO()
        # Convert to RGB to avoid issues with RGBA PNGs
        pil_image.convert("RGB").save(buffered, format="JPEG", quality=85)
        return base64.b64encode(buffered.getvalue()).decode('utf-8')

    @staticmethod
    def _parse_json_robust(text: str) -> dict:
        if not text:
            return {}
        text = text.strip()
        import re
        # Remove markdown code block wrappers
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        text = text.strip()
        try:
            return json.loads(text)
        except Exception:
            # Fallback: try to find anything between { and }
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    pass
        return {}

    @staticmethod
    def _ocr_space_fallback(base64_img: str) -> str:
        try:
            import requests
            url = "https://api.ocr.space/parse/image"
            # Ensure base64 string doesn't have the prefix
            if "," in base64_img:
                base64_img = base64_img.split(",")[1]
            payload = {
                "apikey": "helloworld",
                "language": "tha", # Supports Thai and English
                "isOverlayRequired": False,
                "OCREngine": 2, # Engine 2 supports Thai
                "base64image": f"data:image/jpeg;base64,{base64_img}"
            }
            res = requests.post(url, data=payload, timeout=12)
            if res.status_code == 200:
                data = res.json()
                if not data.get("IsErroredOnProcessing"):
                    results = data.get("ParsedResults", [])
                    if results:
                        return results[0].get("ParsedText", "").strip()
                else:
                    print(f"[OCR Fallback] API error: {data.get('ErrorMessage')}")
        except Exception as ex:
            print(f"[OCR Fallback] Connection/API failed: {ex}")
        return ""

    @staticmethod
    def process_pdf_page(page, ocr_only: bool = False, skip_ocr: bool = False) -> str:
        """
        ประมวลผลหน้า PDF เป็นรูปภาพโดยใช้ 3 เทคนิคขั้นสูง:
        1. Hybrid OCR
        2. Structured JSON Output
        3. Reflection (Self-Correction)
        มีระบบ Fallback ไปยัง OCR.space API ในกรณีที่ Ollama/Local Vision ล้มเหลว
        """
        # เรนเดอร์หน้า PDF เป็นรูปภาพด้วยความละเอียดสูง (200 DPI) เทียบเท่าเทคนิค Grid Tiling สำหรับหน้า A4
        try:
            pil_image = page.to_image(resolution=200).original
            base64_img = ImageAnalysisService.encode_image(pil_image)
        except Exception as e:
            print(f"[Vision] Could not render page to image: {e}")
            return ""
            
        print(f"[Vision] Processing page {page.page_number} with Vision AI (ocr_only={ocr_only}, skip_ocr={skip_ocr})...")
        
        # --- PASS 1: Hybrid OCR + Structure Extraction ---
        if ocr_only:
            prompt_pass1 = """
            Extract all Thai and English text from this image.
            Response must be in JSON format:
            {
              "raw_ocr": "Put all extracted text here"
            }
            Do not include diagrams or structures. Perform actual OCR.
            """
        elif skip_ocr:
            prompt_pass1 = """
            Analyze any diagrams, networks, graphs, or charts in this image.
            Response must be in JSON format:
            {
              "structure": {
                 "nodes": ["list of devices/nodes if any"],
                 "edges": ["list of connections if any"],
                 "datapoints": ["list of data points/axes if any"]
               }
            }
            Ignore plain paragraph text. Only analyze structural elements/diagrams.
            """
        else:
            prompt_pass1 = """
            Extract all text and structure from this image.
            Response must be in JSON format:
            {
              "raw_ocr": "Put all extracted Thai and English text here",
              "structure": {
                 "nodes": ["list of devices/nodes if any"],
                 "edges": ["list of connections if any"],
                 "datapoints": ["list of data points/axes if any"]
               }
            }
            Do not repeat these instructions in the JSON. Perform actual OCR.
            """
        
        try:
            # Try Local Ollama Vision first
            res1 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt_pass1},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                        ]
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            pass1_json_str = res1.choices[0].message.content
            pass1_data = ImageAnalysisService._parse_json_robust(pass1_json_str)
            
            # If JSON parsing failed entirely but we got raw text, use it as fallback for ocr_only
            if not pass1_data and ocr_only:
                if pass1_json_str:
                    return f"\nข้อความที่สแกนจากภาพ: {pass1_json_str.strip()}\n"
                raise ValueError("Empty response from local vision AI")
                
            if ocr_only:
                raw_ocr = pass1_data.get("raw_ocr", "")
                if raw_ocr:
                    return f"\nข้อความที่สแกนจากภาพ: {raw_ocr}\n"
                return ""
            
            # --- PASS 2: Reflection & QA Auditor ---
            if skip_ocr:
                prompt_pass2 = f"""
                You are a QA Auditor checking diagram data extracted from the image.
                First pass data:
                {pass1_json_str}
                
                Verify that the diagram structure matches the image.
                Return a JSON response:
                {{
                    "is_complex_diagram": true if this image contains a diagram/chart/network/circuit, false otherwise,
                    "summary": "Brief explanation of what this diagram/chart represents in Thai",
                    "verified_structure": {{ verified nodes/edges/datapoints }}
                }}
                """
            else:
                prompt_pass2 = f"""
                You are a QA Auditor checking data extracted from the image.
                First pass data:
                {pass1_json_str}
                
                Verify that the extracted structure matches the image.
                Return a JSON response:
                {{
                    "is_complex_diagram": true if this image contains a diagram/chart/network/circuit, false if it is just plain text or decorative illustration,
                    "summary": "Brief summary of the image content in Thai",
                    "verified_structure": {{ verified nodes/edges/datapoints }}
                }}
                """
            
            res2 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt_pass2},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                        ]
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            
            final_data = ImageAnalysisService._parse_json_robust(res2.choices[0].message.content)
            
            # If final parsing failed but pass1 succeeded, fallback to pass1 data
            if not final_data:
                final_data = {
                    "is_complex_diagram": bool(pass1_data.get("structure")),
                    "summary": "สแกนแผนผังรูปภาพในหน้าเอกสาร",
                    "verified_structure": pass1_data.get("structure", {})
                }
            
            # ถอดรหัสสิ่งที่ได้กลับมาเป็น Markdown เพื่อนำไปทำ RAG
            output_text = "\n\n"
            
            if skip_ocr:
                if final_data.get("is_complex_diagram", False):
                    output_text += f"--- ข้อมูลรูปภาพ/แผนผัง (หน้าที่ {page.page_number}) ---\n"
                    output_text += f"บทสรุปภาพรวมแผนผัง: {final_data.get('summary', '')}\n"
                    output_text += f"โครงสร้างเชิงลึก (Nodes/Edges/Data):\n"
                    output_text += json.dumps(final_data.get("verified_structure", {}), ensure_ascii=False, indent=2) + "\n"
                    output_text += "------------------------\n\n"
                return output_text
                
            # ถ้าเป็นแค่ข้อความธรรมดา (ไม่มีกราฟ) คืนค่าแค่ OCR ก็พอ
            if not final_data.get("is_complex_diagram", False):
                raw_ocr = pass1_data.get("raw_ocr", "")
                if raw_ocr:
                    output_text += f"ข้อความจากภาพ: {raw_ocr}\n"
                return output_text
                
            # ถ้าเป็น Diagram จัดเรียงข้อมูลให้สวยงาม
            output_text += f"--- ข้อมูลรูปภาพ/แผนผัง (หน้าที่ {page.page_number}) ---\n"
            output_text += f"บทสรุปภาพรวม: {final_data.get('summary', '')}\n"
            output_text += f"โครงสร้างเชิงลึก (Nodes/Edges/Data):\n"
            output_text += json.dumps(final_data.get("verified_structure", {}), ensure_ascii=False, indent=2) + "\n"
            
            raw_ocr = pass1_data.get("raw_ocr", "")
            if raw_ocr:
                output_text += f"\nป้ายกำกับและข้อความดิบในภาพ:\n{raw_ocr}\n"
                
            output_text += "------------------------\n\n"
            return output_text
            
        except Exception as e:
            print(f"[Vision] Local vision model failed: {e}. Attempting OCR.space fallback...")
            fallback_text = ImageAnalysisService._ocr_space_fallback(base64_img)
            if fallback_text:
                print(f"[Vision] OCR.space fallback succeeded for page {page.page_number}!")
                if ocr_only:
                    return f"\nข้อความที่สแกนจากภาพ: {fallback_text}\n"
                else:
                    return f"\n--- ข้อมูลรูปภาพ/แผนผัง (หน้าที่ {page.page_number}) ---\nข้อความจากการสแกนภาพ:\n{fallback_text}\n------------------------\n\n"
            return ""
