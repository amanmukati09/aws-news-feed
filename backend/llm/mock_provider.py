from typing import Any, Dict, List

from llm.base import LLMProvider


class MockProvider(LLMProvider):
    """Deterministic, offline provider.

    Zero API keys, zero network. Returns a templated answer built purely
    from retrieved context. Useful for:
      - local dev with no secrets
      - CI tests
      - demo when the network is flaky
    """

    name = "mock"

    def __init__(self, model: str = "mock-deterministic"):
        self.model = model

    def chat(
        self,
        question: str,
        context_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not context_items:
            return {
                "answer": (
                    "I couldn't find recent AWS news about that. "
                    "Try a broader query like \"Bedrock\" or \"EC2\"."
                ),
                "provider": self.name,
                "model": self.model,
            }

        lines = [
            f"I found {len(context_items)} relevant AWS announcement"
            f"{'s' if len(context_items) != 1 else ''} for \"{question.strip()}\":",
            "",
        ]

        for i, it in enumerate(context_items, 1):
            title = it.get("title", "Untitled")
            summary = (it.get("summary") or "").strip()
            # Keep the mock answer readable — trim each summary
            if len(summary) > 180:
                summary = summary[:180].rsplit(" ", 1)[0] + "…"
            lines.append(f"{i}. {title} — {summary}")

        lines.append("")
        lines.append(
            "This is a deterministic mock response built only from the "
            "retrieved items above. Set LOCAL_LLM_MODE=groq (and provide "
            "GROQ_API_KEY) or LLM_PROVIDER=bedrock for a real model."
        )

        return {
            "answer": "\n".join(lines),
            "provider": self.name,
            "model": self.model,
        }
