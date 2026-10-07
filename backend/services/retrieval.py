"""Lexical BM25-style retrieval over the cached AWS news items.

No embeddings, no vector store. BM25 gives us solid relevance for
short announcement titles + summaries and is fast enough to run
per-request in pure Python.
"""

import math
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOP = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "in", "is", "it", "its", "of", "on", "or", "that", "the",
    "this", "to", "was", "were", "will", "with", "you", "your", "we", "our",
    "i", "me", "my", "what", "whats", "which", "who", "how", "when", "where",
    "new", "s", "t",
}


def tokenize(text: str) -> List[str]:
    if not text:
        return []
    tokens = _TOKEN_RE.findall(text.lower())
    return [t for t in tokens if t not in _STOP and len(t) > 1]


def _doc_text(item: Dict[str, Any]) -> str:
    # title is more signal-dense than summary — weight via repetition
    return " ".join([
        item.get("title", ""),
        item.get("title", ""),
        item.get("summary", ""),
        " ".join(item.get("tags", []) or []),
        item.get("category", ""),
    ])


class BM25Index:
    """Standard BM25 (k1=1.5, b=0.75) over a small in-memory corpus."""

    def __init__(self, items: List[Dict[str, Any]], k1: float = 1.5, b: float = 0.75):
        self.items = items
        self.k1 = k1
        self.b = b
        self.N = len(items)
        self.doc_tokens: List[Counter] = []
        self.doc_len: List[int] = []
        df: Counter = Counter()

        for it in items:
            toks = tokenize(_doc_text(it))
            c = Counter(toks)
            self.doc_tokens.append(c)
            self.doc_len.append(len(toks))
            for term in c.keys():
                df[term] += 1

        self.df = df
        self.avgdl = (sum(self.doc_len) / self.N) if self.N else 0.0

    def _idf(self, term: str) -> float:
        n = self.df.get(term, 0)
        if n == 0:
            return 0.0
        # BM25+ style IDF (always positive)
        return math.log((self.N - n + 0.5) / (n + 0.5) + 1.0)

    def search(self, query: str, top_k: int = 6) -> List[Tuple[Dict[str, Any], float]]:
        q_terms = tokenize(query)
        if not q_terms or self.N == 0:
            return []

        scores: List[Tuple[int, float]] = []
        for idx, tokens in enumerate(self.doc_tokens):
            dl = self.doc_len[idx] or 1
            s = 0.0
            for term in q_terms:
                tf = tokens.get(term, 0)
                if not tf:
                    continue
                idf = self._idf(term)
                if idf <= 0:
                    continue
                denom = tf + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1))
                s += idf * (tf * (self.k1 + 1)) / denom
            if s > 0:
                scores.append((idx, s))

        scores.sort(key=lambda x: -x[1])
        return [(self.items[i], s) for i, s in scores[:top_k]]


def retrieve(
    items: List[Dict[str, Any]],
    question: str,
    top_k: int = 6,
    min_score: float = 0.5,
) -> List[Dict[str, Any]]:
    """Return the top_k most relevant items above min_score."""
    if not items or not question:
        return []
    index = BM25Index(items)
    hits = index.search(question, top_k=top_k)
    return [it for it, score in hits if score >= min_score]
