import json as _json
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

    # ---------- streaming (simple, no tools) ----------
    def chat_stream(
        self,
        question: str,
        context_items: List[Dict[str, Any]],
        history: List[Dict[str, Any]] = None,
    ):
        result = self.chat(question, context_items)
        # Emit the templated answer as a few token chunks.
        for chunk in result["answer"].split("\n"):
            yield {"type": "token", "text": chunk + "\n"}
        yield {"type": "finish", "reason": "stop"}

    # ---------- streaming (agentic, tool-aware) ----------
    def chat_stream_agentic(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
    ):
        """Deterministic 2-phase agent emulation.

        Round 1 (no tool results in history yet): emit one search_news
        tool_call derived from the latest user question so the agent loop
        exercises the real search path over the feed.
        Round 2 (tool results present): emit a short grounded answer built
        from whatever tool results were appended to the conversation.
        """
        has_tool_result = any(m.get("role") == "tool" for m in messages)

        # latest user question
        question = ""
        for m in reversed(messages):
            if m.get("role") == "user" and m.get("content"):
                question = m["content"]
                break

        if not has_tool_result:
            # keep only meaningful keywords for the search
            words = [w for w in question.split() if len(w) > 3][:6]
            query = " ".join(words) or question[:60]
            yield {
                "type": "tool_call",
                "tool": {
                    "id": "mock_call_1",
                    "name": "search_news",
                    "arguments": {"query": query, "limit": 5},
                },
            }
            yield {"type": "finish", "reason": "tool_calls"}
            return

        # Round 2 — summarize the tool results we were given.
        titles: List[str] = []
        for m in messages:
            if m.get("role") == "tool" and m.get("content"):
                try:
                    data = _json.loads(m["content"])
                except Exception:
                    continue
                for it in (data.get("items") or []):
                    if it.get("title"):
                        titles.append(it["title"])
                one = data.get("item")
                if isinstance(one, dict) and one.get("title"):
                    titles.append(one["title"])

        if titles:
            yield {"type": "token", "text": f"Here are {len(titles)} relevant AWS updates:\n\n"}
            for i, t in enumerate(titles[:6], 1):
                yield {"type": "token", "text": f"{i}. {t} [{i}]\n"}
            yield {
                "type": "token",
                "text": (
                    "\n_(Deterministic mock answer built from tool results. "
                    "Set LLM_PROVIDER=bedrock or LOCAL_LLM_MODE=groq for a real model.)_"
                ),
            }
        else:
            yield {
                "type": "token",
                "text": "I couldn't find recent AWS news matching that. Try a broader query.",
            }
        yield {"type": "finish", "reason": "stop"}
