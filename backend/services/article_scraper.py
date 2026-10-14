"""Fetch and parse the full AWS article page for a news item.

The RSS feed only gives a short summary. For the detail page and the richer
PDF we fetch the real article HTML from aws.amazon.com and extract:
  - hero image (if any)
  - ordered content blocks (headings + paragraphs + list items)
  - inline image URLs
  - the plain full text (for the LLM)

Results are cached (TTL) so repeat visits and PDF generation are instant.
If scraping fails or yields too little, we fall back to the RSS summary so
the UX is never broken.
"""

import logging
import re
import threading
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import requests

log = logging.getLogger(__name__)

_UA = "aws-news-dashboard/0.2 (+poc; article reader)"
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml"}

# Containers AWS tends to use for the main article body.
_MAIN_SELECTORS = [
    {"name": "main"},
    {"name": "article"},
    {"attrs": {"class": re.compile(r"(blog-post|aws-blog|lb-rtxt|main-content|content)")}},
    {"attrs": {"id": re.compile(r"(aws-page-content|main-content|content)")}},
]

_SKIP_IMG = re.compile(
    r"(sprite|icon|logo|avatar|pixel|tracking|1x1|spacer|badge|aws_logo)",
    re.I,
)


class ArticleScraper:
    def __init__(self, ttl_seconds: int = 3600, timeout: int = 12):
        self.ttl = ttl_seconds
        self.timeout = timeout
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._ts: Dict[str, float] = {}
        self._lock = threading.Lock()

    # ---------- cache ----------
    def _get_cached(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            ts = self._ts.get(key)
            if ts is None:
                return None
            if time.time() - ts > self.ttl:
                self._cache.pop(key, None)
                self._ts.pop(key, None)
                return None
            return self._cache.get(key)

    def _set_cached(self, key: str, value: Dict[str, Any]) -> None:
        with self._lock:
            self._cache[key] = value
            self._ts[key] = time.time()

    # ---------- public ----------
    def get_article(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Return a scraped article dict, falling back to the RSS summary."""
        url = item.get("link") or ""
        key = item.get("id") or url
        if not url:
            return self._fallback(item, reason="no link")

        cached = self._get_cached(key)
        if cached is not None:
            return cached

        try:
            result = self._scrape(url, item)
        except Exception as e:
            log.warning("article scrape failed id=%s err=%s", key, e)
            result = self._fallback(item, reason=str(e))

        self._set_cached(key, result)
        return result

    # ---------- scrape ----------
    def _scrape(self, url: str, item: Dict[str, Any]) -> Dict[str, Any]:
        from bs4 import BeautifulSoup  # lazy import

        resp = requests.get(url, headers=_HEADERS, timeout=self.timeout)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Drop noise
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()

        root = None
        for sel in _MAIN_SELECTORS:
            if "name" in sel:
                root = soup.find(sel["name"])
            else:
                root = soup.find(**sel)
            if root:
                break
        root = root or soup.body or soup

        blocks: List[Dict[str, str]] = []
        images: List[str] = []
        seen_text = set()

        for el in root.find_all(["h1", "h2", "h3", "h4", "p", "li", "img", "figure"]):
            if el.name == "img":
                src = self._img_src(el, url)
                if src and src not in images:
                    images.append(src)
                continue
            if el.name == "figure":
                img = el.find("img")
                if img:
                    src = self._img_src(img, url)
                    if src and src not in images:
                        images.append(src)
                continue
            text = el.get_text(" ", strip=True)
            if not text or len(text) < 2:
                continue
            # de-dupe repeated nav/boilerplate lines
            norm = text.lower()
            if norm in seen_text:
                continue
            seen_text.add(norm)
            kind = "heading" if el.name in ("h1", "h2", "h3", "h4") else (
                "list" if el.name == "li" else "paragraph"
            )
            blocks.append({"type": kind, "text": text})

        # Trim boilerplate-ish leading/trailing short blocks
        blocks = self._trim_blocks(blocks)

        # Hero: prefer og:image, else first good content image
        hero = self._og_image(soup, url)
        if not hero and images:
            hero = images[0]

        full_text = "\n".join(b["text"] for b in blocks)

        # Guardrail: if we got almost nothing, fall back
        if len(full_text) < 200 and not blocks:
            return self._fallback(item, reason="thin content")

        return {
            "id": item.get("id"),
            "title": item.get("title"),
            "link": url,
            "published": item.get("published"),
            "category": item.get("category"),
            "source": item.get("source"),
            "hero": hero,
            "blocks": blocks[:120],
            "images": images[:12],
            "full_text": full_text[:12000],
            "scraped": True,
            "char_count": len(full_text),
        }

    # ---------- helpers ----------
    def _img_src(self, img, base_url: str) -> Optional[str]:
        src = (
            img.get("src")
            or img.get("data-src")
            or (img.get("data-srcset") or img.get("srcset") or "").split(" ")[0]
        )
        if not src:
            return None
        src = src.strip()
        if src.startswith("data:"):
            return None
        if _SKIP_IMG.search(src):
            return None
        abs_url = urljoin(base_url, src)
        if not urlparse(abs_url).scheme.startswith("http"):
            return None
        # skip tiny declared sizes
        try:
            w = int(img.get("width") or 0)
            if 0 < w < 80:
                return None
        except Exception:
            pass
        return abs_url

    def _og_image(self, soup, base_url: str) -> Optional[str]:
        tag = soup.find("meta", attrs={"property": "og:image"}) or soup.find(
            "meta", attrs={"name": "og:image"}
        )
        if tag and tag.get("content"):
            return urljoin(base_url, tag["content"].strip())
        return None

    def _trim_blocks(self, blocks: List[Dict[str, str]]) -> List[Dict[str, str]]:
        # Drop common AWS boilerplate lines
        bad = re.compile(
            r"^(sign in|create an account|contact us|get started|learn more|"
            r"close|menu|skip to main content|aws re:post|follow us)\b",
            re.I,
        )
        return [b for b in blocks if not bad.match(b["text"])]

    # ---------- fallback ----------
    def _fallback(self, item: Dict[str, Any], reason: str = "") -> Dict[str, Any]:
        summary = (item.get("summary") or "").strip()
        blocks = [{"type": "paragraph", "text": summary}] if summary else []
        return {
            "id": item.get("id"),
            "title": item.get("title"),
            "link": item.get("link"),
            "published": item.get("published"),
            "category": item.get("category"),
            "source": item.get("source"),
            "hero": None,
            "blocks": blocks,
            "images": [],
            "full_text": summary,
            "scraped": False,
            "fallback_reason": reason,
            "char_count": len(summary),
        }
