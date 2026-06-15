import json
from typing import Any, Dict, List

from fastapi import HTTPException

from app.db.firebase import log_user_event
from app.services.ai_service import client
from app.utils.text import clean_text, numbered_sentences, safe_json_loads, truncate_text_chars


class SummarizeService:
    @staticmethod
    def summarize(context: str, uid: str) -> Dict[str, Any]:
        ctx_raw = (context or "").strip()
        if not ctx_raw:
            raise HTTPException(400, "context ว่าง")

        ctx = clean_text(truncate_text_chars(ctx_raw, 45000))
        sent_items = numbered_sentences(ctx, max_sentences=800)
        if not sent_items:
            raise HTTPException(422, "เอกสารสั้นเกินไป")

        sent_block = "\n".join(f"[{it['id']}] {it['text']}" for it in sent_items)

        try:
            prompt_sections = f"""
คุณเป็นครูบรรณาธิการสรุปเอกสารแบบยึดตามข้อความเท่านั้น
- อ่านเฉพาะ "รายการประโยคมีเลขกำกับ"
- สกัดหัวข้อหลัก 5–9 หัวข้อ และสรุปหัวข้อละ 3–6 ประโยค
ตอบเป็น JSON: {{"sections":[{{"title":"...","summary":"..."}}]}}
รายการประโยค:
{sent_block}
"""
            res1 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt_sections}],
                temperature=0.15,
                response_format={"type": "json_object"},
            )
            sec_json = safe_json_loads(res1.choices[0].message.content, {"sections": []})
            sections = sec_json.get("sections", [])
            if not isinstance(sections, list):
                sections = []

            prompt_overview = f"""
คุณเป็นผู้ช่วยสรุประดับอาจารย์ ใช้เฉพาะข้อมูลจาก "รายการประโยค" และ "หัวข้อ" ด้านล่าง
ตอบ JSON เดียว: {{"overview":"...","key_points":["..."],"data_points":[{{"label":"...","value":"...","unit":"..."}}]}}

สำหรับ data_points ให้พยายามดึงข้อมูลที่เป็น:
1. ตัวเลขสถิติ หรือ จำนวน
2. ปี พ.ศ./ค.ศ. หรือ วันที่สำคัญ
3. ชื่อเฉพาะที่สำคัญ หรือ ประเภท/หมวดหมู่
ถ้าไม่มีตัวเลข ให้ดึงข้อมูลสำคัญสั้นๆ มาใส่ใน value แทน

รายการประโยค:
{truncate_text_chars(ctx, 45000)}
หัวข้อ:
{json.dumps({"sections": sections}, ensure_ascii=False)}
"""
            res2 = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "คุณสรุปได้กระชับ ชัด และยึดข้อความต้นฉบับเท่านั้น"},
                    {"role": "user", "content": prompt_overview},
                ],
                temperature=0.15,
                response_format={"type": "json_object"},
            )
            ov_json = safe_json_loads(
                res2.choices[0].message.content,
                {"overview": "", "key_points": [], "data_points": []},
            )

            def _norm_list(x):
                return x if isinstance(x, list) else []

            def _norm_str(x):
                return (x or "").strip()

            cleaned_sections: List[Dict[str, str]] = []
            for s in sections:
                if isinstance(s, dict):
                    title = _norm_str(s.get("title", ""))
                    summary = _norm_str(s.get("summary", ""))
                    if title and summary:
                        cleaned_sections.append({"title": title, "summary": summary})

            cleaned_dps: List[Dict[str, str]] = []
            for d in _norm_list(ov_json.get("data_points", [])):
                if isinstance(d, dict):
                    label = _norm_str(d.get("label", ""))
                    value = _norm_str(d.get("value", ""))
                    unit = _norm_str(d.get("unit", ""))
                    if label and value:
                        item: Dict[str, str] = {"label": label, "value": value}
                        if unit:
                            item["unit"] = unit
                        cleaned_dps.append(item)

            result: Dict[str, Any] = {
                "overview": _norm_str(ov_json.get("overview", "")),
                "key_points": _norm_list(ov_json.get("key_points", [])),
                "sections": cleaned_sections,
                "data_points": cleaned_dps,
            }

            log_user_event(
                uid,
                "summaries",
                {
                    "textLength": len(ctx_raw),
                    "source": "text",
                    "status": "success",
                    "summary": result,
                },
            )
            return result
        except HTTPException:
            raise
        except Exception as e:
            try:
                log_user_event(
                    uid,
                    "summaries",
                    {"textLength": len(ctx_raw), "source": "text", "status": "error", "errorMessage": str(e)},
                )
            except Exception:
                pass
            raise HTTPException(500, f"Summarize failed: {e}") from e
