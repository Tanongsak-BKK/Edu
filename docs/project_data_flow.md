# 📖 คู่มืออธิบายการทำงานและเส้นทางการไหลของข้อมูล (EduGen Project Data Flow)

เอกสารฉบับนี้อธิบายโครงสร้างระบบ สถาปัตยกรรม และเส้นทางการส่งผ่านข้อมูล (Data Flow) ของโปรเจกต์ **EduGen** ทั้งฝั่ง Frontend (Next.js) และ Backend (FastAPI) โดยละเอียด เพื่อช่วยให้เข้าใจการทำงานร่วมกันของเทคโนโลยีแต่ละส่วน

---

## 🏗️ 1. ภาพรวมสถาปัตยกรรมของระบบ (System Architecture Overview)

ระบบ EduGen ออกแบบตามสถาปัตยกรรม **Modular Layered Architecture** แบ่งการทำงานออกเป็น 2 ชั้นหลัก ร่วมกับการเชื่อมต่อบริการภายนอก (Third-party Services):

```mermaid
graph TD
    Client[Next.js Frontend<br/>React / TS / Tailwind] <-->|HTTP Requests / Auth Header| API[FastAPI Backend<br/>Uvicorn / Python]
    Client <-->|Authentication| FirebaseAuth[Firebase Auth<br/>Client-side Sign-in]
    API <-->|Verify ID Token| FirebaseAuth[Firebase Admin SDK]
    API <-->|Read / Write Data| Firestore[Google Cloud Firestore]
    API <-->|AI Processing Tasks| OpenAI[OpenAI API<br/>gpt-4o-mini]
```

### รายละเอียดองค์ประกอบหลัก:
1. **Frontend (Next.js 16 / React 19 / TypeScript)**: ทำหน้าที่แสดงผล UI แบบ Single-page, จัดการ State ของข้อสอบ/โน้ตการเรียนรู้ และเรียกใช้งาน API ผ่าน HTTP Client โดยมี Zod ช่วยตรวจเช็กความถูกต้องของข้อมูล (Runtime Validation)
2. **Backend (FastAPI / Python 3.10+)**: ทำหน้าที่ประมวลผล Logic ของระบบ, การสกัดข้อความจาก PDF, ตรวจสอบสิทธิ์ผู้ใช้ และติดต่อสื่อสารกับฐานข้อมูลและ OpenAI
3. **Firebase Auth**: ระบบตรวจสอบสิทธิ์ความปลอดภัย โดยฝั่ง Client จะได้รับ ID Token มาส่งแนบไปใน HTTP Header เพื่อให้ฝั่ง Backend ตรวจสอบผ่าน Firebase Admin SDK
4. **Google Cloud Firestore**: ฐานข้อมูลแบบ NoSQL Cloud Database สำหรับจัดเก็บข้อมูลเชิงสัมพันธ์ของผู้ใช้ เช่น ประวัติการใช้งาน (History), โน้ต (Notes), ข้อสอบในคลัง (Quiz Bank)
5. **OpenAI API (gpt-4o-mini)**: สมองกลของระบบ ใช้ประมวลผลภาษาธรรมชาติในการสรุปเนื้อหา ดึงประเด็นสำคัญ สกัดหัวข้อ และสร้างข้อสอบแยกตามหัวข้อ

---

## 🔒 2. ระบบยืนยันตัวตนและการเข้าถึงข้อมูล (Authentication Flow)

ก่อนที่จะเข้าถึงข้อมูลส่วนตัว ระบบจะทำการตรวจเช็กสิทธิ์ผ่าน **Firebase ID Token** หรือ **Demo Auth Mode** เพื่อความสะดวกในการพัฒนาระบบ

```mermaid
sequenceDiagram
    autonumber
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant FB as Firebase Auth

    FE->>FB: ตรวจสอบสถานะการ Login (onAuthStateChanged)
    alt ล็อกอินผ่าน Firebase
        FB-->>FE: คืนค่า User Object + ID Token
        FE->>FE: บันทึก ID Token ลงใน Memory State
    else โหมด Demo (ALLOW_DEMO_AUTH = true)
        FE->>FE: ดึง UID จาก LocalStorage (หรือใช้ demo-user)
    end

    FE->>BE: ส่ง HTTP Request + Header (Authorization: Bearer <Token> หรือ X-User-Id)
    
    alt มี Bearer Token
        BE->>FB: ตรวจสอบ Token ผ่าน firebase_auth.verify_id_token
        FB-->>BE: คืนค่า Decoded Token (uid)
    else ไม่มี Token && ALLOW_DEMO_AUTH = true
        BE->>BE: ใช้ค่าจาก Header X-User-Id
    end

    alt ตรวจสอบผ่าน
        BE->>BE: ดำเนินการต่อด้วย UID ของผู้ใช้
    else ล้มเหลว
        BE-->>FE: ส่งกลับ HTTP 401 Unauthorized
    end
```

