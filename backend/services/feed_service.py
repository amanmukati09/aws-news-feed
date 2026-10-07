import hashlib
import html
import logging
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import feedparser
import requests

from services.cache import TTLCache

log = logging.getLogger(__name__)


# ---------- source naming ----------
def source_name_for(url: str) -> str:
    u = url.lower()
    if "whats-new" in u:
        return "whats-new"
    if "machine-learning" in u:
        return "ml-blog"
    if "/compute" in u:
        return "compute-blog"
    if "/blogs/aws" in u:
        return "news-blog"
    return "other"


# ---------- category inference ----------
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "AI/ML": ["bedrock", "sagemaker", "machine learning", "generative", "llm",
              "nova", "claude", "anthropic", "foundation model"],
    "Compute": ["ec2", "lambda", "ecs", "eks", "fargate", "graviton",
                "outposts", "compute", "instance"],
    "Database": ["rds", "dynamodb", "aurora", "redshift", "elasticache",
                 "neptune", "documentdb", "database"],
    "Security": ["security", "iam", "kms", "guardduty", "shield", "waf",
                 "inspector", "macie", "secrets manager"],
    "Storage": ["s3 ", "efs", "fsx", "glacier", "backup", "storage"],
    "Networking": ["vpc", "route 53", "cloudfront", "api gateway",
                   "global accelerator", "elb", "networking"],
    "Analytics": ["athena", "glue", "emr", "kinesis", "quicksight",
                  "opensearch", "analytics"],
    "Dev Tools": ["codepipeline", "codebuild", "codedeploy", "codecommit", "devops"],
    "Containers": ["kubernetes", "container", "docker", "ecr"],
    "Management": ["cloudwatch", "cloudformation", "systems manager",
                   "control tower", "organizations"],
}


def infer_category(title: str, summary: str, tags: List[str], source: str) -> str:
    blob = f" {title} {summary} {' '.join(tags)} ".lower()
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if kw in blob:
                return cat
    return "General"


# ---------- text helpers ----------
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def clean_text(s: str, max_len: int = 400) -> str:
    if not s:
        return ""
    s = _TAG_RE.sub(" ", s)
    s = html.unescape(s)
    s = _WS_RE.sub(" ", s).strip()
    if len(s) > max_len:
        s = s[:max_len].rsplit(" ", 1)[0] + "…"
    return s


def stable_id(link: str) -> str:
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:16]


def parse_published(entry: Any) -> Optional[str]:
    for key in ("published_parsed", "updated_parsed"):
        v = entry.get(key)
        if v:
            try:
                dt = datetime(*v[:6], tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass
    return None


# ---------- service ----------
class FeedService:
    def __init__(self, feed_urls: List[str], cache_ttl_seconds: int):
        self.feed_urls = feed_urls
        self.cache = TTLCache(cache_ttl_seconds)
        self._lock = threading.Lock()
        self.last_successful_refresh: Optional[float] = None
        self.last_errors: List[str] = []

    # ---- fetch one ----
    def _fetch_one(self, url: str) -> List[Dict[str, Any]]:
        source = source_name_for(url)
        try:
            resp = requests.get(
                url, timeout=10,
                headers={"User-Agent": "aws-news-dashboard/0.1 (+local-poc)"},
            )
            resp.raise_for_status()
            parsed = feedparser.parse(resp.content)
        except Exception as e:
            log.warning("feed fetch failed url=%s err=%s", url, e)
            self.last_errors.append(f"{source}: {e}")
            return []

        items: List[Dict[str, Any]] = []
        for entry in parsed.entries:
            link = (entry.get("link") or "").strip()
            if not link:
                continue
            title = clean_text(entry.get("title", ""), 300)
            summary = clean_text(
                entry.get("summary") or entry.get("description") or "", 400
            )
            tags = [t.get("term", "") for t in entry.get("tags", []) if t.get("term")]
            category = infer_category(title, summary, tags, source)
            items.append({
                "id": stable_id(link),
                "title": title,
                "summary": summary,
                "link": link,
                "published": parse_published(entry),
                "category": category,
                "source": source,
                "tags": tags,
            })
        log.info("fetched %d items from %s", len(items), source)
        return items

    # ---- refresh all ----
    def refresh(self) -> Dict[str, Any]:
        with self._lock:
            self.last_errors = []
            all_items: List[Dict[str, Any]] = []
            for url in self.feed_urls:
                all_items.extend(self._fetch_one(url))

            seen = set()
            deduped: List[Dict[str, Any]] = []
            for it in all_items:
                if it["id"] in seen:
                    continue
                seen.add(it["id"])
                deduped.append(it)

            deduped.sort(key=lambda x: x["published"] or "", reverse=True)
            self.cache.set(deduped)
            if deduped:
                self.last_successful_refresh = time.time()
            log.info("refresh done: %d items, %d errors",
                     len(deduped), len(self.last_errors))
            return {"items": deduped, "errors": self.last_errors}

    def get_items(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        if not force_refresh:
            cached = self.cache.get()
            if cached is not None:
                return cached
        return self.refresh()["items"]

    # ---- query ----
    def query(
        self,
        category: Optional[str] = None,
        source: Optional[str] = None,
        from_: Optional[str] = None,
        to: Optional[str] = None,
        q: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        sort: Optional[str] = "newest",
    ) -> Dict[str, Any]:
        items = self.get_items()
        filtered = items

        if category:
            cats = {c.strip().lower() for c in category.split(",") if c.strip()}
            filtered = [i for i in filtered if i["category"].lower() in cats]
        if source:
            srcs = {s.strip().lower() for s in source.split(",") if s.strip()}
            filtered = [i for i in filtered if i["source"].lower() in srcs]
        if from_:
            filtered = [i for i in filtered if (i["published"] or "") >= from_]
        if to:
            filtered = [i for i in filtered if (i["published"] or "") <= to + "T23:59:59Z"]
        if q:
            ql = q.lower()
            filtered = [
                i for i in filtered
                if ql in i["title"].lower() or ql in i["summary"].lower()
            ]

        # sort
        if sort == "oldest":
            filtered = list(reversed(filtered))
        elif sort == "title_asc":
            filtered = sorted(filtered, key=lambda x: x["title"].lower())
        elif sort == "title_desc":
            filtered = sorted(filtered, key=lambda x: x["title"].lower(), reverse=True)
        # "newest" is default (already sorted newest-first at refresh)

        total = len(filtered)
        page = max(1, page)
        limit = max(1, min(limit, 100))
        start = (page - 1) * limit
        page_items = filtered[start:start + limit]

        cat_counts: Dict[str, int] = {}
        src_counts: Dict[str, int] = {}
        for i in items:
            cat_counts[i["category"]] = cat_counts.get(i["category"], 0) + 1
            src_counts[i["source"]] = src_counts.get(i["source"], 0) + 1

        return {
            "items": page_items,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if limit else 0,
            "categories": sorted(cat_counts.items(), key=lambda x: -x[1]),
            "sources": sorted(src_counts.keys()),
        }