import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend/ directory regardless of CWD.
# Python 3.14's find_dotenv() is unreliable inside heredocs / gunicorn.
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=False)




def _split(v: str):
    return [x.strip() for x in v.split(",") if x.strip()]


class Config:
    APP_ENV = os.getenv("APP_ENV", "local")

    CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "900"))

    FEED_URLS = _split(os.getenv(
        "FEED_URLS",
        "https://aws.amazon.com/about-aws/whats-new/recent/feed/,"
        "https://aws.amazon.com/blogs/aws/feed/,"
        "https://aws.amazon.com/blogs/machine-learning/feed/,"
        "https://aws.amazon.com/blogs/compute/feed/",
    ))

    CORS_ORIGINS = _split(os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ))

    # ---------- LLM provider switch ----------
    # local | bedrock
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "local")

    # mock | groq   (local provider mode)
    LOCAL_LLM_MODE = os.getenv("LOCAL_LLM_MODE", "mock")

    # ---------- Groq (OpenAI-compatible) ----------
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    
    # ---------- AWS Bedrock (unused locally; filled on EC2) ----------
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    BEDROCK_CHAT_MODEL_ID = os.getenv("BEDROCK_CHAT_MODEL_ID", "amazon.nova-pro-v1:0")
    BEDROCK_SEARCH_MODEL_ID = os.getenv("BEDROCK_SEARCH_MODEL_ID", "amazon.nova-lite-v1:0")

    # ---------- Article scraping ----------
    ARTICLE_CACHE_TTL_SECONDS = int(os.getenv("ARTICLE_CACHE_TTL_SECONDS", "3600"))

    # ---------- Chat tuning ----------
    CHAT_TOP_K = int(os.getenv("CHAT_TOP_K", "6"))
    CHAT_MAX_TOKENS = int(os.getenv("CHAT_MAX_TOKENS", "800"))
    CHAT_TEMPERATURE = float(os.getenv("CHAT_TEMPERATURE", "0.2"))