> [!NOTE]
> ในฝั่ง Backend มีการเขียน Custom Security Dependency ชื่อ `get_current_user` ใน `app/core/security.py` เพื่อกรองสิทธิ์ของผู้ใช้งานในระดับ Router เสมอ

---

## 📄 3. เส้นทางการสกัดข้อความจากไฟล์ PDF (PDF Extraction Flow)

เมื่อผู้ใช้อัปโหลดไฟล์ PDF ระบบจะส่งไฟล์ไปให้ Backend สกัดเอาเนื้อหาข้อความออกมาเพื่อไปใช้สำหรับสรุปและสร้างข้อสอบต่อ

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend

    User->>FE: ลากและวางไฟล์ PDF หรือคลิกเลือกไฟล์
    FE->>FE: ตรวจสอบขนาดและนามสกุลไฟล์ (.pdf เท่านั้น)
    FE->>BE: POST /pdf/extract (Multipart Form-Data ส่งไฟล์คีย์ 'pdf')
    
    Note over BE: คอนโทรลเลอร์ app/api/routes/pdf.py รับ request
    BE->>BE: ตรวจสอบความถูกต้องของไฟล์
    BE->>BE: เปิดอ่าน PDF ทุกหน้าด้วย pdfplumber.open()
    BE->>BE: สกัดข้อความ (Text) และประมวลผลทำความสะอาด (clean_text)
    
    alt สกัดข้อความสำเร็จ
        BE-->>FE: HTTP 200 ส่งข้อมูลกลับเป็น JSON { "text": "ข้อความทั้งหมด..." }
    else อ่านข้อความไม่ได้ หรือไม่ใช่ PDF
        BE-->>FE: HTTP 422 / 400 Error Message
    end
```

---

## 🧠 4. เส้นทางการสรุปเนื้อหาด้วย AI (Content Summarization Flow)

การสรุปเนื้อหาเป็นแบบ **2-Step Generation** เพื่อความละเอียดและมีโครงสร้างข้อมูลที่ชัดเจน (Structured JSON)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant AI as OpenAI API
    participant FS as Firestore DB

    User->>FE: พิมพ์ข้อความหรือส่งเนื้อหาที่สกัดจาก PDF
    FE->>BE: POST /summarize { "context": "เนื้อหาหลัก..." }
    
    Note over BE: SummarizeService.summarize เริ่มทำข้อมูล
    BE->>BE: ตัดข้อความส่วนเกิน (Truncate สูงสุด 45,000 ตัวอักษร)
    BE->>BE: แบ่งข้อความเป็นประโยค (Numbered Sentences สูงสุด 800 ประโยค)
    
    BE->>AI: [Step 1] ส่งประโยคทั้งหมดไปจำแนกหัวข้อและสรุปแบบละเอียด (5-9 หัวข้อ)
    AI-->>BE: คืนข้อมูลสรุปรายหัวข้อ (Sections JSON)
    
    BE->>AI: [Step 2] ส่งสรุปรายหัวข้อไปประมวลภาพรวม (Overview, Key Points, Data Points)
    AI-->>BE: คืนข้อมูลสรุปภาพรวมและข้อมูลสถิติ (JSON)
    
    BE->>FS: บันทึกข้อมูลประวัติสรุปลง Firestore: users/{uid}/summaries (log_user_event)
    BE-->>FE: HTTP 200 ส่งกลับโมเดล SummarizeOut
    FE->>FE: ตรวจสอบโครงสร้างผ่าน Zod Schema (SummarizeResponseSchema)
    FE->>FE: แสดงผลหน้า Summary ด้วยเอฟเฟกต์ Typewriter
    FE->>BE: POST /history/save เพื่อบันทึกประวัติเซสชัน
    BE->>FS: เขียนประวัติลง Firestore: users/{uid}/histories
```

---

## 📝 5. เส้นทางการสร้างข้อสอบอัจฉริยะ (Interactive Quiz Generation Flow)

