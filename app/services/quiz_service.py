from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from app.core.config import settings
from app.services.ai_service import client
from app.utils.nlp import filter_near_dups, similar
from app.utils.text import safe_json_loads, truncate_text_chars


class QuizService:
    @staticmethod
    def extract_topics(context: str) -> List[str]:
        ctx = (context or "").strip()
        if not ctx:
            raise HTTPException(400, "context ว่าง")

        prompt = f"""
สกัดหัวข้อ/แนวคิดสำคัญจากเนื้อหาด้านล่าง (ไม่เกิน 30 หัวข้อ)
ตอบ JSON: {{"topics":["หัวข้อ1","หัวข้อ2"]}}
เนื้อหา:
{truncate_text_chars(ctx, settings.CTX_CHAR_LIMIT)}
"""
        try:
            r = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            data = safe_json_loads(r.choices[0].message.content, {"topics": []})
            return [str(t).strip() for t in data.get("topics", []) if str(t).strip()]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Topics generation failed: {e}") from e

    @staticmethod
    def generate_mcq(
        context: str,
        n: int,
        exclude: Optional[List[str]] = None,
        topics: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        return QuizService._generate_batch("mcq", context, n, exclude, topics)

    @staticmethod
    def generate_tf(
        context: str,
        n: int,
        exclude: Optional[List[str]] = None,
        topics: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        return QuizService._generate_batch("tf", context, n, exclude, topics)

    @staticmethod
    def _generate_batch(
        qtype: str,
        context: str,
        n: int,
        exclude: Optional[List[str]],
        topics: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        ctx = (context or "").strip()
        count = max(1, min(10, int(n or 5)))
        if not ctx:
            raise HTTPException(400, "context ว่าง")

        exclude_list = [str(x).strip() for x in (exclude or []) if str(x).strip()]
        topic_list = [str(t).strip() for t in (topics or []) if str(t).strip()] or None

        collected: List[Dict[str, Any]] = []
        tries = 0

        while len(collected) < count and tries < 2:
            need = count - len(collected)
            excludes_now = exclude_list + [str(q.get("question") or "") for q in collected]
            topic_hints = topic_list[:need] if topic_list else None
            request_n = need + 3 if tries == 0 else need

            if qtype == "mcq":
                batch = QuizService._gen_mcq_once(ctx, request_n, excludes_now, topic_hints)
            else:
                batch = QuizService._gen_tf_once(ctx, request_n, excludes_now, topic_hints)

            for q in batch:
                if len(collected) >= count:
                    break
                if all(
                    similar(str(q.get("question", "")), str(e.get("question", "")))
                    < settings.NEAR_DUP_THRESHOLD
                    for e in collected
                ):
                    collected.append(q)

            if topic_list:
                used = {str(q.get("topic", "")).strip().lower() for q in collected}
                topic_list = [t for t in topic_list if str(t).strip().lower() not in used]
            tries += 1

        return collected[:count]

    @staticmethod
    def _gen_mcq_once(
        ctx: str,
        n: int,
        exclude_list: List[str],
        topic_hints: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        exclude_block = ""
        if exclude_list:
            exclude_block = (
                "หลีกเลี่ยงการตั้งคำถามคล้ายกับ:\n"
                + "\n".join(f"- {q}" for q in exclude_list[: settings.EXCLUDE_LIST_LIMIT])
                + "\n"
            )
        topic_block = ""
        if topic_hints:
            topic_block = (
                "ให้สร้าง 'หัวข้อละ 1 ข้อ' จากหัวข้อต่อไปนี้:\n"
                + "\n".join(f"- {t}" for t in topic_hints[:n])
                + "\n"
            )

        prompt = f"""
สร้างข้อสอบปรนัย {n} ข้อ จากเนื้อหาด้านล่าง
- คำตอบถูกมีเพียงข้อเดียว
- ห้ามตัวเลือกแบบ "ถูกทุกข้อ/ทั้ง ก และ ข/ไม่ถูกสักข้อ"
- ตอบ JSON: {{"questions":[{{"type":"mcq","question":"...","choices":["ก) ...","ข) ...","ค) ...","ง) ..."],"answer":"ก|ข|ค|ง","explain":"...","topic":"..."}}]}}
{topic_block}{exclude_block}
เนื้อหา:
{truncate_text_chars(ctx, settings.CTX_CHAR_LIMIT)}
"""
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        data = safe_json_loads(r.choices[0].message.content, {"questions": []})
        return filter_near_dups(data.get("questions", []), exclude_list, threshold=settings.NEAR_DUP_THRESHOLD)

    @staticmethod
    def _gen_tf_once(
        ctx: str,
        n: int,
        exclude_list: List[str],
        topic_hints: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        exclude_block = ""
        if exclude_list:
            exclude_block = (
                "หลีกเลี่ยงการตั้งคำถามคล้ายกับ:\n"
                + "\n".join(f"- {q}" for q in exclude_list[: settings.EXCLUDE_LIST_LIMIT])
                + "\n"
            )
        topic_block = ""
        if topic_hints:
            topic_block = (
                "ให้สร้าง 'หัวข้อละ 1 ข้อ' จากหัวข้อต่อไปนี้:\n"
                + "\n".join(f"- {t}" for t in topic_hints[:n])
                + "\n"
            )

        prompt = f"""
สร้างข้อสอบ ถูก/ผิด จำนวน {n} ข้อ จากเนื้อหาด้านล่าง
- ให้เหตุผลสั้น ๆ ทุกข้อ
- ตอบ JSON: {{"questions":[{{"type":"tf","question":"...","answer":"true|false","explain":"...","topic":"..."}}]}}
{topic_block}{exclude_block}
เนื้อหา:
{truncate_text_chars(ctx, settings.CTX_CHAR_LIMIT)}
"""
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.25,
            response_format={"type": "json_object"},
        )
        data = safe_json_loads(r.choices[0].message.content, {"questions": []})
        return filter_near_dups(data.get("questions", []), exclude_list, threshold=settings.NEAR_DUP_THRESHOLD)
