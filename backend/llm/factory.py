import logging

from config import Config
from llm.base import LLMProvider
from llm.bedrock_provider import BedrockProvider
from llm.groq_provider import GroqProvider
from llm.mock_provider import MockProvider

log = logging.getLogger(__name__)


def build_provider() -> LLMProvider:
    provider = Config.LLM_PROVIDER.lower().strip()

    if provider == "bedrock":
        log.info("LLM provider = bedrock (%s)", Config.BEDROCK_CHAT_MODEL_ID)
        return BedrockProvider(
            region=Config.AWS_REGION,
            model_id=Config.BEDROCK_CHAT_MODEL_ID,
            max_tokens=Config.CHAT_MAX_TOKENS,
            temperature=Config.CHAT_TEMPERATURE,
        )

    # provider == "local"
    mode = Config.LOCAL_LLM_MODE.lower().strip()
    if mode == "groq":
        log.info("LLM provider = groq (%s)", Config.GROQ_MODEL)
        return GroqProvider(
            api_key=Config.GROQ_API_KEY,
            base_url=Config.GROQ_BASE_URL,
            model=Config.GROQ_MODEL,
            max_tokens=Config.CHAT_MAX_TOKENS,
            temperature=Config.CHAT_TEMPERATURE,
        )

    log.info("LLM provider = mock (offline, deterministic)")
    return MockProvider()
