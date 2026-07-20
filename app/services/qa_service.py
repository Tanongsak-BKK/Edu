from fastapi import HTTPException

from app.core.config import settings
from app.services.ai_service import client
from app.utils.text import truncate_text_chars


class QAService:
    @staticmethod
    def answer(context: str, question: str, document_id: str = None) -> dict:
        ctx = (context or "").strip()
        q = (question or "").strip()
        if not ctx and not document_id:
            raise HTTPException(400, "context/document_id ว่าง")
        if not q:
            raise HTTPException(400, "question ว่าง")
            
        from app.services.rag_service import RagService
        ctx = RagService.get_relevant_context(ctx, q, top_k=10, force_rag_threshold=10000, document_id=document_id)

        system_instruction = """คุณคือผู้ช่วยสอนอัจฉริยะ (Smart Teaching Assistant) ที่เชี่ยวชาญการสรุปและตอบคำถามจากเอกสารการเรียนการสอนภาษาไทย
กฎเหล็กในการตอบคำถาม:
1. ห้ามเขียนภาษาจีน (Chinese) หรือภาษาอื่นใดที่ไม่ใช่ภาษาไทยในการอธิบายหรือระบุหมายเหตุด้านล่างคำตอบโดยเด็ดขาด! ทุกอย่างต้องเขียนเป็นภาษาไทย 100% เท่านั้น
2. อ้างอิงคำศัพท์ทางเทคนิค ตัวเลข และตำแหน่ง (เช่น Location 1, Location 2, Location 3, Location 4) จากเอกสารอ้างอิงให้ตรงตามความเป็นจริง ห้ามสร้างตัวเลขหรือตำแหน่งแปลกปลอมขึ้นมาเอง เช่น Location 14 เด็ดขาด
3. หากในเอกสารสะกดคำภาษาไทยผิด หรือมีสระ/วรรณยุกต์ซ้อนทับกันเนื่องจากการสกัดข้อความ ให้ช่วยขัดเกลาและแก้ไขคำสะกดเหล่านั้นให้ถูกต้องตามหลักพจนานุกรมภาษาไทยก่อนตอบ
"""

        user_content = f"""วิเคราะห์เนื้อหาเอกสารและตอบคำถามของผู้ใช้อย่างละเอียด เป็นขั้นตอน และเข้าใจง่าย

เนื้อหาเอกสารอ้างอิง:
---
{truncate_text_chars(ctx, settings.CTX_CHAR_LIMIT)}
---

คำถามของผู้ใช้: "{q}"

จงตอบคำถามนี้ตามกฎเหล็กและข้อมูลในเอกสารอ้างอิง:
"""
        try:
            res = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.15,
            )
            return {"answer": (res.choices[0].message.content or "").strip()}
        except Exception as e:
            raise HTTPException(500, f"QA failed: {e}") from e
