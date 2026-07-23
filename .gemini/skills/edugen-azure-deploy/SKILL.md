---
name: edugen-azure-deploy
description: Deployment procedures, Azure App Service setup, environment variable configuration, and CI/CD pipeline checks for EduGen. Activate when preparing for production deployment or configuring Azure resources.
---

# EduGen Azure App Service Deployment Guide

This skill provides step-by-step guidance for deploying the EduGen platform to **Azure App Service** using a two-tier PaaS architecture.

---

## 🏛️ Deployment Architecture

EduGen operates on a two-tier Azure App Service model:

1. **Python App Service** (Backend)
   - Runtime: Python 3.10+
   - Framework: FastAPI (Uvicorn)
   - Handles: Document processing, RAG, OpenAI API calls, Firestore CRUD.
2. **Node.js App Service** (Frontend)
   - Runtime: Node.js 18 LTS or 20 LTS
   - Framework: Next.js 16 (App Router)
   - Handles: User interface, client authentication, rendering.

---

## ⚙️ App Service Startup Commands

### 1. FastAPI Backend Startup Command
In Azure App Service -> Configuration -> General Settings -> Startup Command:
```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```
*(Or for light workloads: `uvicorn app.main:app --host 0.0.0.0 --port 8000`)*

### 2. Next.js Frontend Startup Command
In Azure App Service Node instance:
```bash
npm run start
```

---

## 🔑 Environment Variables Checklist

Ensure the following App Settings are configured in the Azure App Service portal:

### Backend Settings (Python App Service)
| Variable Name | Example / Description |
|---|---|
| `OPENAI_API_KEY` | `sk-proj-...` (Production OpenAI API key) |
| `FIREBASE_PROJECT_ID` | `edugen-prod-project` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/home/site/wwwroot/service-account.json` |
| `ALLOW_DEMO_AUTH` | `false` |
| `CORS_ORIGINS` | `https://your-edugen-frontend.azurewebsites.net` |

### Frontend Settings (Node App Service)
| Variable Name | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-edugen-backend.azurewebsites.net` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Client Auth Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |

---

## 🚀 Pre-Deployment Verification

Before triggering a deployment via GitHub Actions or Azure CLI:

1. **Verify Backend Health Endpoint**: Ensure `/` or `/health` returns `200 OK`.
2. **Verify Service Account JSON**: Confirm `service-account.json` is properly mounted or securely set in Azure secrets.
3. **Verify CORS Settings**: Confirm backend CORS configuration permits requests from the frontend Azure domain.
