---
name: edugen-testing-qa
description: Testing and Quality Assurance procedures for the EduGen project. Use when writing unit/integration tests for FastAPI, mocking OpenAI or Firestore, running pytest, or verifying Next.js frontend builds and linting.
---

# EduGen Testing & Quality Assurance Guide

This skill provides comprehensive instructions for testing, mocking external dependencies, and validating code quality across EduGen's FastAPI backend and Next.js frontend.

---

## 🧪 Backend Testing (Pytest)

### 1. Test Environment Setup
- Dependencies: `pytest`, `pytest-asyncio`, `httpx`, `coverage`.
- Command to run backend tests:
  ```bash
  pytest
  ```
- Command to run specific test file:
  ```bash
  pytest tests/test_summary.py -v
  ```

### 2. Mocking Policy (CRITICAL)
Never make real calls to paid third-party services (OpenAI API) or live Firestore DB during automated test runs.

#### Mocking OpenAI API Responses
```python
from unittest.mock import AsyncMock, patch
import pytest

@pytest.fixture
def mock_openai_response():
    with patch("app.services.openai_service.AsyncOpenAI") as mock_client:
        mock_instance = mock_client.return_value
        mock_instance.chat.completions.create = AsyncMock(return_value={
            "choices": [{"message": {"content": "Mocked summary result"}}]
        })
        yield mock_instance
```

#### Mocking Firestore Operations
```python
@pytest.fixture
def mock_firestore():
    with patch("app.db.firestore.db") as mock_db:
        mock_db.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {
            "title": "Test Document",
            "content": "Sample text content for test"
        }
        yield mock_db
```

---

## 💻 Frontend QA & Verification

### 1. Linting & Code Quality
Run ESLint check before committing frontend code:
```bash
cd frontend
npm run lint
```

### 2. Type Checking & Production Build Check
Ensure TypeScript compiles cleanly and Next.js builds without errors:
```bash
cd frontend
npx tsc --noEmit
npm run build
```

---

## 📋 Pre-Commit Quality Checklist

- [ ] All unit tests pass (`pytest` runs cleanly without failures).
- [ ] No unhandled API keys or secrets in source files.
- [ ] Next.js frontend builds without syntax or TypeScript errors.
- [ ] New API endpoints include proper input validation and Pydantic schemas.
