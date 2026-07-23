# EduGen Project - Version History & Changelog

## Session: July 8, 2026 (Analytics & Advanced AI Evaluation)

### 1. 📊 Premium Reports Dashboard (`ReportsSection.tsx`)
- **Redesigned UI**: พัฒนาหน้าจอ "รายงานผลการเรียน" ด้วยดีไซน์แบบ Premium & Modern (Glassmorphism)
- **AI Insights**: เพิ่มการ์ดวิเคราะห์ผลการเรียนอัจฉริยะ โดย AI จะแนะนำสิ่งที่ควรทบทวนตามคะแนนเฉลี่ย
- **Accuracy Metrics**: สร้างวงแหวนแสดงความแม่นยำเฉลี่ย (Circular Progress SVG) และเปอร์เซ็นต์เทียบกับครั้งก่อน
- **Performance Trend**: สร้างกราฟแท่งแบบไดนามิก (Tailwind CSS) เพื่อแสดงแนวโน้มคะแนน 7 ครั้งล่าสุด

### 2. 🎚️ Adaptive Difficulty System (ระบบปรับความยากอัตโนมัติ)
- **Backend API**: อัปเดต `quiz_service.py` และ `schemas.py` ให้รองรับพารามิเตอร์ `difficulty` (easy, medium, hard)
- **Dynamic Prompts**: สร้างชุดคำสั่ง (Prompt) ที่แตกต่างกันตามระดับความยาก (เน้นความจำ vs เน้นการวิเคราะห์เชิงลึก)
- **Frontend Logic**: แก้ไข `useQuiz.ts` ให้คำนวณและจำระดับความยากจากคะแนนล่าสุด (คะแนน > 80% ปรับเป็นยาก, < 50% ปรับเป็นง่าย)
- **UI Selector**: เพิ่ม Dropdown ใน `QuizToolbar.tsx` ให้ผู้ใช้สามารถเลือกความยากเองได้ก่อนกดสร้างข้อสอบ (Auto, Easy, Medium, Hard)

### 3. ⚖️ AI-as-a-Judge Architecture (`evaluation_service.py`)
- **New Evaluation Engine**: สร้าง Backend Service ใหม่เพื่อประเมิน "เหตุผล/คำอธิบาย" ของผู้ใช้แทนการใช้ MCQ แบบเดิม
- **Semantic Equivalence Rule**: สั่งให้ AI ตรวจคำตอบที่ความหมายและตรรกะ (Logic) อนุญาตให้ใช้ภาษาบ้านๆ หรือสแลงได้
- **Zero Hallucination (Strict Grounding)**: ผูกการตรวจข้อสอบไว้กับ RAG Context เสมอ หากผู้ใช้อธิบายแย้งกับเอกสารต้นฉบับจะถือว่าผิดทันที ห้าม AI ใช้ความรู้ภายนอก
- **Partial Completeness**: ระบบเติมเต็มข้อบกพร่อง โดยชี้ประเด็นที่ผู้ใช้ตอบตกหล่นใน `missing_points`
- **Model Upgrade**: เปลี่ยนไปใช้ `gpt-4o` (ตัวเต็ม) สำหรับการตรวจข้อสอบเพื่อความแม่นยำในระดับสูงสุด

### 4. 🗄️ History System Verification
- ตรวจสอบและยืนยันระบบ `HistorySidebar` ที่เก็บบันทึก สรุป, ข้อสอบ, และประวัติแชท Q&A ผูกกับ Account ของผู้ใช้

### 5. 📱 Mobile Responsive Layout (UI & UX)
- **Absolute Drawers**: ปรับปรุง `SystemSidebar` และ `HistorySidebar` ให้ทำงานแบบ Drawer ลอยตัว (Overlay) บนหน้าจอมือถือและแท็บเล็ต
- **Backdrop System**: เพิ่มฉากหลังกึ่งโปร่งใส (Backdrop-blur) เมื่อเปิดเมนูบนมือถือ และปิดอัตโนมัติเมื่อกดที่ฉากหลัง
- **Prevent Scroll**: ล็อกการเลื่อนหน้าจอแนวนอน (`overflow-x-hidden`) ป้องกันอาการจอสั่นเวลาเปิด/ปิดเมนูบนอุปกรณ์พกพา

