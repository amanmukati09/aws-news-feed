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
    {
        "type": "function",
        "function": {
            "name": "search_by_date",
            "description": (
                "Find announcements published in a date range (optionally also "
                "filtered by keywords/category). Use for time-scoped questions "
                "like 'December 2025 EC2 updates', 'security news last month', "
                "'announcements this week'. IMPORTANT: the dashboard only holds "
                "RECENT announcements (a rolling window of roughly the last two "
                "weeks). If the requested range is outside the available window, "
                "this returns out_of_range=true plus the real coverage window — "
                "in that case, tell the user you only have recent data and state "
                "the window; do NOT invent older announcements."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "from_date": {
                        "type": "string",
                        "description": "Start date inclusive, YYYY-MM-DD.",
                    },
                    "to_date": {
                        "type": "string",
                        "description": "End date inclusive, YYYY-MM-DD.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional keywords to further filter (service names, topics).",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 8, max 15).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_pdf_digest",
            "description": (
                "Generate a downloadable, colored PDF digest of several "
                "announcements with their summaries. Use when the user asks for "
                "a PDF / report / one-pager of multiple updates (e.g. 'PDF of the "
                "top 5 updates', 'export this week's Bedrock news as PDF'). "
                "Pick the items via query/category/recency. Returns a pdf_url the "
                "user can download; include that link in your answer."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "A short title for the digest, e.g. 'Top 5 AWS Updates'.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional keywords to select items (e.g. 'bedrock').",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter.",
                    },
                    "count": {
                        "type": "integer",
                        "description": "How many items to include (default 5, max 10).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_weekly_digest",
            "description": (
                "Generate a downloadable, branded WEEKLY digest PDF grouping the "
                "last N days of AWS announcements by category, with a category "
                "volume chart. Use for 'this week in AWS', 'weekly summary', "
                "'recap of the week'. Returns a pdf_url; include it in your answer."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "Window size in days (default 7)."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_comparison",
            "description": (
                "Generate a downloadable, branded side-by-side COMPARISON PDF of "
                "2-3 AWS announcements/services. Use when the user asks to compare "
                "things (e.g. 'compare GLM 5.3 and Claude Haiku 5.5'). Provide the "
                "items via 'queries' (one search phrase per item). Returns a pdf_url."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "queries": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "2-3 search phrases, one per item to compare.",
                    },
                    "item_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional explicit item ids (from prior tool results).",
                    },
                },
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


def _coverage(feed: List[Dict[str, Any]]):
    pubs = sorted((it.get("published") or "")[:10] for it in feed if it.get("published"))
    return (pubs[0] if pubs else None, pubs[-1] if pubs else None)


def tool_search_by_date(
    feed: List[Dict[str, Any]],
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    query: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 8,
) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 8), 15))
    oldest, newest = _coverage(feed)

    fd = (from_date or "")[:10]
    td = (to_date or "")[:10]

    # Does the requested window overlap what we actually have?
    out_of_range = False
    if oldest and newest and (fd or td):
        if (td and td < oldest) or (fd and fd > newest):
            out_of_range = True

    pool = feed
    if category:
        cl = category.lower().strip()
        pool = [it for it in pool if (it.get("category") or "").lower() == cl]
    if fd:
        pool = [it for it in pool if (it.get("published") or "")[:10] >= fd]
    if td:
        pool = [it for it in pool if (it.get("published") or "")[:10] <= td]
    if query:
        pool = retrieve(pool, query, top_k=limit, min_score=0.2)
    else:
        pool = sorted(pool, key=lambda x: x.get("published") or "", reverse=True)[:limit]

    return {
        "count": len(pool),
        "coverage": {"oldest": oldest, "newest": newest},
        "requested": {"from": fd or None, "to": td or None},
        "out_of_range": out_of_range,
        "items": [_item_ref(it) for it in pool],
    }


def tool_make_pdf_digest(
    feed: List[Dict[str, Any]],
    title: Optional[str] = None,
    query: Optional[str] = None,
    category: Optional[str] = None,
    count: int = 5,
    pdf_sink=None,
) -> Dict[str, Any]:
    count = max(1, min(int(count or 5), 10))
    pool = feed
    if category:
        cl = category.lower().strip()
        pool = [it for it in pool if (it.get("category") or "").lower() == cl]
    if query:
        hits = retrieve(pool, query, top_k=count, min_score=0.2)
    else:
        hits = sorted(pool, key=lambda x: x.get("published") or "", reverse=True)[:count]

    if not hits:
        return {"error": "no matching items to include in the PDF"}

    heading = title or (f"Top {len(hits)} AWS Updates" if not query else f"AWS Updates: {query}")
    if pdf_sink is None:
        return {"error": "pdf generation unavailable"}

    url, filename = pdf_sink(heading, hits)
    return {
        "ok": True,
        "pdf_url": url,
        "filename": filename,
        "title": heading,
        "count": len(hits),
        "items": [_item_ref(it, 120) for it in hits],
    }


