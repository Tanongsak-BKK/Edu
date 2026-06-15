from fastapi import HTTPException

from app.core.config import settings
from app.services.ai_service import client
from app.utils.text import truncate_text_chars


class QAService:
    @staticmethod
    def answer(context: str, question: str) -> dict:
        ctx = (context or "").strip()
        q = (question or "").strip()
        if not ctx or not q:
            raise HTTPException(400, "context/question ว่าง")

        prompt = f"""
ตอบคำถามโดยอ้างอิง "เฉพาะ" เนื้อหาที่ให้ด้านล่างเท่านั้น
ถ้าไม่พบคำตอบ ให้ตอบว่า: ไม่พบในเนื้อหาที่ให้มา
เนื้อหา:
{truncate_text_chars(ctx, settings.CTX_CHAR_LIMIT)}

คำถาม: {q}
ตอบ:
"""
        try:
            res = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.15,
            )
            return {"answer": (res.choices[0].message.content or "").strip()}
        except Exception as e:
            raise HTTPException(500, f"QA failed: {e}") from e