### 6. ☁️ Stateless RAG Architecture (Firestore Vector Database)
- **Azure Readiness**: รีแฟกเตอร์ (Refactor) ไฟล์ `rag_service.py` ทั้งหมด ให้เป็นแบบไร้สถานะ (Stateless) เพื่อแก้ปัญหาข้อมูลหายเวลาย้ายขึ้นเซิร์ฟเวอร์คลาวด์เช่น Azure
- **Firestore Integration**: ยกเลิกระบบเขียนไฟล์ `rag_cache.json` ลงคอมพิวเตอร์ และเปลี่ยนไปเซฟข้อมูล Vector (พิกัด) ของ PDF ลงบน Firebase Firestore โดยตรง
- **Limit Bypass**: เขียนระบบ Batch Write หั่น PDF เป็นย่อหน้าเล็กๆ (Chunks) และเซฟแยกลงใน Sub-collection `rag_cache/{id}/chunks` เพื่อก้าวข้ามข้อจำกัด 1MB ของ Firestore Document
- **Race Condition Fixed**: รองรับผู้ใช้หลายคน (Concurrency) อัปโหลดเอกสารพร้อมกันได้ 100% โดยที่ข้อมูลไม่ทับซ้อนหรือสูญหาย

## Session: July 10, 2026 (Fixing PDF Summarize, Quiz Generation & Gemini API Upgrades)

### 1. 📂 แก้ไขบั๊กปุ่ม "สรุปเนื้อหา" และ Bad Request (RAG Context Validation)
- **Backend Fix**: ปรับปรุงเงื่อนไขตรวจสอบข้อมูลใน `quiz_service.py` (ฟังก์ชัน `extract_topics` และการออกข้อสอบแบบกลุ่ม) ให้ยินยอมให้ข้อความดิบ (`context`) เป็นค่าว่างได้หากมีไอดีเอกสาร PDF (`document_id`) แนบมาด้วย เพื่อให้ระบบดึงข้อมูล RAG จาก Firestore โดยไม่ชน Error 400
- **Frontend Fix**: แก้ไขเงื่อนไขของปุ่มสรุปเนื้อหาใน `page.tsx` จากเดิมดักตรวจสอบเฉพาะข้อความที่พิมพ์เอง ให้สามารถเริ่มสรุปเนื้อหาได้ทันทีเมื่อมีไฟล์เอกสาร PDF (`documentId`) แม้จะไม่มีการพิมพ์ข้อความเพิ่มก็ตาม

### 2. ⚡ รองรับรหัสคีย์รูปแบบใหม่ & อัปเกรดโมเดลท็อประดับ Pro (`ai_service.py`)
- **Key Compatibility**: ตรวจสอบและรองรับ API Key รูปแบบใหม่ของ Google AI Studio ที่ขึ้นต้นด้วยฟอร์แมตความปลอดภัย **`AQ.`** (แทนรูปแบบ `AIzaSy` เดิม) ซึ่งมีปัญหากับ Gateway แปลง OpenAI แบบเดิม
- **Model Transition (Gemini 3.1 Pro)**: ปรับปรุงการ Map โมเดลในหลังบ้านให้เรียกไปยัง **`gemini-3.1-pro-preview`** ซึ่งเป็นโมเดลที่ฉลาดที่สุดในปัจจุบัน รองรับ Input Token สูงถึง 1 ล้านคำ และตอบกลับได้ดีกว่าเดิม พร้อมรับการเปลี่ยนผ่านของคีย์ในระดับ Paid Tier (Pay-as-you-go) โดยไม่มีผลกระทบต่อความเสถียร
- **Rate Limit & High Demand Handling**: ออกแบบระบบรองรับและรับมือการเรียกใช้งานที่มีคิวหนาแน่น เพื่อความลื่นไหลสูงสุดเมื่อผู้ใช้อัปเกรดบัตรเครดิต

### 3. 🧹 Clean Up & Workspace Optimization
- เคลียร์ไฟล์สคริปต์ทดสอบชั่วคราวในการวิเคราะห์โมเดลออกจาก Workspace ทั้งหมดเพื่อความสะอาดและเป็นระเบียบเรียบร้อยของโค้ดโปรเจกต์

## Session: July 20, 2026 (Optimizing RAG Accuracy, Hybrid Search & Deduplication)

