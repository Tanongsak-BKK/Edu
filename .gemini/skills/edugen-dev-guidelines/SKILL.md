---
name: edugen-dev-guidelines
description: Development guidelines, architecture rules, and coding standards for the EduGen project (FastAPI Backend, Next.js 16 Frontend, OpenAI RAG, Firestore DB, PDF Processing). Activate when developing, refactoring, or building new features for EduGen.
---

# EduGen Development Guidelines & Architecture

EduGen is an AI-powered education platform providing document summarization, interactive quiz generation, and RAG-based context QA.

---

## 🏗️ Architecture Overview

```
EduGen/
├── app/                  # Backend (FastAPI + Python 3.10+)
│   ├── api/              # API Route Controllers (Endpoints)
│   ├── core/             # Core Config, Security, Firebase Init, OpenAI Setup
│   ├── db/               # Firestore Client & Database Helpers
│   ├── models/           # Pydantic Schemas (Request/Response Models)
│   ├── services/         # Business Logic (RAG, OpenAI, Quiz Gen, Summary, PDF)
│   └── utils/            # Helper utilities (PDFPlumber parser, ReportLab exporter)
├── frontend/             # Frontend (Next.js 16 + React 19 + TypeScript)
│   ├── src/
│   │   ├── app/          # App Router Pages & API Proxies
│   │   ├── components/   # UI Components (Tailwind CSS 4)
│   │   ├── hooks/        # React Query Custom Hooks
│   │   ├── services/     # API Client Services
│   │   └── types/        # TypeScript Definitions
├── tests/                # Pytest Test Suites for Backend
└── docs/                 # Project & Deployment Documentation
```

---

## 🛠️ Backend Guidelines (FastAPI)

### 1. API Route & Controller Conventions
- Place API routes in `app/api/`.
- Use async route handlers (`async def`).
- Enforce strict type annotations and Pydantic validation for both Request bodies and Responses.
- Always handle HTTP exceptions with proper status codes (`400`, `401`, `404`, `500`).

### 2. OpenAI API & RAG Context
- Store OpenAI API calls in `app/services/`.
- Always specify strict system prompts and leverage **JSON Mode** or Pydantic structured output for quiz and summary generation.
- Implement strict duplicate-question prevention logic when generating quizzes from documents.
- Keep RAG context bounds within token limits and sanitize input text.

### 3. Firestore Database Operations
- Use Firebase Admin SDK initialized in `app/core/firebase.py`.
- Never expose service account credentials in code; rely on `GOOGLE_APPLICATION_CREDENTIALS` or `.env`.
- Organize Firestore collections cleanly (`users`, `documents`, `summaries`, `quizzes`, `notes`).

---

## 🎨 Frontend Guidelines (Next.js 16)

### 1. Component & Styling Standards
- Use React 19 Client (`'use client'`) and Server Components appropriately in `src/app/`.
- Style exclusively with **Tailwind CSS 4** and modern design tokens (dark modes, sleek cards, micro-animations).
- Avoid inline static magic offsets; use flex/grid layouts.

### 2. State & Data Fetching
- Use **TanStack React Query** for server state management (fetching, caching, invalidation).
- Manage user authentication state via Firebase Auth (`onAuthStateChanged`).
- Validate form and request inputs using **Zod** schemas matching backend Pydantic models.

---

## ⚠️ Error Handling & Security

- **Environment Variables**: Never commit `.env` or `service-account.json`.
- **Backend Error Response Standard**:
  ```json
  {
    "detail": "Descriptive error message",
    "error_code": "INVALID_DOCUMENT_FORMAT"
  }
  ```
- **Frontend Error Fallback**: Show user-friendly error banners or toasts when API requests fail.
