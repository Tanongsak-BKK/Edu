from typing import List, Dict
from datetime import datetime
from fastapi import HTTPException
from app.db.firebase import get_firestore_db, firestore
from app.models.history import QuizHistoryIn, RenameHistoryIn

class HistoryService:
    @staticmethod
    def save_history_item(uid: str, body: QuizHistoryIn) -> Dict:
        db = get_firestore_db()
        if not db:
            raise HTTPException(500, "Database not connected")
        try:
            data = {
                "fileName": body.file_name,
                "overview": body.overview,
                "keyPoints": body.key_points,
                "sections": body.sections,
                "dataPoints": body.data_points,
                "questions": body.questions,
                "answers": body.answers,
                "score": body.score,
                "content": body.content,
                "document_id": body.document_id,
                "totalQuestions": len(body.questions),
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "qa_history": [q.model_dump() if hasattr(q, 'model_dump') else q.dict() for q in body.qa_history],
            }
            update_time, ref = db.collection("users").document(uid).collection("histories").add(data)
            return {"ok": True, "message": "History saved", "id": ref.id}
        except Exception as e:
            raise HTTPException(500, f"Save history failed: {e}")

    @staticmethod
    def _heal_history_item(db, uid: str, item_id: str, item: Dict) -> str:
        file_name = item.get("fileName")
        if not file_name or not file_name.lower().endswith(".pdf"):
            return ""
            
        import re
        clean_name = re.sub(r"\.pdf$", "", file_name, flags=re.IGNORECASE).strip()
        words = [w.lower() for w in re.split(r"[\s\-_“”( )]+", clean_name) if w]
        if not words:
            return ""
            
        try:
            caches = db.collection("rag_cache").get()
            best_match = None
            best_score = 0
            
            for c in caches:
                cdata = c.to_dict()
                raw_text = cdata.get("raw_text", "")
                if not raw_text:
                    continue
                    
                match_count = 0
                for w in words:
                    norm_w = re.sub(r"\W+", "", w).lower()
                    norm_text = re.sub(r"\W+", "", raw_text).lower()
                    if norm_w and norm_w in norm_text:
                        match_count += 1
                
                if len(words) > 0:
                    score = match_count / len(words)
                    if score >= 0.5 and score > best_score:
                        best_score = score
                        best_match = c.id
                        
            if best_match:
                print(f"[History Healing] Healing history item {item_id} with document_id: {best_match}")
                db.collection("users").document(uid).collection("histories").document(item_id).update({
                    "document_id": best_match
                })
                return best_match
        except Exception as e:
            print(f"[History Healing] Error healing {item_id}: {e}")
            
        return ""

    @staticmethod
    def get_history_list(uid: str) -> List[Dict]:
        db = get_firestore_db()
        if not db or not firestore:
            return []
        try:
            docs = db.collection("users").document(uid).collection("histories")\
                     .order_by("timestamp", direction=firestore.Query.DESCENDING)\
                     .limit(30).stream()
            results = []
            for d in docs:
                item = d.to_dict()
                item["id"] = d.id
                if not item.get("document_id"):
                    healed_id = HistoryService._heal_history_item(db, uid, d.id, item)
                    if healed_id:
                        item["document_id"] = healed_id
                results.append(item)
            return results
        except Exception as e:
            print(f"[History] Get list error: {e}")
            return []

    @staticmethod
    def delete_history_item(uid: str, item_id: str) -> Dict:
        db = get_firestore_db()
        if not db:
            raise HTTPException(500, "Database not connected")
        try:
            # ลบประวัติการใช้งาน
            db.collection("users").document(uid).collection("histories").document(item_id).delete()
            # ลบโน้ตที่เกี่ยวข้องเพื่อป้องกันข้อมูลตกค้าง (Orphaned Note)
            db.collection("users").document(uid).collection("notes").document(item_id).delete()
            return {"ok": True}
        except Exception as e:
            raise HTTPException(500, f"Delete failed: {e}")

    @staticmethod
    def rename_history_item(uid: str, item_id: str, body: RenameHistoryIn) -> Dict:
        db = get_firestore_db()
        if not db:
            raise HTTPException(500, "Database not connected")
        try:
            ref = db.collection("users").document(uid).collection("histories").document(item_id)
            ref.update({"fileName": body.new_name})
            return {"ok": True}
        except Exception as e:
            raise HTTPException(500, f"Rename failed: {e}")

    @staticmethod
    def update_history_item(uid: str, item_id: str, body: QuizHistoryIn) -> Dict:
        db = get_firestore_db()
        if not db:
            raise HTTPException(500, "Database not connected")
        try:
            data = {
                "questions": body.questions,
                "answers": body.answers,
                "score": body.score,
                "totalQuestions": len(body.questions),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
            if body.content:
                data["content"] = body.content
            if body.overview:
                data["overview"] = body.overview
            if body.key_points:
                data["keyPoints"] = body.key_points
            if body.sections:
                data["sections"] = body.sections
            if body.data_points:
                data["dataPoints"] = body.data_points
            if body.document_id:
                data["document_id"] = body.document_id
            
            if body.qa_history is not None:
                 data["qa_history"] = [q.model_dump() if hasattr(q, 'model_dump') else q.dict() for q in body.qa_history]

            db.collection("users").document(uid).collection("histories").document(item_id).update(data)
            return {"ok": True, "message": "History updated"}
        except Exception as e:
            raise HTTPException(500, f"Update history failed: {e}")
