import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "EduGen API"
    VERSION: str = "3.8.5"
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")
    FRONTEND_ORIGINS: str = os.getenv("FRONTEND_ORIGINS", "")
    GOOGLE_APPLICATION_CREDENTIALS: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "./service-account.json")
    ALLOW_DEMO_AUTH: bool = os.getenv("ALLOW_DEMO_AUTH", "false").lower() in ("1", "true", "yes")

    # Azure OpenAI Settings
    AZURE_OPENAI_ENDPOINT: str = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    AZURE_OPENAI_API_KEY: str = os.getenv("AZURE_OPENAI_API_KEY", "")
    AZURE_OPENAI_API_VERSION: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-06-01")

    USE_OLLAMA: bool = os.getenv("USE_OLLAMA", "false").lower() in ("1", "true", "yes")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")

    NEAR_DUP_THRESHOLD: float = 0.78
    CTX_CHAR_LIMIT: int = 15000
    EXCLUDE_LIST_LIMIT: int = 30

settings = Settings()

if not settings.OPENAI_API_KEY and not settings.AZURE_OPENAI_API_KEY and not settings.USE_OLLAMA:
    raise RuntimeError("ไม่มี Key ของ OpenAI / Azure OpenAI หรือไม่ได้เปิดใช้งาน Ollama กรุณาตรวจที่ไฟล์ .env")

