from abc import ABC, abstractmethod
from typing import Any, Dict, List


class LLMProvider(ABC):
    """All AI providers sit behind this interface.

    The rest of the app (routes, retrieval) never imports a concrete provider.
    Switching providers = changing LLM_PROVIDER + env only.
    """

    name: str = "base"

    @abstractmethod
    def chat(
        self,
        question: str,
        context_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Return {"answer": str, "provider": str, "model": str}.

        context_items: list of {title, summary, link, published, category, source}
        """
        raise NotImplementedError

    def health(self) -> Dict[str, Any]:
        return {"provider": self.name}
