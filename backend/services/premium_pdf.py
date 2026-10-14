"""Premium infographic / digest / chat PDF rendering.

Pipeline:
  1. Nova (Pro) distills the article into a rich, design-ready schema (v2):
     headline, subhead, overview, highlights[{icon,text}], stats[{value,label}],
     timeline[], quote, who_is_it_for, tags[].
  2. We render a polished one-pager via an HTML/CSS template (gradients, grid,
     SVG icons, embedded hero image) using WeasyPrint.
  3. If WeasyPrint is unavailable or errors, we fall back to the reportlab
     renderer in services.infographic so a PDF is always produced.

All text is model-generated and factual; the visual design is deterministic
HTML/CSS + crafted SVG (no AI image generation needed).
"""

import base64
import html
import json
import logging
import re
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)


# ───────────────────────── palette ─────────────────────────

CAT_HEX = {
    "AI/ML":      ("#8b5cf6", "#6d28d9"),
    "Compute":    ("#2563eb", "#1d4ed8"),
    "Database":   ("#0d9488", "#0f766e"),
    "Security":   ("#dc2626", "#b91c1c"),
    "Storage":    ("#d97706", "#b45309"),
    "Networking": ("#0891b2", "#0e7490"),
    "Analytics":  ("#4f46e5", "#4338ca"),
    "Containers": ("#0d9488", "#115e59"),
    "Management": ("#ea580c", "#c2410c"),
    "Dev Tools":  ("#475569", "#334155"),
    "General":    ("#1560a9", "#0f4a83"),
}


def _accent(cat: str):
    return CAT_HEX.get((cat or "").strip(), CAT_HEX["General"])


# ───────────────────────── SVG icon set (stroke, currentColor) ─────────────────────────

_ICONS = {
    "spark": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    "bolt": '<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "shield": '<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/>',
    "chip": '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3"/>',
    "db": '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    "cloud": '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19z"/>',
    "chart": '<path d="M3 3v18h18M7 15v3M12 10v8M17 6v12"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9z"/>',
    "rocket": '<path d="M5 15c-1 1-2 5-2 5s4-1 5-2M15 7a6 6 0 0 1 3 3M8.5 15.5 4 20M14 4c4 0 6 2 6 6-1 5-6 9-9 10l-3-3C9 14 9 9 14 4z"/>',
    "tag": '<path d="M20.6 13.4 12 4.8V2H4v8l8.6 8.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8z"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "users": '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M15 20a6 6 0 0 0-1-3"/>',
}


def _svg_icon(name: str, color: str = "currentColor", size: int = 18) -> str:
    body = _ICONS.get(name, _ICONS["check"])
    return (
        f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" fill="none" '
        f'stroke="{color}" stroke-width="2" stroke-linecap="round" '
        f'stroke-linejoin="round">{body}</svg>'
    )


_ICON_FOR_WORD = [
    (("secur", "iam", "encrypt", "complian", "guard"), "shield"),
    (("ec2", "compute", "instance", "graviton", "lambda", "serverless"), "chip"),
    (("database", "rds", "aurora", "dynamo", "sql", "redshift"), "db"),
    (("s3", "storage", "backup", "glacier"), "cloud"),
    (("price", "cost", "cheaper", "%", "save", "discount"), "chart"),
    (("region", "global", "availab", "worldwide"), "globe"),
    (("launch", "ga", "available", "introduc", "new"), "rocket"),
    (("fast", "speed", "latency", "performance", "accelerat"), "bolt"),
    (("time", "hour", "day", "week", "duration"), "clock"),
    (("customer", "user", "developer", "team", "audience"), "users"),
]


def _pick_icon(text: str) -> str:
    t = (text or "").lower()
    for words, icon in _ICON_FOR_WORD:
        if any(w in t for w in words):
            return icon
    return "spark"


# ───────────────────────── Nova Pro: rich schema v2 ─────────────────────────

