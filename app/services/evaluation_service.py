from typing import Dict, Any, List
import json
from fastapi import HTTPException
from app.services.ai_service import client
from app.services.rag_service import RagService

class EvaluationService:
    @staticmethod
    def evaluate_reasoning(
        question: str, 
        user_answer: str, 
        context: str = "", 
        document_id: str = None,
        original_choices: List[str] = None
    ) -> Dict[str, Any]:
        
        ctx_raw = (context or "").strip()
        ans = (user_answer or "").strip()
        
        if not ans:
            raise HTTPException(400, "user_answer ว่าง")

        # 1. ดึง Ground Truth เฉพาะส่วนที่เกี่ยวข้องกับคำถามนั้นจริงๆ จาก RAG
        retrieved_context = RagService.get_relevant_context(
            ctx_raw, 
            query=f"{question} {ans}", 
            top_k=4, 
            force_rag_threshold=10000, 
            document_id=document_id
        )

        choices_str = ""
        if original_choices:
            choices_str = f"ตัวเลือกที่โจทย์กำหนดไว้: {', '.join(original_choices)}"

        # 2. Strict Prompt Architecture สำหรับกรรมมาการตรวจข้อสอบ (LLM-as-a-judge)
        prompt = f"""
คุณคือ "ศาสตราจารย์ผู้ตรวจข้อสอบ" ที่เข้มงวดและเป็นกลาง
หน้าที่ของคุณคือตรวจสอบว่า "เหตุผลหรือคำตอบ" ที่นักเรียนอธิบายมานั้น ถูกต้องตามหลักการที่ระบุในเนื้อหาอ้างอิง (Ground Truth) หรือไม่

[เนื้อหาอ้างอิง (Ground Truth)]
{retrieved_context}

[คำถามข้อสอบ]
{question}
{choices_str}

[คำตอบ/เหตุผลของนักเรียน]
{ans}

--- กฎการประเมินที่ต้องปฏิบัติตามอย่างเคร่งครัด (CRITICAL EVALUATION RULES) ---
1. **Semantic Equivalence:** ห้ามหักคะแนนหากนักเรียนใช้ภาษาพูด (Slang), พิมพ์ผิดเล็กน้อย, หรือใช้การเปรียบเปรย (Analogy) หาก "ความหมายเชิงตรรกะ" ตรงกับ Ground Truth ให้ถือว่าถูกต้อง
2. **Strict Grounding:** หากนักเรียนอธิบายสิ่งที่มีความหมายขัดแย้งกับ Ground Truth แม้แต่นิดเดียว ให้ถือว่า "ผิด (false)" ทันที
3. **No External Knowledge:** ห้ามใช้ความรู้ภายนอกของคุณมาให้คะแนน ถ้านักเรียนตอบสิ่งที่ถูกตามหลักความจริงทั่วไป แต่มันไม่มีใน Ground Truth หรือขัดแย้งกับ Ground Truth ให้ถือว่าผิด
4. **Guessing Detection:** หากนักเรียนตอบแบบกำกวม เลี่ยงบาลี หรืออธิบายวนไปวนมาโดยไม่เข้าประเด็น ให้ปรับตก (false) และให้คะแนนความมั่นใจต่ำ
5. **Partial Completeness:** หากนักเรียนตอบถูกแต่อธิบายไม่ครบ ให้ถือว่า "ถูก (true)" แต่ให้เขียนประเด็นที่ตกหล่นใน "missing_points"

จงวิเคราะห์อย่างเป็นเหตุเป็นผล และส่งคำตอบกลับมาในรูปแบบ JSON ตาม Schema นี้เท่านั้น:
{{
    "is_correct": boolean (ประเมินแล้วนักเรียนเข้าใจหลักการถูกต้องหรือไม่),
    "confidence_score": float (คะแนน 0.0 ถึง 1.0 ว่าคุณมั่นใจในการตัดสินของคุณแค่ไหน),
    "feedback": string (คำอธิบายสั้นๆ ชมเชยและชี้จุดที่เข้าใจผิดด้วยภาษาที่เป็นมิตร คล้ายครูสอนนักเรียน),
    "missing_points": [string] (สิ่งที่นักเรียนควรพูดถึงแต่นักเรียนไม่ได้พูดถึง ถ้าไม่มีให้ใส่ array ว่าง)
}}
"""
        
        try:
            r = client.chat.completions.create(
                model="gpt-4o", # ใช้ gpt-4o ตัวเต็มสำหรับการประเมินผลเชิงลึก เพื่อความแม่นยำสูงสุด
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1, # ใช้ Temperature ต่ำเพื่อให้ AI ประเมินอย่างสม่ำเสมอ
                response_format={"type": "json_object"},
            )
            data = json.loads(r.choices[0].message.content)
            
            # รับประกันว่ามี key ครบ
            return {
                "is_correct": bool(data.get("is_correct", False)),
                "confidence_score": float(data.get("confidence_score", 0.0)),
                "feedback": str(data.get("feedback", "")),
                "missing_points": data.get("missing_points", [])
            }
        except Exception as e:
            print(f"[Evaluation] Error: {e}")
            raise HTTPException(500, "ไม่สามารถประเมินคำตอบได้ในขณะนี้")