เพื่อป้องกันคำถามซ้ำและการออกข้อสอบที่ไม่ออกนอกเนื้อหา ระบบมีขั้นตอนการกรองความซ้ำซ้อน (Near-duplicate filtering) ด้วยอัลกอริทึม NLP

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant AI as OpenAI API
    participant FS as Firestore DB

    User->>FE: เลือกสร้างข้อสอบแบบปรนัย (MCQ) หรือ ถูก/ผิด (TF)
    
    alt ยังไม่มีการวิเคราะห์หัวข้อ (Topics)
        FE->>BE: POST /quiz/topics { "context": "..." }
        BE->>AI: ค้นหาหัวข้อหลักที่สำคัญในเนื้อหา
        AI-->>BE: คืนรายการหัวข้อ [ "หัวข้อ A", "หัวข้อ B", ... ]
        BE-->>FE: คืนค่าหัวข้อเพื่อแสดงแถบเลือกหัวข้อที่ต้องการเน้น
    end

    User->>FE: กดปุ่ม "สร้างข้อสอบเพิ่ม" (คลิกเพิ่ม MCQ หรือ TF)
    FE->>BE: POST /quiz/mcq หรือ /quiz/tf <br/> { context, n, exclude: [รายการคำถามเดิม], topics }
    
    Note over BE: QuizService.generate_questions เริ่มประมวลผล
    BE->>AI: เรียกสร้างข้อสอบตามจำนวนที่ขอ (สั่งให้ AI ผลิตเผื่อ n + 3 ข้อ)
    AI-->>BE: คืนค่าชุดข้อสอบที่สร้างขึ้น (JSON)
    
    BE->>BE: กรองข้อสอบซ้ำด้วย filter_near_dups <br/> เทียบความคล้ายกับประวัติคำถาม (Jaccard & Dice similarity >= 0.78)
    
    alt ได้ข้อสอบไม่ครบตามจำนวน n (หลังกรองซ้ำ)
        BE->>AI: เรียก OpenAI อีกครั้งเพื่อสร้างเพิ่มเฉพาะส่วนที่ขาด (สูงสุด 2 รอบ)
        AI-->>BE: คืนค่าส่วนที่เหลือ
    end

    BE-->>FE: คืนค่าชุดคำถามที่กรองแล้ว (questions)
    FE->>FE: ดำเนินการจัดเก็บลง State, Shuffle ตัวเลือกคำตอบ
    FE->>BE: PATCH /history/update/{item_id} บันทึกสถานะคำถามลงประวัติ
    BE->>FS: อัปเดตข้อมูลเซสชันลง Firestore
```

---

## 🗃️ 6. ระบบจัดการคลังข้อสอบ (Quiz Bank & CRUD Flow)

ผู้เรียนสามารถบันทึกข้อสอบที่ต้องการเก็บไว้ทบทวนเป็นรายข้อ หรือสร้างเป็น "ชุดข้อสอบ" (Quiz Set) เอาไว้ฝึกทำในอนาคต

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant FS as Firestore DB

    User->>FE: เลือกข้อสอบที่ต้องการเก็บ แล้วกด "บันทึกเข้าคลัง"
    FE->>BE: POST /bank/quizzes/{quiz_id}/questions <br/> ส่งโมเดล QuestionIn ไปยังควิซเซ็ตปลายทาง
    
    BE->>FS: ดึงข้อมูลชุดข้อสอบและข้อสอบทั้งหมดในคลังของผู้ใช้มาตรวจสอบ
    BE->>BE: เทียบคำถามว่าเคยบันทึกข้อความแบบเดียวกันไปแล้วหรือไม่ (similarity >= 0.78)
    
    alt มีคำถามนี้อยู่แล้วในระบบ หรือคล้ายกันมาก
        BE-->>FE: ส่งกลับ HTTP 409 Conflict (แจ้งข้อความคำถามซ้ำ)
    else เป็นคำถามใหม่
        BE->>FS: บันทึกข้อสอบลง Firestore: users/{uid}/bank/questions
        BE->>FS: เพิ่ม ID คำถามเข้าใน Quiz Set: users/{uid}/bank/quizzes
        BE-->>FE: ส่งกลับ HTTP 200 บันทึกสำเร็จ
        FE->>FE: อัปเดต UI และ invalidate cache ของ React Query
    end
```

---

## 🖨️ 7. เส้นทางการส่งออกเอกสารเป็น PDF (PDF Export Flow)

