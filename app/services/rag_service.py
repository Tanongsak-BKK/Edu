import hashlib
import json
import os
import math
from typing import List, Dict
from app.services.ai_service import client

RAG_CACHE_FILE = "rag_cache.json"


class RagService:
    @staticmethod
    def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        dot = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot / (norm1 * norm2)

    @staticmethod
    def _chunk_text(text: str, chunk_size: int = 1500, overlap: int = 200) -> List[str]:
        chunks = []
        start = 0
        text_len = len(text)
        while start < text_len:
            end = start + chunk_size
            if end < text_len:
                last_period = text.rfind(".", start, end)
                if last_period != -1 and last_period > start + chunk_size // 2:
                    end = last_period + 1
            chunks.append(text[start:end].strip())
            start = end - overlap
            if start >= text_len or end >= text_len:
                break
        return chunks

    @staticmethod
    def _chunk_text_with_positions(text: str, chunk_size: int = 1500, overlap: int = 200) -> List[Dict]:
        chunks_info = []
        start = 0
        text_len = len(text)
        while start < text_len:
            end = start + chunk_size
            if end < text_len:
                last_period = text.rfind(".", start, end)
                if last_period != -1 and last_period > start + chunk_size // 2:
                    end = last_period + 1
            chunks_info.append({
                "start": start,
                "end": end,
                "text": text[start:end].strip()
            })
            start = end - overlap
            if start >= text_len or end >= text_len:
                break
        return chunks_info

    @staticmethod
    def _get_embeddings(texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            response = client.embeddings.create(
                input=texts,
                model="text-embedding-3-small"
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            print(f"[RAG Error] Embedding generation failed: {e}")
            return []

    @staticmethod
    def _load_cache() -> Dict:
        if os.path.exists(RAG_CACHE_FILE):
            try:
                with open(RAG_CACHE_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    @staticmethod
    def _save_cache(cache: Dict):
        try:
            with open(RAG_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False)
        except Exception:
            pass

    @staticmethod
    def _get_firestore_data(doc_hash: str) -> Dict:
        """ Helper to fetch data from Firestore """
        from app.db.firebase import get_firestore_db
        db = get_firestore_db()
        if not db:
            return None
            
        doc_ref = db.collection("rag_cache").document(doc_hash)
        doc_snap = doc_ref.get()
        if not doc_snap.exists:
            return None
            
        chunks = []
        embeddings = []
        chunk_docs = doc_ref.collection("chunks").order_by("index").get()
        for c in chunk_docs:
            data = c.to_dict()
            chunks.append(data.get("chunk", ""))
            embeddings.append(data.get("embedding", []))
            
        # Optional: We could reconstruct raw text here, but it's better to load from cache
        return {
            "chunks": chunks,
            "embeddings": embeddings,
            "raw_text": doc_snap.to_dict().get("raw_text", "")
        }

    @staticmethod
    def save_document(text: str) -> str:
        """ บันทึกข้อความแบบเต็มลง Cache (Firestore หรือ Local) ทันทีและเตรียม Vector ไว้ล่วงหน้า """
        if not text:
            return ""
        doc_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        
        from app.db.firebase import get_firestore_db
        db = get_firestore_db()
        
        if db:
            doc_ref = db.collection("rag_cache").document(doc_hash)
            if doc_ref.get().exists:
                return doc_hash
                
            print(f"[RAG] Saving and Embedding new document to Firestore (Hash: {doc_hash})")
            chunks = RagService._chunk_text(text)
            embeddings = []
            batch_size = 100
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i+batch_size]
                embeddings.extend(RagService._get_embeddings(batch))
                
            doc_ref.set({"raw_text": text, "total_chunks": len(chunks)})
            
            batch_write = db.batch()
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                chunk_ref = doc_ref.collection("chunks").document(str(i))
                batch_write.set(chunk_ref, {"index": i, "chunk": chunk, "embedding": emb})
                if (i + 1) % 400 == 0:
                    batch_write.commit()
                    batch_write = db.batch()
            batch_write.commit()
            return doc_hash
            
        else:
            # Fallback to local
            cache = RagService._load_cache()
            if doc_hash not in cache:
                print(f"[RAG] Saving and Embedding new document to Local JSON (Hash: {doc_hash})")
                chunks = RagService._chunk_text(text)
                embeddings = []
                batch_size = 100
                for i in range(0, len(chunks), batch_size):
                    batch = chunks[i:i+batch_size]
                    embeddings.extend(RagService._get_embeddings(batch))
                
                cache[doc_hash] = {
                    "raw_text": text,
                    "chunks": chunks,
                    "embeddings": embeddings
                }
                RagService._save_cache(cache)
            return doc_hash
        
    @staticmethod
    def get_document_text(document_id: str) -> str:
        """ ดึงข้อความต้นฉบับออกมาจาก Cache สำหรับระบบ Summarize """
        if not document_id:
            return ""
            
        # Try Firestore first
        fs_data = RagService._get_firestore_data(document_id)
        if fs_data:
            return fs_data.get("raw_text", "")
            
        cache = RagService._load_cache()
        if document_id in cache:
            return cache[document_id].get("raw_text", "")
        return ""

    @staticmethod
    def get_relevant_context(context: str = "", query: str = "", top_k: int = 5, force_rag_threshold: int = 10000, document_id: str = None) -> str:
        doc_hash = document_id
        
        if not doc_hash and context:
            if len(context) <= force_rag_threshold:
                return context
            doc_hash = RagService.save_document(context)
            
        doc = RagService._get_firestore_data(doc_hash)
        if not doc:
            cache = RagService._load_cache()
            doc = cache.get(doc_hash)
            
        if not doc:
            return context # Fallback
            
        print(f"[RAG] Retrieving context for query: {query} (Hash: {doc_hash})")
        
        # Check if the query is a request for general summary/overview/topics of the document
        summary_keywords = ["สรุป", "ภาพรวม", "อธิบายทั้งหมด", "เล่าให้ฟังหน่อย", "summary", "overview", "summarize"]
        is_summary_query = any(kw in query.lower() for kw in summary_keywords)
        
        if is_summary_query:
            print("[RAG] Summary/Overview query detected. Using raw text of the document as context.")
            raw_text = doc.get("raw_text", "")
            if raw_text:
                if context:
                    return f"ข้อความเพิ่มเติม:\n{context}\n\nเนื้อหาจากเอกสาร:\n{raw_text}"
                return raw_text
                
        chunks = doc["chunks"]
        embeddings = doc["embeddings"]
        
        # ค้นหาด้วย Query (Semantic Similarity)
        query_embedding = RagService._get_embeddings([query])[0]
        similarities = [RagService._cosine_similarity(query_embedding, emb) for emb in embeddings]
        
        # ค้นหาด้วยคำสำคัญ (Keyword Overlap)
        import re
        query_words = [w.lower() for w in re.split(r'\W+', query) if w]
        keyword_scores = []
        for chunk in chunks:
            chunk_lower = chunk.lower()
            overlap = sum(1 for w in query_words if w in chunk_lower)
            keyword_scores.append(overlap / len(query_words) if query_words else 0.0)
            
        # รวมคะแนนแบบ Hybrid (Semantic 70% + Keyword 30%)
        hybrid_scores = [0.7 * similarities[i] + 0.3 * keyword_scores[i] for i in range(len(similarities))]
        
        top_indices = sorted(range(len(hybrid_scores)), key=lambda i: hybrid_scores[i], reverse=True)[:top_k]
        top_indices.sort() # เรียงตามลำดับการอ่านจริงในเอกสาร
        
        raw_text = doc.get("raw_text", "")
        if raw_text:
            chunks_info = RagService._chunk_text_with_positions(raw_text)
            groups = []
            if top_indices:
                current_group = [top_indices[0]]
                for idx in top_indices[1:]:
                    if idx == current_group[-1] + 1:
                        current_group.append(idx)
                    else:
                        groups.append(current_group)
                        current_group = [idx]
                groups.append(current_group)
            
            group_texts = []
            for g in groups:
                if g[0] < len(chunks_info) and g[-1] < len(chunks_info):
                    start_char = chunks_info[g[0]]["start"]
                    end_char = chunks_info[g[-1]]["end"]
                    group_texts.append(raw_text[start_char:end_char].strip())
                else:
                    group_texts.append(" ".join(chunks[idx] for idx in g))
            relevant_text = "\n... (ตัดตอนมาเฉพาะส่วนที่เกี่ยวข้อง) ...\n".join(group_texts)
        else:
            relevant_text = "\n... (ตัดตอนมาเฉพาะส่วนที่เกี่ยวข้อง) ...\n".join(chunks[i] for i in top_indices)
        
        if context:
            relevant_text = f"ข้อความเพิ่มเติม:\n{context}\n\nเนื้อหาจากเอกสาร:\n{relevant_text}"
            
        print(f"[RAG] Successfully extracted relevant context. New length: {len(relevant_text)}")
        return relevant_text
