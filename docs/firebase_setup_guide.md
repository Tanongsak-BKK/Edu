# 🚀 คู่มือการตั้งค่า Firebase และ Firestore (Firebase & Firestore Setup Guide)

เอกสารฉบับนี้อธิบายขั้นตอนการสร้างและตั้งค่าโครงการบน **Firebase Console** การกำหนดค่าในโปรเจกต์ (Backend & Frontend) และการติดตั้ง Security Rules และ Index อย่างละเอียดทีละขั้นตอน

---

## 1. การตั้งค่าโครงการบน Firebase Console

### ขั้นตอนที่ 1.1: สร้างโปรเจกต์ใหม่ (Create Project)
1. เข้าไปที่ [Firebase Console](https://console.firebase.google.com/)
2. คลิกปุ่ม **"Add project"** (หรือสร้างต่อจากโปรเจกต์ Google Cloud เดิม)
3. ระบุชื่อโปรเจกต์ (เช่น `edugen-ai`) จากนั้นคลิก **Continue**
4. เปิด/ปิด Google Analytics ตามที่คุณต้องการ จากนั้นคลิก **Create project** แล้วรอจนสร้างเสร็จ

---

### ขั้นตอนที่ 1.2: เปิดใช้งาน Cloud Firestore
1. ในเมนูด้านซ้าย ไปที่ **Build** > **Firestore Database**
2. คลิกปุ่ม **"Create database"**
3. เลือกตำแหน่งเซิร์ฟเวอร์ (Database Location) ที่ใกล้ที่สุด (เช่น `asia-southeast1` สำหรับสิงคโปร์ หรือ `asia-east2` สำหรับฮ่องกง)
4. เลือกโหมดเริ่มต้นเป็น **"Start in test mode"** (หรือ **"Start in production mode"** แล้วค่อยไปนำกฎ Security Rules ไปใส่ภายหลัง)
5. คลิก **Create**

---

### ขั้นตอนที่ 1.3: เปิดใช้งาน Authentication
1. ในเมนูด้านซ้าย ไปที่ **Build** > **Authentication**
2. คลิกปุ่ม **"Get Started"**
3. ที่แท็บ **Sign-in method** เลือกผู้ให้บริการ (Sign-in Providers) ที่ต้องการใช้งาน:
   * **Email/Password:** เปิดใช้งาน (Enable) และบันทึก
   * **Google:** เปิดใช้งาน (Enable) กรอกอีเมลสำหรับขอความช่วยเหลือโครงการ (Project support email) จากนั้นกดบันทึก
4. (ตัวเลือก) หากใช้ Google Sign-In คุณอาจจำเป็นต้องกรอก SHA fingerprint ของคอมพิวเตอร์คุณที่ส่วน Project Settings เพิ่มเติมในภายหลัง

---

## 2. การตั้งค่าการเชื่อมต่อ (Configuration)

### ขั้นตอนที่ 2.1: สร้าง Service Account สำหรับฝั่ง Backend (FastAPI)
เพื่อให้ FastAPI backend สามารถจัดการแก้ไขข้อมูลทั้งหมดผ่าน Firebase Admin SDK ได้อย่างปลอดภัย:
1. คลิกที่ไอคอนฟันเฟือง ⚙️ ข้างชื่อโปรเจกต์ในเมนูด้านซ้าย เลือก **Project settings**
2. ไปที่แท็บ **Service accounts**
3. ตรวจสอบให้แน่ใจว่าเลือกตัวเลือก **Firebase Admin SDK** (Python/Node.js) แล้ว
4. คลิกปุ่ม **"Generate new private key"**
5. จะมีหน้าต่างยืนยัน ให้คลิก **Generate key** เพื่อดาวน์โหลดไฟล์ `.json` คีย์ส่วนตัวลงคอมพิวเตอร์ของคุณ
6. เปลี่ยนชื่อไฟล์ที่ดาวน์โหลดมาเป็น **`service-account.json`**
7. ย้ายไฟล์นี้ไปวางไว้ที่ **root folder** ของโปรเจกต์ Backend (คือที่เดียวกับไฟล์ `README.md` และ `.env`)

> [!WARNING]
> **สำคัญมาก:** ห้ามนำไฟล์ `service-account.json` อัปโหลดขึ้น Git สาธารณะ (GitHub/GitLab) โดยเด็ดขาด เนื่องจากมีสิทธิ์ผู้ควบคุมระบบทั้งหมด ไฟล์นี้ได้รับการระบุไว้ใน `.gitignore` เรียบร้อยแล้ว

---

### ขั้นตอนที่ 2.2: สร้างเว็บแอปสำหรับฝั่ง Frontend (Next.js)
เพื่อเชื่อมต่อหน้าเว็บบนเบราว์เซอร์เข้ากับระบบตรวจสอบสิทธิ์ผู้ใช้ (Firebase Authentication):
1. กลับมาที่หน้า **Project settings** > แท็บ **General**
2. เลื่อนลงมาด้านล่างสุดที่หัวข้อ **Your apps** คลิกไอคอนวงกลมรูปโค้ด `</>` เพื่อลงทะเบียนเว็บแอป
3. ระบุชื่อเล่นของแอป (เช่น `edugen-frontend`) และกด **Register app** (ไม่ต้องเลือก Firebase Hosting)
4. ระบบจะแสดงโค้ด `firebaseConfig` ออกมา ให้คัดลอกค่าต่างๆ มากรอกลงในไฟล์สภาพแวดล้อมของคุณ

---

## 3. การกรอกค่าตัวแปรในไฟล์ `.env`

สร้างหรือแก้ไขไฟล์ `.env` ที่ root ของโปรเจกต์เพื่อนำค่าที่คัดลอกมาใส่:

```env
# ตั้งค่า API Key ของผู้สร้างระบบ AI
OPENAI_API_KEY="sk-proj-xxxxxx..."

# ตั้งค่าฝั่ง Backend (อ้างอิงไฟล์ service-account.json ที่เซฟไว้)
FIREBASE_PROJECT_ID="ชื่อไอดีโปรเจกต์ของคุณ"
GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
ALLOW_DEMO_AUTH=false  # ปรับเป็น false ในระดับ Production

# ตั้งค่าฝั่ง Frontend (Next.js)
NEXT_PUBLIC_API="http://localhost:8000"
NEXT_PUBLIC_ALLOW_DEMO_AUTH=false

# ดึงมาจากหน้า Web App firebaseConfig บน Firebase Console
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyAxxxxxxx..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="โปรเจกต์ของคุณ.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="ชื่อไอดีโปรเจกต์ของคุณ"
NEXT_PUBLIC_FIREBASE_APP_ID="1:xxxx:web:xxxx"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=""
```

---

## 4. ตั้งค่า Security Rules และ Indexes บนหน้า Console

### ขั้นตอนที่ 4.1: การอัปเดต Security Rules
1. ไปที่หน้า **Firestore Database** > แท็บ **Rules**
2. แทนที่กฎเดิมทั้งหมดด้วยกฎด้านล่างนี้ เพื่อปกป้องสิทธิ์ข้อมูลของผู้ใช้แต่ละท่าน:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ข้อมูลภายใต้ users จะอ่านเขียนได้เฉพาะเจ้าของ UID เท่านั้น
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    // ข้อมูล RAG Cache อนุญาตให้ผู้ที่ Login ทุกคนอ่านได้ แต่แก้ไขผ่านหลังบ้าน/แอดมินเท่านั้น
    match /rag_cache/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
      
      match /chunks/{chunkId} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }
  }
}
```
3. คลิกปุ่ม **"Publish"** เพื่อบันทึกและเปิดใช้งานกฎ

---

### ขั้นตอนที่ 4.2: การตั้งค่า Composite Indexes
เนื่องจากโค้ด FastAPI ดึงข้อมูลโดยมีการกรองตาม `uid` และเรียงลำดับตามเวลา (`order_by("timestamp", direction=firestore.Query.DESCENDING)`) เราจึงจำเป็นต้องทำ Composite Index:
1. ไปที่หน้า **Firestore Database** > แท็บ **Indexes**
2. คลิก **Add Index**
3. กรอกการตั้งค่าดัชนีดังนี้:
   * **Collection ID:** `histories`
   * **Fields to index:**
     1. Field path: `timestamp` -> Query scope: **Collection** -> Sort order: **Descending**
4. คลิก **Create index** และรอให้สถานะเปลี่ยนจาก *Building* เป็น *Active* (ใช้เวลาประมาณ 1-3 นาที)
