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