def tool_make_weekly_digest(
    feed: List[Dict[str, Any]],
    days: int = 7,
    weekly_sink=None,
) -> Dict[str, Any]:
    days = max(1, min(int(days or 7), 31))
    oldest, newest = _coverage(feed)
    # window = last `days` relative to newest known publish date
    from datetime import datetime, timedelta
    try:
        end = datetime.fromisoformat((newest or "")[:10])
    except Exception:
        end = None
    if end is not None:
        start = (end - timedelta(days=days)).strftime("%Y-%m-%d")
        pool = [it for it in feed if (it.get("published") or "")[:10] >= start]
        window = f"{start} to {end.strftime('%Y-%m-%d')}"
    else:
        pool = feed
        window = "recent"
    pool = sorted(pool, key=lambda x: x.get("published") or "", reverse=True)
    if not pool:
        return {"error": "no items in the requested window", "coverage": {"oldest": oldest, "newest": newest}}
    if weekly_sink is None:
        return {"error": "pdf generation unavailable"}
    title = "This Week in AWS"
    url, filename = weekly_sink(title, pool, window)
    cats = {}
    for it in pool:
        cats[it.get("category") or "General"] = cats.get(it.get("category") or "General", 0) + 1
    return {
        "ok": True, "pdf_url": url, "filename": filename, "title": title,
        "window": window, "count": len(pool),
        "by_category": sorted(cats.items(), key=lambda x: -x[1]),
    }


def tool_make_comparison(
    feed: List[Dict[str, Any]],
    provider=None,
    queries: Optional[List[str]] = None,
    item_ids: Optional[List[str]] = None,
    comparison_sink=None,
) -> Dict[str, Any]:
    import json as _json
    import re as _re

    # Resolve the items to compare (by ids, else by searching each query).
    chosen: List[Dict[str, Any]] = []
    if item_ids:
        for iid in item_ids[:3]:
            m = next((it for it in feed if it.get("id") == iid), None)
            if m:
                chosen.append(m)
    if not chosen and queries:
        for q in queries[:3]:
            hits = retrieve(feed, q, top_k=1, min_score=0.1)
            if hits:
                chosen.append(hits[0])
    # de-dup
    seen = set(); uniq = []
    for it in chosen:
        if it.get("id") not in seen:
            seen.add(it.get("id")); uniq.append(it)
    chosen = uniq
    if len(chosen) < 2:
        return {"error": "need at least 2 distinct items to compare; refine the queries"}
    if comparison_sink is None or provider is None:
        return {"error": "comparison generation unavailable"}

    # Ask the model for comparison rows grounded in the chosen items.
    ctx = "\n\n".join(
        f"ITEM {i+1}: {it.get('title')}\nCategory: {it.get('category')}\n"
        f"Summary: {(it.get('summary') or '')[:500]}"
        for i, it in enumerate(chosen)
    )
    instr = (
        "Compare the AWS items below. Return STRICT JSON only:\n"
        '{"rows":[{"aspect":"<=4 words","values":["per item, <=14 words"]}],'
        '"verdict":"1-2 sentence recommendation"}\n'
        "Pick 4-6 meaningful aspects (e.g. Purpose, Best for, Key capability, "
        "Pricing/availability, Tradeoff). values length MUST equal the number of "
        "items. Ground ONLY in the provided text; use '—' if unknown.\n\n" + ctx
    )
    rows, verdict = [], ""
    try:
        ans = provider.chat(instr, chosen).get("answer", "")
        ans = _re.sub(r"^```(?:json)?|```$", "", ans.strip()).strip()
        s, e = ans.find("{"), ans.rfind("}")
        data = _json.loads(ans[s:e+1])
        for r in (data.get("rows") or [])[:7]:
            if isinstance(r, dict) and r.get("aspect"):
                vals = [str(v)[:120] for v in (r.get("values") or [])]
                rows.append({"aspect": str(r["aspect"])[:40], "values": vals})
        verdict = str(data.get("verdict") or "")[:300]
    except Exception as ex:
        # minimal deterministic fallback
        rows = [
            {"aspect": "Category", "values": [it.get("category") or "AWS" for it in chosen]},
            {"aspect": "Summary", "values": [(it.get("summary") or "")[:120] for it in chosen]},
        ]
    title = "AWS Comparison: " + " vs ".join((it.get("title") or "")[:28] for it in chosen)
    url, filename = comparison_sink(title[:90], chosen, rows, verdict)
    return {
        "ok": True, "pdf_url": url, "filename": filename, "title": title[:90],
        "items": [_item_ref(it, 100) for it in chosen],
        "aspects": [r["aspect"] for r in rows], "verdict": verdict,
    }


# ───────────────────────── Dispatcher ─────────────────────────

def execute_tool(
    name: str,
    args: Dict[str, Any],
    feed: List[Dict[str, Any]],
    pdf_sink=None,
    weekly_sink=None,
    comparison_sink=None,
    provider=None,
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
        if name == "search_by_date":
            return tool_search_by_date(
                feed,
                from_date=args.get("from_date"),
                to_date=args.get("to_date"),
                query=args.get("query"),
                category=args.get("category"),
                limit=args.get("limit", 8),
            )
        if name == "make_pdf_digest":
            return tool_make_pdf_digest(
                feed,
                title=args.get("title"),
                query=args.get("query"),
                category=args.get("category"),
                count=args.get("count", 5),
                pdf_sink=pdf_sink,
            )
        if name == "make_weekly_digest":
            return tool_make_weekly_digest(
                feed, days=args.get("days", 7), weekly_sink=weekly_sink,
            )
        if name == "make_comparison":
            return tool_make_comparison(
                feed, provider=provider,
                queries=args.get("queries"),
                item_ids=args.get("item_ids"),
                comparison_sink=comparison_sink,
            )
        return {"error": f"Unknown tool: {name}"}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}