_V2_INSTRUCTION = (
    "You are a senior technical content designer creating a PREMIUM one-page "
    "infographic brief from the AWS announcement in the CONTEXT (which may "
    "include the full article). Return STRICT JSON only — no markdown, no prose "
    "— with EXACTLY these keys:\n"
    "{\n"
    '  "headline": "punchy <= 7 word title",\n'
    '  "subhead": "one sentence, <= 18 words",\n'
    '  "overview": "2-3 sentence plain-language overview",\n'
    '  "highlights": [{"title":"<=5 word label","text":"<=16 word detail"}],  // 3-5\n'
    '  "stats": [{"value":"short","label":"<=4 word caption"}],  // 0-4, only REAL numbers\n'
    '  "timeline": ["<=10 word milestone or step"],  // 0-4, optional\n'
    '  "quote": "one punchy takeaway sentence (<=20 words)",\n'
    '  "who_is_it_for": "one sentence on the target audience",\n'
    '  "tags": ["<=2 word topic", ...]  // 3-6\n'
    "}\n"
    "Rules: base everything ONLY on the CONTEXT. Never invent numbers; if there "
    "are no real stats return []. Prefer concrete specifics (features, limits, "
    "pricing, regions, dates). Keep it crisp and skimmable."
)


def _s(v, n):
    return (str(v).strip()[:n]) if v is not None else ""


def generate_premium_content(item: Dict[str, Any], provider: Any,
                             article: Dict[str, Any] = None) -> Dict[str, Any]:
    """Return a normalized v2 content dict (never raises)."""
    from services.infographic import _extract_json, _fallback_content

    ctx_item = dict(item)
    if article and article.get("full_text"):
        ctx_item = {**item, "summary": (article.get("full_text") or "")[:8000]}

    data: Dict[str, Any] = {}
    try:
        result = provider.chat(_V2_INSTRUCTION, [ctx_item])
        data = _extract_json(result.get("answer", ""))
    except Exception as e:
        log.warning("premium content LLM/parse failed (%s) — fallback", e)
        fb = _fallback_content(item)
        data = {
            "headline": fb["headline"],
            "subhead": fb["subhead"],
            "overview": fb.get("deep_dive") or fb["subhead"],
            "highlights": [{"title": "", "text": p} for p in fb["key_points"]],
            "stats": [],
            "timeline": [],
            "quote": "",
            "who_is_it_for": fb["who_is_it_for"],
            "tags": [],
        }

    # normalize
    highlights: List[Dict[str, str]] = []
    for h in (data.get("highlights") or [])[:5]:
        if isinstance(h, dict) and (h.get("text") or h.get("title")):
            text = _s(h.get("text"), 140)
            highlights.append({
                "title": _s(h.get("title"), 48),
                "text": text,
                "icon": _pick_icon(f"{h.get('title','')} {text}"),
            })
        elif isinstance(h, str) and h.strip():
            highlights.append({"title": "", "text": _s(h, 140), "icon": _pick_icon(h)})

    stats = []
    for st in (data.get("stats") or [])[:4]:
        if isinstance(st, dict) and (st.get("value") or st.get("label")):
            stats.append({"value": _s(st.get("value"), 12), "label": _s(st.get("label"), 28)})

    timeline = [_s(t, 90) for t in (data.get("timeline") or [])[:4] if _s(t, 90)]
    tags = [_s(t, 24) for t in (data.get("tags") or [])[:6] if _s(t, 24)]

    cat = item.get("category") or "AWS"
    return {
        "headline": _s(data.get("headline"), 70) or (item.get("title") or "AWS Update")[:70],
        "subhead": _s(data.get("subhead"), 180),
        "overview": _s(data.get("overview"), 600),
        "highlights": highlights or [{"title": "", "text": (item.get("summary") or "")[:140], "icon": "spark"}],
        "stats": stats,
        "timeline": timeline,
        "quote": _s(data.get("quote"), 200),
        "who_is_it_for": _s(data.get("who_is_it_for"), 180),
        "tags": tags,
        "category": cat,
        "image_url": (article or {}).get("hero") or ((article or {}).get("images") or [None])[0],
    }


# ───────────────────────── image embedding ─────────────────────────

def _data_uri(url: str, timeout: int = 8) -> Optional[str]:
    if not url:
        return None
    try:
        import requests
        r = requests.get(url, timeout=timeout,
                         headers={"User-Agent": "aws-news-dashboard/0.3"})
        r.raise_for_status()
        ctype = r.headers.get("Content-Type", "image/jpeg").split(";")[0]
        if "image" not in ctype:
            return None
        b64 = base64.b64encode(r.content).decode("ascii")
        return f"data:{ctype};base64,{b64}"
    except Exception as e:
        log.info("premium image skipped (%s)", e)
        return None


