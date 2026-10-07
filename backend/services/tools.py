"""Tool definitions + implementations for the agentic chat loop.

Tools are exposed to the LLM as OpenAI-compatible function schemas.
Implementations run locally against the in-memory feed — no external calls.

Results returned to the model are TRIMMED aggressively to fit inside
the free-tier token budget: short summaries, capped item counts.
"""

from typing import Any, Dict, List, Optional

from services.retrieval import retrieve


# ───────────────────────── Tool schemas (OpenAI format) ─────────────────────────

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_news",
            "description": (
                "Search recent AWS announcements using full-text keywords. "
                "Use this when the user mentions specific services, features, "
                "or acronyms (e.g. 'bedrock', 'ec2', 'snapstart')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Space-separated keywords to search for.",
                    },
                    "category": {
                        "type": "string",
                        "description": (
                            "Optional category filter. One of: AI/ML, Compute, "
                            "Database, Security, Storage, Networking, Analytics, "
                            "Dev Tools, Containers, Management, General."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 5, max 8).",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent",
            "description": (
                "Get the most recent AWS announcements, optionally filtered to "
                "a single category. Use for 'what's new this week' style questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Optional category to filter by.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 6, max 12).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_item_summary",
            "description": (
                "Fetch the full stored summary of one announcement by its id. "
                "Use after search_news or get_recent if an item's summary was "
                "truncated and you need more detail."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_id": {
                        "type": "string",
                        "description": "The 'id' field of a result from another tool.",
                    },
                },
                "required": ["item_id"],
            },
        },
    },
]


# ───────────────────────── Helpers ─────────────────────────

def _short(s: str, n: int) -> str:
    if not s:
        return ""
    s = s.strip()
    if len(s) <= n:
        return s
    return s[:n].rsplit(" ", 1)[0] + "…"


def _item_ref(it: Dict[str, Any], summary_len: int = 220) -> Dict[str, Any]:
    """Compact representation passed back to the model. Intentionally short."""
    return {
        "id": it.get("id"),
        "title": it.get("title"),
        "category": it.get("category"),
        "source": it.get("source"),
        "published": (it.get("published") or "")[:10],
        "summary": _short(it.get("summary") or "", summary_len),
    }


# ───────────────────────── Tool implementations ─────────────────────────

def tool_search_news(
    feed: List[Dict[str, Any]],
    query: str,
    category: Optional[str] = None,
    limit: int = 5,
) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 5), 8))
    pool = feed
    if category:
        cl = category.lower().strip()
        pool = [it for it in pool if (it.get("category") or "").lower() == cl]

    hits = retrieve(pool, query, top_k=limit, min_score=0.3)
    return {
        "count": len(hits),
        "items": [_item_ref(it) for it in hits],
    }


def tool_get_recent(
    feed: List[Dict[str, Any]],
    category: Optional[str] = None,
    limit: int = 6,
) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 6), 12))
    pool = feed
    if category:
        cl = category.lower().strip()
        pool = [it for it in pool if (it.get("category") or "").lower() == cl]
    top = pool[:limit]
    return {
        "count": len(top),
        "items": [_item_ref(it) for it in top],
    }


def tool_get_item_summary(
    feed: List[Dict[str, Any]],
    item_id: str,
) -> Dict[str, Any]:
    for it in feed:
        if it.get("id") == item_id:
            return {
                "found": True,
                "item": {
                    "id": it.get("id"),
                    "title": it.get("title"),
                    "category": it.get("category"),
                    "published": (it.get("published") or "")[:10],
                    "summary": it.get("summary") or "",
                },
            }
    return {"found": False, "item_id": item_id}


# ───────────────────────── Dispatcher ─────────────────────────

def execute_tool(
    name: str,
    args: Dict[str, Any],
    feed: List[Dict[str, Any]],
) -> Dict[str, Any]:
    try:
        if name == "search_news":
            return tool_search_news(
                feed,
                query=args.get("query", ""),
                category=args.get("category"),
                limit=args.get("limit", 5),
            )
        if name == "get_recent":
            return tool_get_recent(
                feed,
                category=args.get("category"),
                limit=args.get("limit", 6),
            )
        if name == "get_item_summary":
            return tool_get_item_summary(feed, item_id=args.get("item_id", ""))
        return {"error": f"Unknown tool: {name}"}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}