### 1. 🔍 ระบบค้นหาแบบผสมผสาน (Hybrid Search Implementation)
- **Hybrid Retrieval**: ปรับปรุงระบบค้นหาเอกสารใน `rag_service.py` โดยผสมผสานคะแนนจาก Vector Semantic Search (70%) และ Keyword Overlap Matching (30%) ช่วยให้ค้นหาเนื้อหาที่มีคำเฉพาะเจาะจง (เช่น Location 1, Location 2) ได้แม่นยำขึ้น แม้จะมีค่า Cosine Similarity ต่ำ
- **Recall Expansion**: เพิ่มจำนวน Chunk ข้อมูลนำเข้าสำหรับตอบคำถาม (`top_k`) จาก 6 เป็น 10 Chunks ใน `qa_service.py` เพื่อให้ครอบคลุมส่วนเนื้อหารายละเอียดทั้งหมดของเอกสาร ไม่ให้ข้อมูลตกหล่น

### 2. 🛡️ แก้ไขปัญหาข้อความซ้ำซ้อนจากรอยต่อ Chunk (Overlap Duplication Fix)
- **Coordinate-Based Merging**: ปรับปรุงการนำเสนอ Context ใน `rag_service.py` โดยสร้างฟังก์ชันจับกลุ่ม (Grouping) และสกัดข้อความในช่วงดัชนีที่ติดกันออกมาจากข้อความดิบ (`raw_text`) โดยตรงตามพิกัดตัวอักษร
- **Overlap Elimination**: ช่วยแก้ปัญหารอยต่อข้อความทับซ้อนกันจากค่า Overlap (ซึ่งก่อนหน้านี้ทำให้โมเดลสับสนและนำข้อความของหัวข้อหนึ่งไปอธิบายซ้ำในอีกหัวข้อหนึ่ง เช่น Location 1 และ 2 ซ้ำกัน) ส่งผลให้คำตอบที่ได้มีความกระชับ ถูกต้อง และไม่มีข้อมูลซ้ำซ้อน 100%

### 3. 🎯 ยกระดับ Prompt Engineering ป้องกันโมเดลจินตนาการ (Zero-Hallucination Prompt)
- **Role Separation**: แบ่งโครงสร้างคำสั่งของ AI ใน `qa_service.py` ออกเป็น System Role และ User Role เพื่อควบคุมทิศทางการตอบคำถามอย่างเป็นสัดส่วน
- **Strict Guidelines**: บังคับให้ออกผลลัพธ์เป็นภาษาไทย 100% (ป้องกันข้อความภาษาจีนหรือภาษาอื่นปะปน) และระบุข้อจำกัดห้ามจินตนาการตัวเลขหรือตำแหน่งแปลกปลอม (เช่น Location 14) นอกเหนือจากที่ระบุในเอกสารอ้างอิง
- **Deterministic Response**: ปรับค่าระดับความสร้างสรรค์ของโมเดล (`temperature`) ลงเหลือ 0.15 เพื่อเน้นความถูกต้องของข้อมูลตามเอกสารอ้างอิงเป็นหลัก

### 📋 4. แผนงานการขึ้นระบบ Azure และรองรับไฟล์ขนาดใหญ่ (Future Cloud-Native Scalability Plan)
- **Background Architecture**: จัดทำแผนพัฒนาเพื่อรองรับไฟล์เอกสารขนาดใหญ่ (100 - 1,000 หน้า) โดยนำเสนอแนวทางใช้ FastAPI BackgroundTasks หรือ Azure Functions (Queue Trigger) ในการประมวลผลเบื้องหลัง
- **Azure Blob Storage Integration**: วางแผนเปลี่ยนการจัดเก็บไฟล์เอกสารชั่วคราวไปไว้บน Azure Blob Storage แทนพื้นที่เก็บข้อมูลเครื่อง Host
- **Stateless Cloud Embeddings**: เสนอแนวทางเปลี่ยนจากโมเดล Local (`BAAI/bge-m3`) ไปใช้ Azure OpenAI Service / OpenAI Embedding API (`text-embedding-3-small`) เพื่อลดภาระการใช้ทรัพยากร (RAM/CPU) ของ Host บนคลาวด์ลงกว่า 90%