# ───────────────────────── HTML template ─────────────────────────

def _esc(s: str) -> str:
    return html.escape(s or "")


_BASE_CSS = """
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter','Helvetica Neue',Arial,sans-serif; color: #14181f; }
.page { width: 210mm; background: #ffffff; }

/* ---- HERO (table-based, no absolute/flex) ---- */
.hero { background: linear-gradient(135deg, {c1} 0%, {c2} 62%, #0b1120 100%);
  color:#fff; padding: 16mm 16mm 9mm; }
.hero-strip { height:3mm; background: linear-gradient(90deg,#ff9900,#ff6a00); }
.brandtbl { width:100%; border-collapse:collapse; margin-bottom:9mm; }
.brandtbl td { font-size:10px; letter-spacing:1.2px; text-transform:uppercase; vertical-align:middle; }
.brand-left { color:#ffffff; opacity:.92; }
.brand-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff9900; }
.brand-right { text-align:right; }
.logo-txt { font-weight:800; font-size:12px; letter-spacing:.3px; color:#fff; vertical-align:middle; }
.pill { display:inline-block; background:rgba(255,255,255,.18);
  border:1px solid rgba(255,255,255,.35); padding:4px 12px; border-radius:999px; font-size:10px;
  font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:#fff; }
.headline { font-size:30px; font-weight:800; line-height:1.1; letter-spacing:-0.4px; margin:9px 0 7px; }
.subhead { font-size:13px; opacity:.92; line-height:1.45; }
.meta { margin-top:7mm; font-size:10px; opacity:.82; }

/* full-width hero image band (never clipped) */
.hero-imgwrap { line-height:0; }
.hero-img { display:block; width:100%; height:46mm; object-fit:cover; }

/* ---- BODY ---- */
.body { padding: 8mm 16mm 10mm; }
.sectitle { font-size:12px; font-weight:800; color:{c2}; text-transform:uppercase;
  letter-spacing:1px; margin: 7mm 0 3mm; padding-left:9px; border-left:4px solid #ff9900; line-height:1.3; }
.overview { font-size:12.5px; line-height:1.6; color:#2b323c; }

/* stats as a fixed table of equal columns */
.stats { width:100%; border-collapse:separate; border-spacing:7px 0; margin-top:5mm; table-layout:fixed; }
.stat { background:#f3f6fb; border:1px solid #e5e9f0; border-radius:12px; padding:9px 6px; text-align:center; }
.stat .v { font-size:21px; font-weight:800; color:{c2}; line-height:1.1; }
.stat .l { font-size:8.5px; color:#6b7280; margin-top:3px; text-transform:uppercase; letter-spacing:.4px; }

/* highlight cards as a 2-col table; each card is an inner icon|text table */
.cardgrid { width:100%; border-collapse:separate; border-spacing:7px; table-layout:fixed; margin-top:2mm; }
.cardcell { width:50%; vertical-align:top; }
.card { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e6eaf0;
  border-left:4px solid {c1}; border-radius:10px; }
.card td { padding:9px 8px; vertical-align:top; }
.card .ic-td { width:38px; }
.ic-badge { width:30px; height:30px; border-radius:8px; background:{c1}; text-align:center;
  line-height:30px; }
.ic-badge svg { vertical-align:middle; }
.card .t { font-size:11.5px; font-weight:700; color:#1f2733; }
.card .d { font-size:10.5px; color:#5b6472; line-height:1.4; margin-top:2px; }

/* timeline as table rows */
.tl { width:100%; border-collapse:collapse; margin:1mm 0; }
.tl td { padding:3px 0; vertical-align:top; }
.tl .dot-td { width:16px; }
.tl .dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:{c1}; margin-top:3px; }
.tl .txt { font-size:11px; color:#333b47; line-height:1.4; }

.quote { margin-top:6mm; background:#fff7ec; border:1px solid rgba(255,153,0,.35);
  border-radius:12px; padding:11px 14px; font-size:13px; font-style:italic; color:#7a4b00; }

.who { width:100%; border-collapse:collapse; margin-top:5mm; background:#f1f5fb; border-radius:12px; }
.who td { padding:10px 12px; vertical-align:middle; }
.who .ic-td { width:40px; }
.who .l { font-size:9px; text-transform:uppercase; letter-spacing:.6px; color:#8a94a3; font-weight:700; }
.who .t { font-size:11.5px; color:#2b323c; margin-top:1px; }

.tags { margin-top:5mm; }
.tagc { display:inline-block; font-size:9.5px; font-weight:600; color:{c2}; background:#eaf1fa;
  border:1px solid #d4e2f3; border-radius:999px; padding:3px 10px; margin:0 4px 4px 0; }

.footer { width:100%; border-collapse:collapse; border-top:2px solid #ff9900; margin-top:7mm; }
.footer td { padding-top:6px; font-size:8.5px; color:#8a94a3; vertical-align:middle; }
.footer .right { text-align:right; }
.footer a { color:#1560a9; text-decoration:none; }
"""


