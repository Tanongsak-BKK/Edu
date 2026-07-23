# Azure App Service Deployment

This project is prepared for two classic Azure App Service apps:

- Frontend: Linux App Service, Node.js 20 LTS, runs Next.js from `frontend`.
- Backend: Linux App Service, Python 3.12, runs FastAPI from `app`.

## Azure resources

Create two Web Apps in the same resource group:

- `your-frontend-app`: Runtime stack `Node 20 LTS`
- `your-backend-app`: Runtime stack `Python 3.12`

Recommended App Service settings:

- Enable HTTPS Only.
- Turn on Application Insights.
- Use Deployment Slots for production releases when the plan supports slots.

## Backend App Service settings

Set this startup command on the Python App Service:

```bash
gunicorn --bind=0.0.0.0:8000 --timeout 600 -k uvicorn.workers.UvicornWorker app.main:app
```

Add these application settings:

```text
# AI Settings (เลือกใช้อย่างใดอย่างหนึ่ง)
OPENAI_API_KEY=<your-openai-api-key>

# หรือหากใช้ Azure OpenAI Service (หักเงินเครดิต $100)
AZURE_OPENAI_ENDPOINT=https://<your-azure-openai-name>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-azure-openai-key>
AZURE_OPENAI_API_VERSION=2024-06-01

# Firebase & App Settings
FIREBASE_PROJECT_ID=<firebase-project-id>
# เลือกใส่ Base64 string ของ service-account.json เพื่อไม่ต้อง upload ไฟล์
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64-encoded-service-account-json>
FRONTEND_ORIGINS=https://your-frontend-app.azurewebsites.net
ALLOW_DEMO_AUTH=false
SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

Health check path:

```text
/health
```

## Frontend App Service settings

Set this startup command on the Node.js App Service:

```bash
node server.js
```

Add these application settings:

```text
NEXT_PUBLIC_API=https://your-backend-app.azurewebsites.net
NEXT_PUBLIC_ALLOW_DEMO_AUTH=false
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<firebase-project-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<firebase-web-app-id>
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<optional-measurement-id>
```

These `NEXT_PUBLIC_*` values are compiled into the Next.js build by GitHub Actions, so update GitHub Actions variables too before deploying.

## GitHub configuration

Repository secrets:

```text
AZURE_FRONTEND_PUBLISH_PROFILE
AZURE_BACKEND_PUBLISH_PROFILE
```

Repository variables:

```text
AZURE_FRONTEND_APP_NAME=your-frontend-app
AZURE_BACKEND_APP_NAME=your-backend-app
NEXT_PUBLIC_API=https://your-backend-app.azurewebsites.net
NEXT_PUBLIC_ALLOW_DEMO_AUTH=false
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<firebase-project-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<firebase-web-app-id>
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<optional-measurement-id>
```

Download each publish profile from the App Service Overview page, then paste the XML into the matching GitHub secret.

## Deployment

The workflows deploy automatically on pushes to `main`:

- `.github/workflows/deploy-frontend-azure-app-service.yml`
- `.github/workflows/deploy-backend-azure-app-service.yml`

They can also be run manually from the GitHub Actions tab.
