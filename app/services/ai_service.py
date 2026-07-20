from openai import OpenAI
from app.core.config import settings

import time
import openai

class ChatCompletionsWrapper:
    def __init__(self, completions):
        self._completions = completions

    def create(self, *args, **kwargs):
        # Map OpenAI models to local Ollama models
        model = kwargs.get("model")
        
        # Check if the messages parameter contains any image inputs (vision task)
        has_images = False
        messages = kwargs.get("messages", [])
        for msg in messages:
            content = msg.get("content")
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "image_url":
                        has_images = True
                        break
            if has_images:
                break
                
        if model in ["gpt-4o-mini", "gpt-4o"]:
            if has_images:
                kwargs["model"] = "llava"
            else:
                kwargs["model"] = "qwen2.5"
            
        # Implement automatic retry with exponential backoff for RateLimitError (429)
        max_retries = 5
        base_delay = 2.0
        for attempt in range(max_retries):
            try:
                return self._completions.create(*args, **kwargs)
            except openai.RateLimitError as e:
                if attempt == max_retries - 1:
                    raise e
                delay = base_delay * (2 ** attempt)
                print(f"[AI Service] Rate limit hit (429) on model {kwargs.get('model')}. Retrying in {delay:.2f}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(delay)

class ChatWrapper:
    def __init__(self, chat):
        self._chat = chat
        self.completions = ChatCompletionsWrapper(chat.completions)

class EmbeddingsWrapper:
    def __init__(self, embeddings):
        self._embeddings = embeddings

    def create(self, *args, **kwargs):
        # Map OpenAI embedding models to Google Gemini embedding models
        model = kwargs.get("model")
        if model == "text-embedding-3-small":
            kwargs["model"] = "gemini-embedding-001"
            
        # Implement automatic retry with exponential backoff for RateLimitError (429)
        max_retries = 5
        base_delay = 2.0
        for attempt in range(max_retries):
            try:
                return self._embeddings.create(*args, **kwargs)
            except openai.RateLimitError as e:
                if attempt == max_retries - 1:
                    raise e
                delay = base_delay * (2 ** attempt)
                print(f"[AI Service] Rate limit hit (429) on embeddings. Retrying in {delay:.2f}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(delay)

class GeminiOpenAIWrapper:
    def __init__(self, client: OpenAI):
        self._client = client
        self.chat = ChatWrapper(client.chat)
        self.embeddings = EmbeddingsWrapper(client.embeddings)

# Initialize the OpenAI client pointing to local Ollama API
raw_client = OpenAI(
    api_key="ollama",  # Ollama does not check api_key, but it must not be empty
    base_url="http://localhost:11434/v1"
)

# Export the wrapped client so the rest of the application uses it seamlessly
client = GeminiOpenAIWrapper(raw_client)

def get_openai_client():
    return client