def _render_infographic_html(item, content):
    c1, c2 = _accent(content.get("category"))
    css = _BASE_CSS.replace("{c1}", c1).replace("{c2}", c2)

    hero_img = ""
    uri = _data_uri(content.get("image_url"))
    if uri:
        hero_img = f'<div class="hero-imgwrap"><img class="hero-img" src="{uri}" alt=""/></div>'

    stats_html = ""
    if content["stats"]:
        cells = "".join(
            f'<td class="stat"><div class="v">{_esc(s["value"])}</div>'
            f'<div class="l">{_esc(s["label"])}</div></td>'
            for s in content["stats"]
        )
        stats_html = f'<table class="stats"><tr>{cells}</tr></table>'

    # highlight cards: 2 per row in an outer table; each card an inner icon|text table
    hl = content["highlights"]
    card_cells = []
    for h in hl:
        card_cells.append(
            '<td class="cardcell"><table class="card"><tr>'
            f'<td class="ic-td"><div class="ic-badge">{_svg_icon(h["icon"], "#fff", 16)}</div></td>'
            f'<td><div class="t">{_esc(h["title"]) or "Highlight"}</div>'
            f'<div class="d">{_esc(h["text"])}</div></td>'
            '</tr></table></td>'
        )
    card_rows = ""
    for i in range(0, len(card_cells), 2):
        pair = card_cells[i:i+2]
        if len(pair) == 1:
            pair.append('<td class="cardcell"></td>')
        card_rows += "<tr>" + "".join(pair) + "</tr>"
    cards_html = f'<table class="cardgrid">{card_rows}</table>' if card_cells else ""

    timeline_html = ""
    if content["timeline"]:
        rows = "".join(
            f'<tr><td class="dot-td"><span class="dot"></span></td>'
            f'<td class="txt">{_esc(t)}</td></tr>'
            for t in content["timeline"]
        )
        timeline_html = (
            f'<div class="sectitle">Timeline</div>'
            f'<table class="tl">{rows}</table>'
        )

    quote_html = f'<div class="quote">\u201c{_esc(content["quote"])}\u201d</div>' if content.get("quote") else ""

    who_html = ""
    if content.get("who_is_it_for"):
        who_html = (
            '<table class="who"><tr>'
            f'<td class="ic-td">{_svg_icon("users", c2, 24)}</td>'
            '<td><div class="l">Who it&#39;s for</div>'
            f'<div class="t">{_esc(content["who_is_it_for"])}</div></td>'
            '</tr></table>'
        )

    tags_html = ""
    if content.get("tags"):
        chips = "".join(f'<span class="tagc">#{_esc(t)}</span>' for t in content["tags"])
        tags_html = f'<div class="tags">{chips}</div>'

    link = item.get("link", "")
    date = (item.get("published") or "")[:10]
    src = item.get("source", "aws")

    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="page">
  <div class="hero">
    <table class="brandtbl"><tr>
      <td class="brand-left"><span class="brand-dot"></span> &nbsp;AWS News · Intelligence Brief</td>
      <td class="brand-right">{_svg_icon("cloud","#ff9900",16)} <span class="logo-txt">AWS News</span></td>
    </tr></table>
    <span class="pill">{_esc(content["category"])}</span>
    <div class="headline">{_esc(content["headline"])}</div>
    <div class="subhead">{_esc(content["subhead"])}</div>
    <div class="meta">{_esc(src)} &middot; {_esc(date)}</div>
  </div>
  <div class="hero-strip"></div>
  {hero_img}
  <div class="body">
    <div class="sectitle">Overview</div>
    <div class="overview">{_esc(content["overview"])}</div>
    {stats_html}
    <div class="sectitle">Key highlights</div>
    {cards_html}
    {timeline_html}
    {quote_html}
    {who_html}
    {tags_html}
    <table class="footer"><tr>
      <td>AWS News · AI-assisted intelligence brief</td>
      <td class="right"><a href="{_esc(link)}">{_esc(link[:60])}</a></td>
    </tr></table>
  </div>
