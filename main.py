from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Path, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import OpenAI
from typing import List, Dict, Any, Union, Optional
from datetime import datetime
from io import BytesIO
from urllib.parse import quote
import os, re, json

# ---------- Bootstrapping ----------
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") 

if not OPENAI_API_KEY:
    raise RuntimeError("ไม่มี Key ของ Openai กรุณาตรวจที่ไฟล์ .env")

# สร้างตัวแทน (Client) เพื่อใช้เชื่อมต่อและสั่งงาน AI (GPT-4o-mini) ตลอดทั้งโปรแกรม
client = OpenAI(api_key=OPENAI_API_KEY)


# ---------- Firebase Admin / Firestore ----------
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")


# ถ้าไม่ได้ติดตั้ง Library ไว้ ให้เซตค่าเป็น None เพื่อไม่ให้โปรแกรมพัง
try:
    import firebase_admin
    from firebase_admin import credentials, auth as fb_auth
    from google.cloud import firestore
except Exception:
    firebase_admin = None
    fb_auth = None
    firestore = None

_db = None


# ยืนยันตัวตนเพื่อเชื่อมต่อฐานข้อมูล
if firebase_admin is not None and firestore is not None: 
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "./service-account.json") 
    try:
        if not firebase_admin._apps: 
            cred = credentials.Certificate(cred_path) 
            firebase_admin.initialize_app( 
                cred,
                {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None,
            )
        _db = firestore.Client(project=FIREBASE_PROJECT_ID) if FIREBASE_PROJECT_ID else firestore.Client()
        print("Firebase Admin / Firestore initialized") 
    except Exception as e: 
        print(f"Firebase init failed: {e}") 
        _db = None 
else:
    print("Firebase Admin / Firestore not available (libraries not installed?)")


#ฟังก์ชันคืนค่า _db เพื่อให้ส่วนอื่นๆเรียกใช้ฐานข้อมูล
def _firestore_db():
    return _db

#ฟังก์ชันนี้ บันทึกประวัติกิจกรรม (User Log) และ จัดเก็บผลลัพธ์จาก AI (Summary/Quiz) ลงในฐานข้อมูล Firestore แบบแยกรายบุคคล
def _log_user_event(user_id: str, collection: str, data: Dict[str, Any]) -> None:

    db = _firestore_db()
    if db is None or firestore is None:
        return

    try:
        db.collection("users").document(user_id).collection(collection).add(
            {
                **data, #เอาข้อมูลใน Dict มาแสดงตรงนี้ (ชื่อไฟล์, เนื้อหา, ฯลฯ)
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception as e:
        print(f"[history-log error] {e}")

#ระบุชื่อระบบและเวอร์ชัน
app = FastAPI(title="EduGen API", version="3.8.5")


# ---------- Cross-Origin Resource Sharing ----------

#กำหนดการอนุญาตที่จะให้เข้าถึงหน้าเว็บของเรา
_frontend_origins = os.getenv("FRONTEND_ORIGINS", "").strip()
if _frontend_origins:
    allow_origins = [o.strip() for o in _frontend_origins.split(",") if o.strip()]
else:
    allow_origins = ["http://127.0.0.1:3000"]


#อนุญาตแบบกรณี พิเศษ ถ้ามีเข้ามาแบบ localhost หรือ 127.0.0.1 ไม่ว่าจะพอร์ตไหน จะอนุญาตหมด
allow_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


#การอนุญาต เพื่อเปิดให้ Frontend สามารถสื่อสารกับ Backend ได้ โดยกำหนดให้รองรับทุก HTTP Methods
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# ---------- Config ---------- ประกาศตัวแปรไว้
NEAR_DUP_THRESHOLD = 0.78  #กำหนด THRESHOLD แบ่งตอนเอาไปเทียบกับข้อสอบที่เจนมาเพื่อกรองคำซ้ำ
CTX_CHAR_LIMIT = 15000 #กำหนดตัวอักษรที่จะส่งไปไม่เกิน 15000 ตัวอักษร
EXCLUDE_LIST_LIMIT = 30 #กำหนดให้จำข้อสอบได้ 30 ข้อ 15/15


# ---------- Health ---------- ช่วยเช็คเฉยๆว่า Backend ทำงานไหม
@app.get("/health")
def health():
    return {"ok": True, "version": "3.8.5"}


# ---------- Auth helpers ---------- ช่วย ตรวจสอบว่าคนที่เรียก API นี้คือใคร และมีสิทธิ์หรือป่าว
def _require_user_id(req: Request) -> str:
    authz = (req.headers.get("Authorization") or "").strip()

    if authz.startswith("Bearer "): #ex Bearer xxxx
        token = authz.split(" ", 1)[1].strip() # ตัด Bearer ทิ้ง  เอา xxxx
        if not token:
            raise HTTPException(401, "Empty auth token")
        if fb_auth is None:
            raise HTTPException(500, "Firebase auth not configured on server")
        try:
            decoded = fb_auth.verify_id_token(token)  # ส่ง Token ให้ Firebase ตรวจสอบ
            uid = (decoded.get("uid") or "").strip() # ถ้าถูก Firebase จะคืน uid กลับมา
            if not uid:
                raise HTTPException(401, "Invalid auth token (no uid)")
            return uid
        except Exception:
            raise HTTPException(401, "Invalid or expired auth token")

    raise HTTPException(401, "Missing Authorization Bearer token")


# ---------- Minimal Notes Config ---------- ส่วนนี้เดี่ยวกลับมาแก้ ตอนนี้ Note ยังเก็บแบบ Local อยู่ เดี่ยวค่อยมาแก้ให้มันเก็บใน Firebase 
NOTES_ROOT = os.path.join(os.getcwd(), "data", "notes")
os.makedirs(NOTES_ROOT, exist_ok=True)

def _note_path(user_id: str, file_id: str) -> str:
    safe_uid = re.sub(r"[^A-Za-z0-9_.-]", "_", user_id)
    safe_fid = re.sub(r"[^A-Za-z0-9_.-]", "_", file_id)
    folder = os.path.join(NOTES_ROOT, safe_uid)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"{safe_fid}.json")


# ---------- Utils ---------- เตรียมข้อมูลเพื่อส่งต่อไปให้ Ai 

#ตัดข้อความยาวๆเพื่อเป็นประโยคสั่นๆ ex "นิกซ่า. น่ารัก" กลายเป็น ["นิกซ่า", "น่ารัก"]
def _sentences(text: str) -> List[str]: 
    s = re.split(r"[。.!?]\s+|[\n\r]+", (text or "").strip()) #ตัดคำ เมื่อเจอ  。.!?  เว้นวรรค และ การขึ้่นบรรทัดใหม่
    return [x.strip() for x in s if x.strip()] #คืนค่าทั้งหมดโดยตัดพวก ประโยคที่ไม่มีข้อความ

#แทนที่ Enter และ Space ถ้ามันมากเกินเ
def _clean_text(text: str) -> str:
    text = re.sub(r"\n{2,}", "\n\n", text or "") #เมื่อเจอ Enter มากกว่า 2 จะแทนค่ามันให้เป็น 2 Enter
    text = re.sub(r"[ ]{2,}", " ", text) #เมื่อเจอ Space มากกว่า 2 จะแทนค่าให้มันเหลือ 1 Space
    return text.strip() #คืนค่าพร้อมตัด Space หัวท้ายออก

#ตัด ``` ที่ AI ชอบเผล่อเจนให้มาออก
def _strip_json_fence(s: str) -> str:
    s = (s or "").strip() #ถ้า s เป็น none แปลงเป็น "" แล้วตัดหัวท้ายตลอด
    if s.startswith("```"): #เราจะเช็ตว่าข้อความที่เราได้จาก ai เริ่มด้วย ``` ไหม
        s = re.sub(r"^```(?:json)?", "", s).strip() # ตัด ``` ออกพร้อมคำว่า JSON 
        s = re.sub(r"```$", "", s).strip() #ตัด ``` ช่วงท้ายออก
    return s

#แปลง JSON จาก AI ให้เป็น Python Dict/List กันเว็บพังถ้า AI มันส่งมาเอ๋อๆ
def _safe_json_loads(s: str, fallback: Union[dict, list, None] = None):#s ค่าที่ได้จาก AI , fallback ค่าสำรอง ถ้าแปลงไม่สำเร็จจะใช้ค่านี้แทน
    try:
        return json.loads(_strip_json_fence(s)) #เอาไปลอก ``` ก่อน
    except Exception:
        return fallback if fallback is not None else {} #ถ้าแปลงไม่ได้ ไปใช้ค่า fallback  ถ้าไม่มี fallback คืนค่า None กลับ {}

#ตัดแบ่งประโยค แล้ว ใส่หมายเลขให้มัน
def _numbered_sentences(text: str, max_sentences: int = 800):
    sents = _sentences(text) #ตัดคำออกมา
    sents = sents[:max_sentences] #กำหนดคำที่ตัดออกมาไม่เกิน 800
    return [{"id": i, "text": t} for i, t in enumerate(sents, start=1)] #คืนค่าเป็นแบบ Dict แบบใส่เลขให้ เช่น {"id": 1, "text": "นิกเนมหล่อ"}

#ตรวจสอบคำให้ไม่เกิน 45000
def _truncate_text_chars(text: str, max_chars: int = 45000) -> str:
    text = text or "" #ดักกัน Crash ถ้า text ที่รับเข้ามาเป็น None จะให้เป็น ""
    if len(text) <= max_chars: #ถ้่าไม่เกิน
        return text  
    
    # ถ้าเกิน ให้ตัดเอาแค่ตั้งแต่ตัวแรกจนถึงตัวที่ max_chars
    else:
        return text[:max_chars]

# ---------- Near-duplicate helpers ----------

#ตรวจคำเหมือน ตอนเอาไปเจนข้อสอบเพิ่มจะได้คำถามที่ไม่เหมือนกัน
_STOP = set("คือ ของ และ หรือ ที่ ใน เป็น ได้ มี ใด ใดๆ อะไร อย่างไร ใคร ไหน ข้อใด ต่อไปนี้ มาก น้อย ไม่ ใช่ จาก ตาม เพื่อ เช่น ดังนั้น ดังกล่าว ซึ่ง โดย เพราะ ดังนั้นจึง".split())

#ทำการเปลี่ยนข้อความปกติให้เป็นคำที่สำคัญจริงๆสำหรับการนำไปสร้างข้อสอบ
def _tokenize(s: str) -> List[str]:
    text = (s or "").lower() #จัดการค่าว่างและเปลี่ยนเป็นตัวพิมพ์เล็ก 
    text = re.sub(r"[^\w\s]", " ", text) #เอาเครื่องหมายออก เอาแค่ตัวหนังสือ (\w) และ Space(\s)
    text = text.replace("ๆ", " ")# ๆ เปลี่ยนเป็น ช่องว่าง
    words = text.split() #หั่นข้อความออกเป็นคำๆ โดยใช้ช่องว่าง "นิวเคลียส เซลล์ พืช" เป็น ["นิวเคลียส", "เซลล์", "พืช"]
    
    clean_words = []
    for w in words:
        if w and (w not in _STOP): #จากคำที่เราได้มา เอาไปเทียบกับ _STOP ว่าซ้ำกันไหม เพื่อเราจะได้คำที่สำคัญจริงๆ
            clean_words.append(w)
    return clean_words

#เอาข้อสอบ ใหม่(A) เก่า(B) มาเทียบกันแล้วให้คะแนนความเหมือน
def _jaccard(a: str, b: str) -> float:
    A, B = set(_tokenize(a)), set(_tokenize(b))  #เอา A B ไป tokenize
    if not A or not B: #ถ้า A หรือ B มีค่าว่างจะให้ = 0.0
        return 0.0
    inter = len(A & B) #เทียบกันถ้าเหมือนกัน จะ + 1
    uni = len(A | B) #นับทุกคำส่วนคำซ้ำจะนับให้มันแค่ 1 ตัวเท่านั้น

    if uni == 0:
        return 0.0
    
    similarity_score = inter / uni #ex inter = 2 uni = 10    2/10 = 0.2 

    return similarity_score

#ช่วยดักจับที่ Ai พยายามเลี่ยงคำให้มันไม่เหมือน
def _dice_bigram(a: str, b: str) -> float:

    def bi(x: str) -> List[str]:
        t = re.sub(r"\s+", " ", x).strip() #ล้างช่องว่างให้เหลือแค่ช่องเดียว
        result = []
        if len(t) > 1: #ต้องมีตัวอักษรมากกว่า 1
            for i in range(len(t) - 1): #วนตั้งแต่ตัวแรกถึงตัวสุดท้าย
                current_char = t[i] #เก็บตัวปัจบัน
                next_char = t[i + 1] #เก็บตัวถัดไป
                pair = current_char + next_char # ตัวปัจบันรวมกับตัวถัดไป
                result.append(pair) #จับเข้าไปใน Array 
        return result

    A, B = bi(a), bi(b) 

    #ดักไว้ถ้า Array A และ Array B เป็นค่าว่างจะให้ส่ง 0.0
    if not A or not B:
        return 0.0

    #นับจำนวนคู่ที่ซ้ำกันออกมาเป็น %  
    from collections import Counter
    CA, CB = Counter(A), Counter(B) #Ex Array A คือ ["นะ", "คะ", "นะ"] , Counter(A) จะได้ {"นะ": 2, "คะ": 1}

    #A v คู่ใหม่ , B คู่เก่า
    inter = 0
    for k, v in CA.items():
        count_in_B = CB.get(k, 0) #ไปเช็คว่า คู่ของ CA นี้มีอยู่ใน CB หรือป่าว ถ้าไม่มีให้ เป็น 0

        if v < count_in_B: #เช็คจำนวนคู่อักษรใหม่น้อยกว่า คู่อักษรเก่าหรือไม่
            inter = inter + v
        else:
            inter = inter + count_in_B

    return (2 * inter) / (len(A) + len(B)) #len.. คือจำนวนคู่ทั้งหมด


#จะเอาเลขที่ได้จาก jaccard และ dice_bigram มาเทียบกันว่าใครมากกว่ากัน แล้วคืนค่าเลขนั้น
def _similar(a: str, b: str) -> float:
    return max(_jaccard(a, b), _dice_bigram(a, b))


#ตัวตัดสินว่าข้อสอบที่ได้ใหม่จะทิ้งหรือไม่ทิ้ง
#items = ข้อสอบใหม่ , exclude = ข้อสอบเก่า ถ้าผ่านจะคืน ข้อสอบใหม่ 
def _filter_near_dups(items: List[Dict[str, Any]], exclude: List[str], threshold: float = NEAR_DUP_THRESHOLD) -> List[Dict[str, Any]]:
    kept: List[Dict[str, Any]] = []

    for q in items: #วนลูปข้อสอบใหม่
        text = str(q.get("question") or "").strip() #เลือกหยิบเฉพาะ question ออกมาดู

        if not text: #ดักไว้ถ้าไม่มีไปข้อต่อไป
            continue
        dup = False #สร้างไว้บอกว่ายังไม่เจอข้อซ้ำ


        for e in exclude:#วนในข้อสอบเก่าทุกข้อ
            if _similar(text, e) >= threshold:#เทียบกับข้อสอบใหม่ แล้วเช็คว่ามันมากกว่า threshold ไหม
                dup = True #ถ้ามากกว่าก็คือเจอข้อคำถามที่มันจะออกแนวซ้ำ
                break

        if dup: #ถ้าเจอข้อซ้ำจะไปข้อถัดไป
            continue

        #มันจะเอาข้อสอบใหม่ที่ผ่านมาวนทุกข้อใน kept ก็คือที่ผ่านแล้ว วนดูว่ามันมีซ้ำกันไหม 
        for e in kept: 
            if _similar(text, str(e.get("question") or "")) >= threshold:
                dup = True #กรณี ที่ข้อสอบใหม่ ซ้ำกับ ข้อสอบใหม่ จะบอกว่าเจอข้อซ้ำ
                break

        if not dup: #ถ้าไม่เจอข้อซ้ำเลย มันก็จะเพิ่มข้อๆนั้นลงไปใน kept
            kept.append(q)

    return kept


# ---------- Data Models ---------- ตรวจสอบข้อมูลที่ผู้ใช้ส่งมา 

#รับเนื้อหาในรูปแบบ Text (String)
class ContextIn(BaseModel):
    context: str #เนื้อหาหลักที่เราได้มาจาก PDF 

#แม่แบบตอนสั่งข้อสอบ ว่าจะต้องมีอะไรบ้าง
class QuizIn(BaseModel):
    context: str #เนื้อหาบทเรียนที่จะเอาออกมาทำข้อสอบ
    n: int = 5  #จำนวน 5 ข้อ
    exclude: Optional[List[str]] = None #รายข้อสอบเก่า มีหรือไม่มีก็ได้ (Optional)
    topics: Optional[List[str]] = None #หัวข้อหลัก มีหรือไม่มีก็ได้ (Optional)

#แม่แบบตอบคำถาม QA โดยเราจะเอาคำตอบที่มีในเนื้อหาไปตอบคำถามเท่านั้น
class QAIn(BaseModel):
    context: str #เนื้อหาหลักที่เราจะต้องเอาไปตอบ
    question: str #คำถามที่ user ถาม

#แม่แบบที่ได้รับสรุปจาก AI แล้ว เพื่อเตรียมเอาไปให้ user ดู
class SummarizeOut(BaseModel):
    overview: str #บทนำ/ภาพรวม
    key_points: List[str] #ประเด็นสำคัญ
    sections: List[Dict[str, str]] #หัวข้อย่อย
    data_points: List[Dict[str, str]] #ข้อมูลเชิงสถิติ/ตัวเลข

# ---------- Endpoints ----------
@app.post("/pdf/extract")
async def pdf_extract(pdf: UploadFile = File(...)):
    if not pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "รองรับเฉพาะไฟล์ .pdf เท่านั้น")
    try:
        import pdfplumber
    except Exception:
        raise HTTPException(500, "กรุณาติดตั้ง pdfplumber: pip install pdfplumber")

    pages = []
    try:
        with pdfplumber.open(pdf.file) as doc:
            for p in doc.pages:
                pages.append(p.extract_text() or "")
    except Exception:
        raise HTTPException(422, "ไม่สามารถอ่านข้อความได้ (อาจเป็นไฟล์สแกน)")
    text = _clean_text("\n\n".join(pages))
    if not text:
        raise HTTPException(422, "ไม่สามารถอ่านข้อความได้ (อาจเป็นไฟล์สแกน)")
    return {"text": text}

@app.post("/summarize", response_model=SummarizeOut)
def summarize(body: ContextIn, request: Request):
    uid = _require_user_id(request)
    ctx_raw = (body.context or "").strip()
    if not ctx_raw:
        raise HTTPException(400, "context ว่าง")

    ctx = _clean_text(_truncate_text_chars(ctx_raw, 45000))
    sent_items = _numbered_sentences(ctx, max_sentences=800)
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
        sec_json = _safe_json_loads(res1.choices[0].message.content, {"sections": []})
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
{_truncate_text_chars(ctx, 45000)}
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
        ov_json = _safe_json_loads(
            res2.choices[0].message.content,
            {"overview": "", "key_points": [], "data_points": []},
        )

        def _norm_list(x): return x if isinstance(x, list) else []
        def _norm_str(x): return (x or "").strip()

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
                    item = {"label": label, "value": value}
                    if unit: item["unit"] = unit
                    cleaned_dps.append(item)

        result: Dict[str, Any] = {
            "overview": _norm_str(ov_json.get("overview", "")),
            "key_points": _norm_list(ov_json.get("key_points", [])),
            "sections": cleaned_sections,
            "data_points": cleaned_dps,
        }

        _log_user_event(
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
    except Exception as e:
        try:
            _log_user_event(uid, "summaries", {"textLength": len(ctx_raw), "source": "text", "status": "error", "errorMessage": str(e)})
        except: pass
        raise HTTPException(500, f"Summarize failed: {e}")

class TopicsOut(BaseModel):
    topics: List[str]

@app.post("/quiz/topics", response_model=TopicsOut)
def quiz_topics(body: ContextIn):
    ctx = (body.context or "").strip()
    if not ctx:
        raise HTTPException(400, "context ว่าง")
    prompt = f"""
สกัดหัวข้อ/แนวคิดสำคัญจากเนื้อหาด้านล่าง (ไม่เกิน 30 หัวข้อ)
ตอบ JSON: {{"topics":["หัวข้อ1","หัวข้อ2"]}}
เนื้อหา:
{_truncate_text_chars(ctx, CTX_CHAR_LIMIT)}
"""
    try:
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        data = _safe_json_loads(r.choices[0].message.content, {"topics": []})
        topics = [str(t).strip() for t in data.get("topics", []) if str(t).strip()]
        return {"topics": topics}
    except Exception as e:
        raise HTTPException(500, f"Topics generation failed: {e}")

def _gen_mcq_once(ctx: str, n: int, exclude_list: List[str], topic_hints: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    exclude_block = ""
    if exclude_list:
        exclude_block = "หลีกเลี่ยงการตั้งคำถามคล้ายกับ:\n" + "\n".join(f"- {q}" for q in exclude_list[:EXCLUDE_LIST_LIMIT]) + "\n"
    topic_block = ""
    if topic_hints:
        topic_block = "ให้สร้าง 'หัวข้อละ 1 ข้อ' จากหัวข้อต่อไปนี้:\n" + "\n".join(f"- {t}" for t in topic_hints[:n]) + "\n"

    prompt = f"""
สร้างข้อสอบปรนัย {n} ข้อ จากเนื้อหาด้านล่าง
- คำตอบถูกมีเพียงข้อเดียว
- ห้ามตัวเลือกแบบ "ถูกทุกข้อ/ทั้ง ก และ ข/ไม่ถูกสักข้อ"
- ตอบ JSON: {{"questions":[{{"type":"mcq","question":"...","choices":["ก) ...","ข) ...","ค) ...","ง) ..."],"answer":"ก|ข|ค|ง","explain":"...","topic":"..."}}]}}
{topic_block}{exclude_block}
เนื้อหา:
{_truncate_text_chars(ctx, CTX_CHAR_LIMIT)}
"""
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    data = _safe_json_loads(r.choices[0].message.content, {"questions": []})
    qs = data.get("questions", [])
    return _filter_near_dups(qs, exclude_list, threshold=NEAR_DUP_THRESHOLD)

def _gen_tf_once(ctx: str, n: int, exclude_list: List[str], topic_hints: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    exclude_block = ""
    if exclude_list:
        exclude_block = "หลีกเลี่ยงการตั้งคำถามคล้ายกับ:\n" + "\n".join(f"- {q}" for q in exclude_list[:EXCLUDE_LIST_LIMIT]) + "\n"
    topic_block = ""
    if topic_hints:
        topic_block = "ให้สร้าง 'หัวข้อละ 1 ข้อ' จากหัวข้อต่อไปนี้:\n" + "\n".join(f"- {t}" for t in topic_hints[:n]) + "\n"

    prompt = f"""
สร้างข้อสอบ ถูก/ผิด จำนวน {n} ข้อ จากเนื้อหาด้านล่าง
- ให้เหตุผลสั้น ๆ ทุกข้อ
- ตอบ JSON: {{"questions":[{{"type":"tf","question":"...","answer":"true|false","explain":"...","topic":"..."}}]}}
{topic_block}{exclude_block}
เนื้อหา:
{_truncate_text_chars(ctx, CTX_CHAR_LIMIT)}
"""
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.25,
        response_format={"type": "json_object"},
    )
    data = _safe_json_loads(r.choices[0].message.content, {"questions": []})
    qs = data.get("questions", [])
    return _filter_near_dups(qs, exclude_list, threshold=NEAR_DUP_THRESHOLD)

@app.post("/quiz/mcq")
def quiz_mcq(body: QuizIn):
    ctx = (body.context or "").strip()
    n = max(1, min(10, int(body.n or 5)))
    if not ctx:
        raise HTTPException(400, "context ว่าง")
    exclude_list = [str(x).strip() for x in (body.exclude or []) if str(x).strip()]
    topics = [str(t).strip() for t in (body.topics or []) if str(t).strip()] or None
    
    collected: List[Dict[str, Any]] = []
    tries = 0
    
    while len(collected) < n and tries < 2: 
        need = n - len(collected)
        excludes_now = exclude_list + [str(q.get("question") or "") for q in collected]
        topic_hints = topics[:need] if topics else None
        
        request_n = need + 3 if tries == 0 else need
        batch = _gen_mcq_once(ctx, request_n, excludes_now, topic_hints)
        
        for q in batch:
            if len(collected) >= n: 
                break
            if all(_similar(str(q.get("question", "")), str(e.get("question", ""))) < NEAR_DUP_THRESHOLD for e in collected):
                collected.append(q)
                
        if topics:
            used = set(str(q.get("topic", "")).strip().lower() for q in collected)
            topics = [t for t in topics if str(t).strip().lower() not in used]
        tries += 1
        
    return {"questions": collected[:n]}

@app.post("/quiz/tf")
def quiz_tf(body: QuizIn):
    ctx = (body.context or "").strip()
    n = max(1, min(10, int(body.n or 5)))
    if not ctx:
        raise HTTPException(400, "context ว่าง")
    exclude_list = [str(x).strip() for x in (body.exclude or []) if str(x).strip()]
    topics = [str(t).strip() for t in (body.topics or []) if str(t).strip()] or None
    
    collected: List[Dict[str, Any]] = []
    tries = 0
    
    while len(collected) < n and tries < 2:
        need = n - len(collected)
        excludes_now = exclude_list + [str(q.get("question") or "") for q in collected]
        topic_hints = topics[:need] if topics else None
        
        request_n = need + 3 if tries == 0 else need
        batch = _gen_tf_once(ctx, request_n, excludes_now, topic_hints)
        
        for q in batch:
            if len(collected) >= n: 
                break
            if all(_similar(str(q.get("question", "")), str(e.get("question", ""))) < NEAR_DUP_THRESHOLD for e in collected):
                collected.append(q)
                
        if topics:
            used = set(str(q.get("topic", "")).strip().lower() for q in collected)
            topics = [t for t in topics if str(t).strip().lower() not in used]
        tries += 1
        
    return {"questions": collected[:n]}

@app.post("/qa")
def qa(body: QAIn):
    ctx = (body.context or "").strip()
    q = (body.question or "").strip()
    if not ctx or not q:
        raise HTTPException(400, "context/question ว่าง")
    prompt = f"""
ตอบคำถามโดยอ้างอิง "เฉพาะ" เนื้อหาที่ให้ด้านล่างเท่านั้น
ถ้าไม่พบคำตอบ ให้ตอบว่า: ไม่พบในเนื้อหาที่ให้มา
เนื้อหา:
{_truncate_text_chars(ctx, CTX_CHAR_LIMIT)}

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
        raise HTTPException(500, f"QA failed: {e}")

class SimpleNoteIn(BaseModel):
    content: str
class SimpleNoteOut(BaseModel):
    file_id: str
    content: str
    updated_at: Optional[str] = None

@app.get("/notes/{file_id}", response_model=SimpleNoteOut)
def get_note(request: Request, file_id: str = Path(...)):
    uid = _require_user_id(request)
    p = _note_path(uid, file_id)
    if not os.path.exists(p):
        return {"file_id": file_id, "content": "", "updated_at": None}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "file_id": file_id,
            "content": str(data.get("content", "")),
            "updated_at": data.get("updated_at"),
        }
    except Exception:
        return {"file_id": file_id, "content": "", "updated_at": None}

@app.put("/notes/{file_id}", response_model=SimpleNoteOut)
def put_note(request: Request, file_id: str = Path(...), body: SimpleNoteIn = None):
    uid = _require_user_id(request)
    if body is None or not isinstance(body.content, str):
        raise HTTPException(400, "content ว่างหรือรูปแบบไม่ถูกต้อง")
    content = body.content.strip()
    p = _note_path(uid, file_id)
    payload = {"content": content, "updated_at": datetime.utcnow().isoformat() + "Z"}
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)
    return {"file_id": file_id, **payload}

QB_ROOT = os.path.join(os.getcwd(), "data", "qb")
os.makedirs(QB_ROOT, exist_ok=True)

def _qb_paths(user_id: str):
    safe_uid = re.sub(r"[^A-Za-z0-9_.-]", "_", user_id)
    folder = os.path.join(QB_ROOT, safe_uid)
    os.makedirs(folder, exist_ok=True)
    return {
        "dir": folder,
        "questions": os.path.join(folder, "questions.json"),
        "quizzes": os.path.join(folder, "quizzes.json"),
    }
def _read_json(path: str, default):
    try:
        if not os.path.exists(path): return default
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except: return default
def _write_json(path: str, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
def _next_id(items: List[Dict[str, Any]]) -> int:
    mx = 0
    for it in items:
        try: mx = max(mx, int(it.get("id", 0)))
        except: pass
    return mx + 1

class QuestionIn(BaseModel):
    type: str = Field(pattern="^(mcq|tf)$")
    question: str
    choices: Optional[List[str]] = None
    answer: str
    explain: Optional[str] = ""
    topic: Optional[str] = ""
class QuestionOut(QuestionIn):
    id: int
class QuizCreateIn(BaseModel):
    title: str = "แบบทดสอบ"
    question_ids: Optional[List[int]] = None
class QuizOut(BaseModel):
    id: int
    title: str
    question_ids: List[int]
    created_at: str
    updated_at: str
class ExportOpts(BaseModel):
    shuffleChoices: bool = False
    showAnswers: bool = False

@app.get("/bank/questions", response_model=List[QuestionOut])
def bank_list_questions(request: Request):
    uid = _require_user_id(request)
    return _read_json(_qb_paths(uid)["questions"], [])

@app.post("/bank/questions", response_model=QuestionOut)
def bank_create_question(request: Request, body: QuestionIn):
    uid = _require_user_id(request)
    paths = _qb_paths(uid)
    qs = _read_json(paths["questions"], [])
    qtype = (body.type or "").lower()
    if qtype == "mcq":
        ch = (body.choices or [])[:4]
        ch = (ch + [""] * 4)[:4]
        if body.answer not in ["ก", "ข", "ค", "ง"]:
            raise HTTPException(400, "answer ต้องเป็น ก/ข/ค/ง สำหรับ MCQ")
        payload = {
            "id": _next_id(qs),
            "type": "mcq",
            "question": body.question.strip(),
            "choices": ch,
            "answer": body.answer.strip(),
            "explain": (body.explain or "").strip(),
            "topic": (body.topic or "").strip(),
        }
    else:
        ans = (body.answer or "").strip().lower()
        if ans not in ["true", "false", "จริง", "เท็จ"]:
            raise HTTPException(400, "answer ต้องเป็น true/false สำหรับ TF")
        payload = {
            "id": _next_id(qs),
            "type": "tf",
            "question": body.question.strip(),
            "choices": None,
            "answer": "true" if ans in ["true", "จริง"] else "false",
            "explain": (body.explain or "").strip(),
            "topic": (body.topic or "").strip(),
        }
    qs.append(payload)
    _write_json(paths["questions"], qs)
    return payload

@app.patch("/bank/questions/{qid}", response_model=QuestionOut)
def bank_update_question(request: Request, qid: int, body: QuestionIn):
    uid = _require_user_id(request)
    paths = _qb_paths(uid)
    qs = _read_json(paths["questions"], [])
    for i, it in enumerate(qs):
        if int(it.get("id", -1)) == qid:
            qtype = (body.type or it.get("type", "mcq")).lower()
            if qtype == "mcq":
                ch = (body.choices or it.get("choices") or [])[:4]
                ch = (ch + [""] * 4)[:4]
                ans = (body.answer or it.get("answer", "ก")).strip()
                if ans not in ["ก", "ข", "ค", "ง"]:
                    raise HTTPException(400, "answer ต้องเป็น ก/ข/ค/ง สำหรับ MCQ")
                qs[i] = {
                    "id": qid,
                    "type": "mcq",
                    "question": body.question.strip(),
                    "choices": ch,
                    "answer": ans,
                    "explain": (body.explain or "").strip(),
                    "topic": (body.topic or "").strip(),
                }
            else:
                ans = (body.answer or it.get("answer", "true")).strip().lower()
                if ans not in ["true", "false", "จริง", "เท็จ"]:
                    raise HTTPException(400, "answer ต้องเป็น true/false สำหรับ TF")
                qs[i] = {
                    "id": qid,
                    "type": "tf",
                    "question": body.question.strip(),
                    "choices": None,
                    "answer": "true" if ans in ["true", "จริง"] else "false",
                    "explain": (body.explain or "").strip(),
                    "topic": (body.topic or "").strip(),
                }
            _write_json(paths["questions"], qs)
            return qs[i]
    raise HTTPException(404, "Question not found")

@app.get("/bank/quizzes", response_model=List[QuizOut])
def bank_list_quizzes(request: Request):
    uid = _require_user_id(request)
    return _read_json(_qb_paths(uid)["quizzes"], [])

@app.post("/bank/quizzes", response_model=QuizOut)
def bank_create_quiz(request: Request, body: QuizCreateIn):
    uid = _require_user_id(request)
    paths = _qb_paths(uid)
    quizzes = _read_json(paths["quizzes"], [])
    questions = _read_json(paths["questions"], [])
    valid_ids = set(int(q.get("id", -1)) for q in questions)
    ids_src = body.question_ids if body.question_ids is not None else []
    keep = [int(i) for i in ids_src if int(i) in valid_ids]
    now = datetime.utcnow().isoformat() + "Z"
    payload = {
        "id": _next_id(quizzes),
        "title": (body.title or "แบบทดสอบ").strip(),
        "question_ids": keep,
        "created_at": now,
        "updated_at": now,
    }
    quizzes.append(payload)
    _write_json(paths["quizzes"], quizzes)
    return payload

@app.patch("/bank/quizzes/{quiz_id}", response_model=QuizOut)
def bank_update_quiz(request: Request, quiz_id: int, body: QuizCreateIn):
    uid = _require_user_id(request)
    paths = _qb_paths(uid)
    quizzes = _read_json(paths["quizzes"], [])
    questions = _read_json(paths["questions"], [])
    valid_ids = set(int(q.get("id", -1)) for q in questions)
    for i, qz in enumerate(quizzes):
        if int(qz.get("id", -1)) == quiz_id:
            title_src = body.title if body.title is not None else qz.get("title", "แบบทดสอบ")
            ids_src = body.question_ids if body.question_ids is not None else qz.get("question_ids", [])
            title = (title_src or "แบบทดสอบ").strip()
            ids = [int(x) for x in ids_src if int(x) in valid_ids]
            quizzes[i] = {
                **qz,
                "title": title,
                "question_ids": ids,
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
            _write_json(paths["quizzes"], quizzes)
            return quizzes[i]
    raise HTTPException(404, "Quiz not found")

@app.delete("/bank/quizzes/{quiz_id}")
def bank_delete_quiz(request: Request, quiz_id: int):
    uid = _require_user_id(request)
    paths = _qb_paths(uid)
    quizzes = _read_json(paths["quizzes"], [])
    new_qz = [x for x in quizzes if int(x.get("id", -1)) != quiz_id]
    if len(new_qz) == len(quizzes):
        raise HTTPException(404, "Quiz not found")
    _write_json(paths["quizzes"], new_qz)
    return {"ok": True}

# ----- Export PDF -----
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
except Exception:
    A4 = None

def _load_th_font():
    font_dir = os.path.join(os.getcwd(), "fonts")
    f1 = os.path.join(font_dir, "THSarabunNew.ttf")
    try:
        if os.path.exists(f1):
            pdfmetrics.registerFont(TTFont("THSarabunNew", f1))
            return "THSarabunNew"
        else:
            print("❌ ไม่พบฟอนต์:", f1)
    except Exception as e:
        print("Font load error:", e)
    return "Helvetica"

def _render_pdf_quiz(title: str, questions: List[Dict[str, Any]], opts: ExportOpts) -> bytes:
    if A4 is None:
        raise HTTPException(500, "reportlab ยังไม่ได้ติดตั้ง (pip install reportlab)")
    buf = BytesIO()
    font_name = _load_th_font()
    style_normal = ParagraphStyle("Normal", fontName=font_name, fontSize=16, leading=20)
    style_title = ParagraphStyle("Title", fontName=font_name, fontSize=18, leading=22, spaceAfter=8)
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    story = [Paragraph(title or "แบบทดสอบ", style_title), Spacer(1, 6)]
    def _mcq_lines(ch: List[str]):
        labels = ["ก", "ข", "ค", "ง"]
        out = []
        for i, t in enumerate((ch or [])[:4]):
            lab = labels[i]
            cleaned = (t or "").strip()
            if not cleaned.startswith(tuple(labels)):
                cleaned = f"{lab}. {cleaned}"
            out.append(cleaned)
        return out
    import random
    for idx, q in enumerate(questions, start=1):
        qtext = str(q.get("question", "")).strip()
        qtype = (q.get("type", "mcq") or "").lower()
        story.append(Paragraph(f"{idx}) {qtext}", style_normal))
        if qtype == "tf":
            chs = ["ก. จริง", "ข. เท็จ"]
        else:
            ch_raw = q.get("choices") or []
            chs = _mcq_lines(ch_raw)
            if opts.shuffleChoices:
                random.shuffle(chs)
        for line in chs:
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;{line}", style_normal))
        if opts.showAnswers:
            ans = str(q.get("answer", "")).strip()
            if qtype == "tf":
                ans = "ก" if ans.lower() in ["true", "จริง"] else "ข"
            explain = str(q.get("explain") or "").strip()
            story.append(Paragraph(f"<b>เฉลย:</b> {ans}{(' — ' + explain) if explain else ''}", style_normal))
        story.append(Spacer(1, 6))
    def _on_page(canvas, doc):
        name = _load_th_font()
        canvas.setFont(name, 12 if name != "Helvetica" else 10)
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"หน้า {doc.page}")
    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    buf.seek(0)
    return buf.read()

@app.post("/export/quizzes/{quiz_id}")
def export_quiz_pdf(request: Request, quiz_id: int, opts: ExportOpts = Body(...)):
    uid = _require_user_id(request)
    paths = _qb_paths(uid)
    quizzes = _read_json(paths["quizzes"], [])
    questions = _read_json(paths["questions"], [])
    qz = next((x for x in quizzes if int(x.get("id", -1)) == quiz_id), None)
    if not qz:
        raise HTTPException(404, "Quiz not found")
    by_id = {int(q["id"]): q for q in questions}
    bundle = [by_id[i] for i in qz.get("question_ids", []) if i in by_id]
    pdf_bytes = _render_pdf_quiz(qz.get("title", "แบบทดสอบ"), bundle, opts)
    raw_name = (qz.get("title", "quiz") or "quiz").strip()
    base_no_pdf = re.sub(r"\.pdf$", "", raw_name, flags=re.IGNORECASE)
    fallback = re.sub(r"[^A-Za-z0-9_.-]+", "_", base_no_pdf) or "quiz"
    fallback = f"{fallback}.pdf"
    utf8_name = quote(f"{base_no_pdf}.pdf".encode("utf-8"))
    content_disp = f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{utf8_name}'
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": content_disp},
    )

# ---------- History API ----------

class QAPair(BaseModel):
    question: str
    answer: str

class QuizHistoryIn(BaseModel):
    file_name: str
    overview: str = ""
    key_points: List[str] = []
    sections: List[Dict[str, str]] = [] 
    data_points: List[Dict[str, str]] = []
    questions: List[Dict[str, Any]]
    answers: Dict[str, str]
    score: int
    content: str = ""
    qa_history: List[QAPair] = [] 

class RenameHistoryIn(BaseModel):
    new_name: str

@app.post("/history/save")
def save_history_item(request: Request, body: QuizHistoryIn):
    uid = _require_user_id(request)
    db = _firestore_db()
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
            "totalQuestions": len(body.questions),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "qa_history": [q.dict() for q in body.qa_history],
        }
        update_time, ref = db.collection("users").document(uid).collection("histories").add(data)
        return {"ok": True, "message": "History saved", "id": ref.id}
    except Exception as e:
        raise HTTPException(500, f"Save history failed: {e}")

@app.get("/history/list")
def get_history_list(request: Request):
    uid = _require_user_id(request)
    db = _firestore_db()
    if not db:
        return []
    try:
        docs = db.collection("users").document(uid).collection("histories")\
                 .order_by("timestamp", direction=firestore.Query.DESCENDING)\
                 .limit(30).stream()
        results = []
        for d in docs:
            item = d.to_dict()
            item["id"] = d.id
            results.append(item)
        return results
    except Exception as e:
        print(f"[History] Get list error: {e}")
        return []

@app.delete("/history/{item_id}")
def delete_history_item(request: Request, item_id: str):
    uid = _require_user_id(request)
    db = _firestore_db()
    if not db:
        raise HTTPException(500, "Database not connected")
    try:
        db.collection("users").document(uid).collection("histories").document(item_id).delete()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Delete failed: {e}")

@app.patch("/history/{item_id}")
def rename_history_item(request: Request, item_id: str, body: RenameHistoryIn):
    uid = _require_user_id(request)
    db = _firestore_db()
    if not db:
        raise HTTPException(500, "Database not connected")
    try:
        ref = db.collection("users").document(uid).collection("histories").document(item_id)
        ref.update({"fileName": body.new_name})
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Rename failed: {e}")

@app.patch("/history/update/{item_id}")
def update_history_item(request: Request, item_id: str, body: QuizHistoryIn):
    uid = _require_user_id(request)
    db = _firestore_db()
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
        if body.content: data["content"] = body.content
        if body.overview: data["overview"] = body.overview
        if body.key_points: data["keyPoints"] = body.key_points
        if body.sections: data["sections"] = body.sections
        if body.data_points: data["dataPoints"] = body.data_points
        
        if body.qa_history is not None:
             data["qa_history"] = [q.dict() for q in body.qa_history]

        db.collection("users").document(uid).collection("histories").document(item_id).update(data)
        return {"ok": True, "message": "History updated"}
    except Exception as e:
        raise HTTPException(500, f"Update history failed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)