ระบบสามารถสร้างไฟล์ PDF ของชุดข้อสอบที่เลือก พร้อมรองรับภาษาไทย และสามารถเลือกว่าจะสุ่มคำถามหรือแสดงเฉลยได้

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant FS as Firestore DB

    User->>FE: เลือกชุดข้อสอบและกดปุ่ม "Export PDF"
    FE->>BE: POST /export/quizzes/{quiz_id} <br/> { "shuffleChoices": false, "showAnswers": true }
    
    BE->>FS: ดึงข้อมูล Quiz Set และข้อสอบทั้งหมดที่อ้างอิง
    BE->>BE: สุ่มตำแหน่งตัวเลือก (หาก shuffleChoices = true)
    BE->>BE: เริ่มสร้าง PDF ด้วย ReportLab (จัดรูปแบบหน้ากระดาษและตารางเฉลย)
    BE->>BE: โหลดฟอนต์ภาษาไทย THSarabunNew.ttf (หากไม่มีจะใช้ Helvetica)
    
    BE-->>FE: ส่งกลับในรูปแบบ StreamingResponse (Content-Type: application/pdf)
    Note over FE: รับ Stream, ดึงชื่อไฟล์จาก Header Content-Disposition
    FE->>FE: แปลง Blob เป็น Object URL (URL.createObjectURL)
    FE-->>User: สั่งเปิดตัวดาวน์โหลดไฟล์ของเบราว์เซอร์อัตโนมัติ
```

---

## 💾 8. ตารางสรุปโครงสร้างข้อมูลในฐานข้อมูล (Firestore Collections Strategy)

ฐานข้อมูลของ EduGen ออกแบบโดยใช้ **Cloud Firestore** ในระดับ PaaS เพื่อให้ผู้ใช้งานสามารถเข้าถึงข้อมูลเดียวกันได้จากทุกอุปกรณ์

| เส้นทางคอลเลกชัน (Firestore Path) | โครงสร้างเอกสาร (Document Fields) | วัตถุประสงค์ในการเก็บข้อมูล |
| :--- | :--- | :--- |
| `users/{uid}/notes/{file_id}` | `file_id`, `content`, `updated_at` | ใช้สำหรับเก็บข้อความโน้ตย่อที่บันทึกร่วมกับไฟล์เอกสาร มีระบบ Autosave debounced 1.2s |
| `users/{uid}/bank/questions/{qid}`| `id`, `type`, `question`, `choices`, `answer`, `explain`, `topic` | เก็บข้อสอบรายข้อที่เป็นคลังส่วนตัวของผู้ใช้ |
| `users/{uid}/bank/quizzes/{quiz_id}`| `id`, `title`, `question_ids` (array), `created_at`, `updated_at` | เก็บข้อมูลกลุ่มหรือชุดข้อสอบที่มีความเชื่อมโยงไปยังคลังข้อสอบ |
| `users/{uid}/histories/{history_id}`| `fileName`, `overview`, `keyPoints`, `sections`, `questions`, `answers`, `score`, `content`, `qa_history`, `timestamp` | เก็บประวัติการเรียนรู้แต่ละเซสชัน เพื่อใช้ในการกดเรียกดูย้อนหลังหรือกลับมาทำข้อสอบเดิมต่อ |
| `users/{uid}/summaries/{auto_id}` | `overview`, `key_points`, `sections`, `data_points`, `timestamp` | บันทึกประวัติและผลลัพธ์ของระบบ AI สรุปเอกสารเพื่อเก็บสถิติ |

---

## 🛠️ 9. สรุปความก้าวหน้าการส่งผ่านข้อมูลในภาพรวม (End-to-End Summary)

```text
[อัปโหลดเอกสาร] ──> (Next.js) ──> [ไฟล์ PDF] ──> (FastAPI) ──> สกัดข้อความ (pdfplumber)
                                                                       │
[ผลลัพธ์ข้อมูล] <── (Next.js) <── [สรุปเนื้อหา / ข้อสอบ] <── (OpenAI) <──┘
       │
       ├─> [บันทึกประวัติ] ──> (FastAPI) ──> [Firestore: histories]
       ├─> [จดบันทึกย่อ] ───> (FastAPI) ──> [Firestore: notes]
       └─> [เก็บคลังข้อสอบ] ─> (FastAPI) ──> [Firestore: bank] ──> [ส่งออก PDF (ReportLab)]
```

> [!TIP]
> **เทคนิคเด่นในงานสถาปัตยกรรมนี้:**
> * **React Query (TanStack)** ช่วยจัดการ Cache ข้อมูลการเรียกคลังข้อสอบและประวัติ ทำให้ UI โหลดได้รวดเร็วทันทีโดยไม่ต้องยิง API ใหม่ซ้ำ ๆ
> * **Dice Bigram & Jaccard Index** ช่วยกรองความซ้ำซ้อนของคำถามระดับตัวอักษรและกลุ่มคำ ทำให้ได้ข้อสอบที่หลากหลายเนื้อหา