</div></body></html>"""


# ───────────────────────── WeasyPrint render + fallback ─────────────────────────

def _html_to_pdf(html_str: str) -> bytes:
    from weasyprint import HTML
    return HTML(string=html_str).write_pdf()


def render_premium_infographic(item, content) -> bytes:
    """Render premium HTML->PDF; raise if weasyprint unavailable (caller falls back)."""
    html_str = _render_infographic_html(item, content)
    return _html_to_pdf(html_str)


# ───────────────────────── Premium digest (multi-item) ─────────────────────────

_DIGEST_CSS = """
@page { size: A4; margin: 0; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:#14181f; }
.page { width:210mm; }
.cover { padding:16mm 16mm 11mm; color:#fff;
  background:linear-gradient(135deg,#0f4a83 0%,#17213d 60%,#0b1120 100%); }
.cover-strip { height:3mm; background:linear-gradient(90deg,#ff9900,#ff6a00); }
.brandrow { font-size:10px; letter-spacing:2px; text-transform:uppercase; opacity:.88; margin-bottom:7mm; }
.ctitle { font-size:27px; font-weight:800; line-height:1.12; letter-spacing:-0.3px; }
.csub { font-size:11px; opacity:.85; margin-top:6px; }
.list { padding:8mm 16mm 10mm; }
.item { width:100%; border-collapse:collapse; border:1px solid #e6eaf0; border-left:5px solid {c};
  border-radius:12px; margin-bottom:8px; page-break-inside:avoid; }
.item td { padding:11px 10px; vertical-align:top; }
.num-td { width:40px; }
.num { width:26px; height:26px; border-radius:50%; color:#fff; font-weight:800; font-size:12px;
  text-align:center; line-height:26px; background:{c}; }
.it-pill { display:inline-block; font-size:8px; font-weight:700; letter-spacing:.5px; text-transform:uppercase;
  color:#fff; background:{c}; border-radius:999px; padding:2px 8px; }
.it-date { font-size:9px; color:#8a94a3; }
.it-title { font-size:12.5px; font-weight:700; color:#1560a9; margin-top:4px; }
.it-sum { font-size:10.5px; color:#5b6472; line-height:1.45; margin-top:3px; }
.foot { width:100%; border-collapse:collapse; border-top:2px solid #ff9900; margin:2mm 16mm 0;
  width:auto; }
.foot td { padding-top:6px; font-size:8.5px; color:#8a94a3; }
"""


def _render_digest_html(title, items):
    rows = ""
    for i, it in enumerate(items, 1):
        c1, _ = _accent(it.get("category"))
        rows += (
            f'<table class="item" style="border-left-color:{c1}"><tr>'
            f'<td class="num-td"><div class="num" style="background:{c1}">{i}</div></td>'
            f'<td><span class="it-pill" style="background:{c1}">{_esc(it.get("category") or "AWS")}</span> '
            f'<span class="it-date">{_esc((it.get("published") or "")[:10])}</span>'
            f'<div class="it-title">{_esc(it.get("title") or "")}</div>'
            f'<div class="it-sum">{_esc((it.get("summary") or "")[:320])}</div></td>'
            f'</tr></table>'
        )
    from datetime import datetime, timezone
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    css = _DIGEST_CSS.replace("{c}", "#1560a9")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="page">
  <div class="cover">
    <div class="brandrow">AWS News &middot; Digest</div>
    <div class="ctitle">{_esc(title or "AWS Updates")}</div>
    <div class="csub">{len(items)} announcements &middot; generated {stamp}</div>
  </div>
  <div class="cover-strip"></div>
  <div class="list">{rows}
    <table class="foot"><tr><td>AWS News &middot; AI-assisted digest</td></tr></table>
  </div>
</div></body></html>"""


def render_premium_digest(title, items) -> bytes:
    return _html_to_pdf(_render_digest_html(title, items))


# ───────────────────────── Premium chat answer ─────────────────────────

_CHAT_CSS = """
@page { size:A4; margin:0; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:#14181f; }
.page { width:210mm; }
.top { padding:16mm 16mm 9mm; color:#fff;
  background:linear-gradient(135deg,#0f4a83,#17213d 70%,#0b1120); }
.top-strip { height:3mm; background:linear-gradient(90deg,#ff9900,#ff6a00); }
.brandrow { font-size:10px; letter-spacing:2px; text-transform:uppercase; opacity:.88; }
.ttitle { font-size:21px; font-weight:800; margin-top:7mm; letter-spacing:-0.3px; }
.body { padding:8mm 16mm 10mm; }
.qbox { background:#eef3fb; border-left:5px solid #1560a9; border-radius:10px; padding:11px 14px; }
.qlabel { font-size:9px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:#1560a9; }
.qtext { font-size:13px; font-weight:700; color:#1f2733; margin-top:3px; }
.alabel { font-size:12px; font-weight:800; color:#b45309;
  text-transform:uppercase; letter-spacing:1px; margin:7mm 0 3mm;
  padding-left:9px; border-left:4px solid #ff9900; line-height:1.3; }
.answer { font-size:12px; line-height:1.6; color:#2b323c; }
.answer h1,.answer h2,.answer h3 { color:#0f4a83; margin:9px 0 4px; font-size:14px; }
.answer ul,.answer ol { margin:5px 0 7px 18px; }
.answer li { margin:3px 0; }
.answer strong { color:#0f4a83; }
.answer a { color:#1560a9; }
.src { margin-top:7mm; }
.src h4 { font-size:11px; color:#0f4a83; margin-bottom:4px; }
.src a { display:block; font-size:9.5px; color:#1560a9; margin:2px 0; text-decoration:none; }
.foot { padding-top:6px; border-top:2px solid #ff9900; margin:6mm 16mm 0; font-size:8.5px; color:#8a94a3; }
"""


def _md_to_html(md: str) -> str:
    """Minimal, safe markdown -> HTML for the answer body."""
    out = []
    in_ul = False
    for raw in (md or "").split("\n"):
        line = raw.rstrip()
        s = _esc(line.strip())
        # inline
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        if not line.strip():
            if in_ul:
                out.append("</ul>"); in_ul = False
            continue
        if re.match(r"^#{1,3}\s", line.strip()):
            if in_ul:
                out.append("</ul>"); in_ul = False
            heading = re.sub(r"^#+\s*", "", s)
            out.append("<h3>" + heading + "</h3>")
        elif re.match(r"^[-*]\s", line.strip()):
            if not in_ul:
                out.append("<ul>"); in_ul = True
            litext = re.sub(r"^[-*]\s*", "", s)
            out.append("<li>" + litext + "</li>")
        else:
            if in_ul:
                out.append("</ul>"); in_ul = False
            out.append(f"<p>{s}</p>")
    if in_ul:
        out.append("</ul>")
    return "".join(out)


def render_premium_chat(question, answer_md, sources=None, provider_name="AI") -> bytes:
    sources = sources or []
    body = _md_to_html(answer_md)
    src_html = ""
    if sources:
        links = "".join(
            f'<a href="{_esc(s.get("link",""))}">{_esc(s.get("title",""))}</a>'
            for s in sources[:10]
        )
        src_html = f'<div class="src"><h4>Sources</h4>{links}</div>'
    html_str = f"""<!doctype html><html><head><meta charset="utf-8"><style>{_CHAT_CSS}</style></head>
<body><div class="page">
  <div class="top">
    <div class="brandrow">AWS News &middot; AI Answer</div>
    <div class="ttitle">AI Assistant Response</div>
  </div>
  <div class="top-strip"></div>
  <div class="body">
    <div class="qbox"><div class="qlabel">Question</div><div class="qtext">{_esc(question)}</div></div>
    <div class="alabel">Answer</div>
    <div class="answer">{body}</div>
    {src_html}
    <div class="foot">AWS News &middot; AI assistant ({_esc(provider_name)})</div>
  </div>
</div></body></html>"""
    return _html_to_pdf(html_str)
