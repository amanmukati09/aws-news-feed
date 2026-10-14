"""One-pager infographic generation for a single AWS news item.

Flow:
  1. Ask the active LLM provider to distill the item into structured
     infographic content (headline, summary line, key points, stats,
     audience, category tag) as strict JSON.
  2. Render that structure into a clean, branded one-page PDF using
     reportlab (pure-python, no system deps).

Provider-agnostic: uses provider.chat(). Works with mock / groq / bedrock.
If the LLM output can't be parsed, we fall back to a deterministic
structure built from the item itself, so the download never fails.
"""

import io
import json
import logging
import re
from typing import Any, Dict, List

log = logging.getLogger(__name__)

_INFOGRAPHIC_INSTRUCTION = (
    "You are a technical content designer. Turn the AWS announcement in the "
    "CONTEXT (which may include the full article text) into infographic "
    "content for a one-page handout. "
    "Return STRICT JSON only (no markdown, no prose) with EXACTLY these keys:\n"
    '{\n'
    '  "headline": "punchy <= 8 word title",\n'
    '  "subhead": "one sentence, <= 20 words, what it is",\n'
    '  "key_points": ["4 to 6 short bullet strings, <= 14 words each"],\n'
    '  "stats": [{"label": "short label", "value": "short value"}],\n'
    '  "deep_dive": "2-3 sentence paragraph with the most important specifics",\n'
    '  "who_is_it_for": "one short sentence on the target audience",\n'
    '  "category": "one or two word category tag"\n'
    '}\n'
    "Rules: base everything ONLY on the CONTEXT. Do not invent numbers; if "
    "there are no real stats, return an empty stats array. Prefer concrete "
    "specifics (features, limits, pricing, regions, dates) from the article."
)


def _extract_json(text: str) -> Dict[str, Any]:
    """Best-effort parse of a JSON object out of an LLM response."""
    if not text:
        raise ValueError("empty")
    # Strip code fences if present
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    # Grab the outermost {...}
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no json object found")
    return json.loads(text[start:end + 1])


def _fallback_content(item: Dict[str, Any]) -> Dict[str, Any]:
    title = item.get("title") or "AWS Update"
    summary = (item.get("summary") or "").strip()
    # naive bullet split from the summary
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", summary) if s.strip()]
    points = sentences[:4] if sentences else [summary[:120]] if summary else []
    return {
        "headline": title[:60],
        "subhead": (sentences[0] if sentences else summary)[:140],
        "key_points": [p[:90] for p in points],
        "stats": [],
        "deep_dive": " ".join(sentences[:3])[:400],
        "who_is_it_for": "AWS builders and architects tracking this service.",
        "category": item.get("category") or "AWS",
    }


def generate_infographic_content(
    item: Dict[str, Any],
    provider: Any,
    article: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """Return a normalized infographic content dict (never raises).

    If `article` (scraped) is provided, the LLM grounds on the FULL article
    text and an image is selected for the PDF; otherwise it uses the RSS
    summary only.
    """
    # Build the context the LLM sees — prefer full scraped text.
    ctx_item = dict(item)
    if article and article.get("full_text"):
        ctx_item = {
            **item,
            "summary": (article.get("full_text") or item.get("summary") or "")[:8000],
        }

    try:
        result = provider.chat(_INFOGRAPHIC_INSTRUCTION, [ctx_item])
        data = _extract_json(result.get("answer", ""))
    except Exception as e:
        log.warning("infographic LLM/parse failed (%s) — using fallback", e)
        data = _fallback_content(item)

    # Normalize / guard every field
    def _s(v, n):
        return (str(v).strip()[:n]) if v is not None else ""

    key_points: List[str] = []
    for p in (data.get("key_points") or [])[:6]:
        if isinstance(p, str) and p.strip():
            key_points.append(p.strip()[:140])

    stats: List[Dict[str, str]] = []
    for st in (data.get("stats") or [])[:4]:
        if isinstance(st, dict) and (st.get("value") or st.get("label")):
            stats.append({
                "label": _s(st.get("label"), 24),
                "value": _s(st.get("value"), 18),
            })

    # pick an image for the PDF (hero preferred)
    image_url = None
    if article:
        image_url = article.get("hero") or (article.get("images") or [None])[0]

    content = {
        "headline": _s(data.get("headline"), 70) or (item.get("title") or "AWS Update")[:70],
        "subhead": _s(data.get("subhead"), 180),
        "key_points": key_points or _fallback_content(item)["key_points"],
        "stats": stats,
        "deep_dive": _s(data.get("deep_dive"), 500),
        "who_is_it_for": _s(data.get("who_is_it_for"), 160),
        "category": _s(data.get("category"), 24) or (item.get("category") or "AWS"),
        "image_url": image_url,
    }
    return content


def _fetch_image_reader(url: str, timeout: int = 8):
    """Download an image and return a reportlab ImageReader, or None on failure."""
    if not url:
        return None
    try:
        import requests
        from reportlab.lib.utils import ImageReader

        resp = requests.get(
            url, timeout=timeout,
            headers={"User-Agent": "aws-news-dashboard/0.2 (+poc)"},
        )
        resp.raise_for_status()
        ctype = resp.headers.get("Content-Type", "")
        if "image" not in ctype:
            return None
        bio = io.BytesIO(resp.content)
        reader = ImageReader(bio)
        reader.getSize()  # validate it decodes
        return reader
    except Exception as e:
        log.info("infographic image fetch skipped (%s): %s", e, url)
        return None


# ─────────────────────────── PDF rendering ───────────────────────────

AWS_ORANGE = (1.0, 0.6, 0.0)        # #FF9900
AWS_NAVY = (0.09, 0.13, 0.24)       # #17213D
LIGHT = (0.96, 0.97, 0.99)
MID = (0.42, 0.45, 0.52)
BRAND = (0.08, 0.29, 0.51)          # #0f4a83
BRAND_SOFT = (0.90, 0.95, 1.0)      # pale blue
ORANGE_SOFT = (1.0, 0.95, 0.86)     # pale orange
INK = (0.12, 0.15, 0.20)

# Category -> accent RGB for the header band + pills
_CAT_COLORS = {
    "AI/ML":      (0.55, 0.36, 0.96),
    "Compute":    (0.15, 0.47, 0.86),
    "Database":   (0.06, 0.60, 0.46),
    "Security":   (0.86, 0.24, 0.24),
    "Storage":    (0.90, 0.62, 0.07),
    "Networking": (0.05, 0.65, 0.78),
    "Analytics":  (0.37, 0.36, 0.90),
    "Containers": (0.08, 0.57, 0.53),
    "Management": (0.95, 0.45, 0.10),
    "Dev Tools":  (0.36, 0.40, 0.52),
    "General":    (0.09, 0.13, 0.24),
}


def _accent_for(category: str):
    return _CAT_COLORS.get((category or "").strip(), BRAND)


def render_infographic_pdf(item: Dict[str, Any], content: Dict[str, Any]) -> bytes:
    """Render a one-page infographic PDF and return the bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    W, H = A4
    c = canvas.Canvas(buf, pagesize=A4)

    margin = 18 * mm
    x = margin
    content_w = W - 2 * margin

    accent = _accent_for(content["category"])

    # ---- header band (category-tinted navy + faux gradient) ----
    band_h = 42 * mm
    c.setFillColorRGB(*AWS_NAVY)
    c.rect(0, H - band_h, W, band_h, fill=1, stroke=0)
    # a soft category-colored block on the right for depth
    cr, cg, cb = accent
    for i in range(24):
        t = i / 24.0
        c.setFillColorRGB(
            AWS_NAVY[0] + (cr - AWS_NAVY[0]) * t * 0.5,
            AWS_NAVY[1] + (cg - AWS_NAVY[1]) * t * 0.5,
            AWS_NAVY[2] + (cb - AWS_NAVY[2]) * t * 0.5,
        )
        bw = W * 0.5
        c.rect(W - bw + (bw * t), H - band_h, bw / 24 + 1, band_h, fill=1, stroke=0)
    # orange accent strip
    c.setFillColorRGB(*AWS_ORANGE)
    c.rect(0, H - band_h, W, 3 * mm, fill=1, stroke=0)

    # category pill (category color)
    cat = content["category"].upper()
    c.setFont("Helvetica-Bold", 9)
    pill_w = c.stringWidth(cat, "Helvetica-Bold", 9) + 14
    c.setFillColorRGB(*accent)
    c.roundRect(x, H - 20 * mm, pill_w, 7 * mm, 3, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.drawString(x + 7, H - 20 * mm + 2.1 * mm, cat)

    # source + date (top right)
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.8, 0.82, 0.88)
    meta = f"{item.get('source', 'aws')} · {(item.get('published') or '')[:10]}"
    c.drawRightString(W - margin, H - 14 * mm, meta)

    # headline
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 22)
    headline_lines = simpleSplit(content["headline"], "Helvetica-Bold", 22, content_w)
    hy = H - 28 * mm
    for line in headline_lines[:2]:
        c.drawString(x, hy, line)
        hy -= 9 * mm

    y = H - band_h - 12 * mm

    # ---- subhead ----
    if content["subhead"]:
        c.setFillColorRGB(*AWS_NAVY)
        c.setFont("Helvetica-Oblique", 12)
        for line in simpleSplit(content["subhead"], "Helvetica-Oblique", 12, content_w)[:3]:
            c.drawString(x, y, line)
            y -= 6.5 * mm
        y -= 4 * mm

    # ---- hero image (optional, graceful skip) ----
    img_reader = _fetch_image_reader(content.get("image_url"))
    if img_reader is not None:
        try:
            iw, ih = img_reader.getSize()
            disp_w = content_w
            disp_h = disp_w * (ih / float(iw))
            max_h = 55 * mm
            if disp_h > max_h:
                disp_h = max_h
                disp_w = disp_h * (iw / float(ih))
            ix = x + (content_w - disp_w) / 2
            # subtle frame
            c.setFillColorRGB(*LIGHT)
            c.roundRect(x, y - disp_h - 4 * mm, content_w, disp_h + 4 * mm, 4, fill=1, stroke=0)
            c.drawImage(
                img_reader, ix, y - disp_h - 2 * mm, width=disp_w, height=disp_h,
                preserveAspectRatio=True, mask="auto",
            )
            y -= disp_h + 10 * mm
        except Exception:
            pass

    # ---- stats row (colored cards) ----
    if content["stats"]:
        box_gap = 6 * mm
        n = len(content["stats"])
        box_w = (content_w - box_gap * (n - 1)) / n
        box_h = 20 * mm
        bx = x
        tints = [BRAND_SOFT, ORANGE_SOFT]
        vcols = [BRAND, AWS_ORANGE]
        for i, st in enumerate(content["stats"]):
            c.setFillColorRGB(*tints[i % 2])
            c.roundRect(bx, y - box_h, box_w, box_h, 4, fill=1, stroke=0)
            # colored top accent bar on each card
            c.setFillColorRGB(*vcols[i % 2])
            c.roundRect(bx, y - 2.2 * mm, box_w, 2.2 * mm, 1, fill=1, stroke=0)
            c.setFillColorRGB(*vcols[i % 2])
            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(bx + box_w / 2, y - box_h / 2 + 1 * mm, st["value"][:14])
            c.setFillColorRGB(*MID)
            c.setFont("Helvetica", 8)
            c.drawCentredString(bx + box_w / 2, y - box_h + 4 * mm, st["label"][:22])
            bx += box_w + box_gap
        y -= box_h + 10 * mm

    # ---- key points (colored section header + tinted rows) ----
    hdr_h = 8 * mm
    c.setFillColorRGB(*accent)
    c.roundRect(x, y - hdr_h + 5.5 * mm, content_w, hdr_h, 2, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + 3 * mm, y, "✦ Highlights")
    y -= 11 * mm

    c.setFont("Helvetica", 11)
    row = 0
    for pt in content["key_points"]:
        lines = simpleSplit(pt, "Helvetica", 11, content_w - 10 * mm)
        block_h = len(lines) * 5.6 * mm + 2 * mm
        # alternating soft row background
        if row % 2 == 0:
            c.setFillColorRGB(*LIGHT)
            c.roundRect(x, y - block_h + 4 * mm, content_w, block_h, 2, fill=1, stroke=0)
        # orange bullet dot
        c.setFillColorRGB(*AWS_ORANGE)
        c.circle(x + 3 * mm, y + 1.2 * mm, 1.4 * mm, fill=1, stroke=0)
        c.setFillColorRGB(*INK)
        for line in lines:
            c.drawString(x + 7 * mm, y, line)
            y -= 5.6 * mm
        y -= 2 * mm
        row += 1
        if y < 32 * mm:
            break

    _footer(c, item, W, margin, x)

    # ───────────── Page 2: deep dive (only if we have richer content) ─────────────
    deep = content.get("deep_dive")
    if deep:
        c.showPage()
        # slim category-colored header
        c.setFillColorRGB(*accent)
        c.rect(0, H - 16 * mm, W, 16 * mm, fill=1, stroke=0)
        c.setFillColorRGB(*AWS_ORANGE)
        c.rect(0, H - 16 * mm, W, 2 * mm, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x, H - 11 * mm, content["headline"][:70])

        y2 = H - 30 * mm
        # colored section header band
        c.setFillColorRGB(*BRAND)
        c.roundRect(x, y2 - 2.5 * mm, content_w, 8 * mm, 2, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x + 3 * mm, y2, "✦ Deep dive")
        y2 -= 12 * mm

        # soft tinted body panel
        body_lines = simpleSplit(deep, "Helvetica", 11, content_w - 8 * mm)
        panel_h = min(len(body_lines), 20) * 6 * mm + 6 * mm
        c.setFillColorRGB(*BRAND_SOFT)
        c.roundRect(x, y2 - panel_h + 4 * mm, content_w, panel_h, 3, fill=1, stroke=0)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 11)
        ty = y2
        for line in body_lines:
            c.drawString(x + 4 * mm, ty, line)
            ty -= 6 * mm
            if ty < 42 * mm:
                break
        y2 = ty - 4 * mm

        # who is it for
        if content.get("who_is_it_for") and y2 > 45 * mm:
            y2 -= 6 * mm
            c.setFillColorRGB(*ORANGE_SOFT)
            wif_h = 20 * mm
            c.roundRect(x, y2 - wif_h, content_w, wif_h, 4, fill=1, stroke=0)
            # orange left accent
            c.setFillColorRGB(*AWS_ORANGE)
            c.roundRect(x, y2 - wif_h, 2.5 * mm, wif_h, 1, fill=1, stroke=0)
            c.setFillColorRGB(*AWS_ORANGE)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x + 5 * mm, y2 - 6 * mm, "WHO IT'S FOR")
            c.setFillColorRGB(0.15, 0.17, 0.22)
            c.setFont("Helvetica", 10)
            for i, line in enumerate(
                simpleSplit(content["who_is_it_for"], "Helvetica", 10, content_w - 10 * mm)[:2]
            ):
                c.drawString(x + 5 * mm, y2 - 11 * mm - i * 5 * mm, line)

        _footer(c, item, W, margin, x)

    c.save()
    buf.seek(0)
    return buf.read()


def _footer(c, item, W, margin, x):
    from reportlab.lib.units import mm
    c.setStrokeColorRGB(*AWS_ORANGE)
    c.setLineWidth(1)
    c.line(x, 20 * mm, W - margin, 20 * mm)
    c.setFillColorRGB(*MID)
    c.setFont("Helvetica", 8)
    c.drawString(x, 15 * mm, "Generated by AWS News Dashboard · Source link below")
    c.setFillColorRGB(0.2, 0.4, 0.8)
    c.setFont("Helvetica", 7.5)
    link = item.get("link", "")
    c.drawString(x, 11 * mm, link[:120])
    if link:
        c.linkURL(link, (x, 10 * mm, W - margin, 16 * mm), relative=0)


# ─────────────────────── Chat answer -> PDF ───────────────────────

def _md_to_lines(text):
    """Very small markdown flattener for PDF: returns list of (kind, text).

    kind in {h, bullet, num, para}. Strips **bold**/*italic*/`code` markers and
    [label](url) -> label. Good enough for a clean one-off export.
    """
    import re as _re
    out = []
    for raw in (text or "").split("\n"):
        line = raw.rstrip()
        if not line.strip():
            out.append(("gap", ""))
            continue
        # strip inline markdown
        s = line.strip()
        s = _re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)   # links
        s = _re.sub(r"\*\*([^*]+)\*\*", r"\1", s)          # bold
        s = _re.sub(r"\*([^*]+)\*", r"\1", s)              # italic
        s = _re.sub(r"`([^`]+)`", r"\1", s)                # code
        if s.startswith("#"):
            out.append(("h", s.lstrip("#").strip()))
        elif _re.match(r"^[-*]\s+", s):
            out.append(("bullet", _re.sub(r"^[-*]\s+", "", s)))
        elif _re.match(r"^\d+[.)]\s+", s):
            out.append(("num", _re.sub(r"^\d+[.)]\s+", "", s)))
        else:
            out.append(("para", s))
    return out


def render_chat_pdf(question, answer_md, sources=None, provider_name="AI"):
    """Render a chat Q&A to a clean, colored PDF. Returns bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas

    sources = sources or []
    buf = io.BytesIO()
    W, H = A4
    c = canvas.Canvas(buf, pagesize=A4)
    margin = 18 * mm
    x = margin
    cw = W - 2 * margin

    def footer():
        c.setStrokeColorRGB(*AWS_ORANGE)
        c.setLineWidth(1)
        c.line(x, 15 * mm, W - margin, 15 * mm)
        c.setFillColorRGB(*MID)
        c.setFont("Helvetica", 8)
        c.drawString(x, 10 * mm, f"AWS News Dashboard · AI assistant ({provider_name})")

    def new_page_header():
        c.setFillColorRGB(*AWS_NAVY)
        c.rect(0, H - 26 * mm, W, 26 * mm, fill=1, stroke=0)
        c.setFillColorRGB(*AWS_ORANGE)
        c.rect(0, H - 26 * mm, W, 3 * mm, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(x, H - 16 * mm, "AWS News · AI Answer")
        c.setFillColorRGB(0.8, 0.82, 0.88)
        c.setFont("Helvetica", 8)
        from datetime import datetime, timezone
        c.drawRightString(W - margin, H - 11 * mm,
                          datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))

    new_page_header()
    y = H - 36 * mm

    # Question block (brand-tinted)
    q_lines = simpleSplit(question or "", "Helvetica-Bold", 12, cw - 8 * mm)
    q_h = len(q_lines) * 6 * mm + 8 * mm
    c.setFillColorRGB(*BRAND_SOFT)
    c.roundRect(x, y - q_h, cw, q_h, 4, fill=1, stroke=0)
    c.setFillColorRGB(*BRAND)
    c.roundRect(x, y - q_h, 2.5 * mm, q_h, 1, fill=1, stroke=0)
    c.setFillColorRGB(*BRAND)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 5 * mm, y - 5 * mm, "QUESTION")
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 12)
    ty = y - 11 * mm
    for ln in q_lines:
        c.drawString(x + 5 * mm, ty, ln)
        ty -= 6 * mm
    y = y - q_h - 8 * mm

    # Answer section header
    c.setFillColorRGB(*AWS_ORANGE)
    c.roundRect(x, y - 2.5 * mm, cw, 8 * mm, 2, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + 3 * mm, y, "✦ Answer")
    y -= 12 * mm

    def ensure_space(need):
        nonlocal y
        if y - need < 22 * mm:
            footer()
            c.showPage()
            new_page_header()
            y = H - 36 * mm

    for kind, text in _md_to_lines(answer_md):
        if kind == "gap":
            y -= 3 * mm
            continue
        if kind == "h":
            ensure_space(10 * mm)
            c.setFillColorRGB(*BRAND)
            c.setFont("Helvetica-Bold", 12.5)
            for ln in simpleSplit(text, "Helvetica-Bold", 12.5, cw):
                c.drawString(x, y, ln); y -= 6.2 * mm
            y -= 1 * mm
        elif kind in ("bullet", "num"):
            lines = simpleSplit(text, "Helvetica", 11, cw - 8 * mm)
            ensure_space(len(lines) * 5.6 * mm + 2 * mm)
            c.setFillColorRGB(*AWS_ORANGE)
            c.circle(x + 2 * mm, y + 1.1 * mm, 1.3 * mm, fill=1, stroke=0)
            c.setFillColorRGB(*INK)
            c.setFont("Helvetica", 11)
            for ln in lines:
                c.drawString(x + 6.5 * mm, y, ln); y -= 5.6 * mm
            y -= 1.5 * mm
        else:
            lines = simpleSplit(text, "Helvetica", 11, cw)
            ensure_space(len(lines) * 5.6 * mm + 2 * mm)
            c.setFillColorRGB(*INK)
            c.setFont("Helvetica", 11)
            for ln in lines:
                c.drawString(x, y, ln); y -= 5.6 * mm
            y -= 2 * mm

    # Sources
    if sources:
        ensure_space(16 * mm)
        y -= 2 * mm
        c.setFillColorRGB(*BRAND)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x, y, "Sources")
        y -= 7 * mm
        c.setFont("Helvetica", 9)
        for i, s in enumerate(sources[:10], 1):
            title = (s.get("title") or "")[:90]
            link = s.get("link") or ""
            ensure_space(10 * mm)
            c.setFillColorRGB(*INK)
            for ln in simpleSplit(f"{i}. {title}", "Helvetica", 9, cw):
                c.drawString(x, y, ln); y -= 5 * mm
            if link:
                c.setFillColorRGB(0.2, 0.4, 0.8)
                c.setFont("Helvetica", 7.5)
                c.drawString(x + 4 * mm, y, link[:110])
                c.linkURL(link, (x, y - 1 * mm, W - margin, y + 4 * mm), relative=0)
                c.setFont("Helvetica", 9)
                y -= 6 * mm

    footer()
    c.save()
    buf.seek(0)
    return buf.read()


# ─────────────────────── Multi-item digest -> PDF ───────────────────────

def render_digest_pdf(title, items):
    """Render a colored multi-item digest PDF (title + N cards with summaries)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas
    from datetime import datetime, timezone

    items = items or []
    buf = io.BytesIO()
    W, H = A4
    c = canvas.Canvas(buf, pagesize=A4)
    margin = 16 * mm
    x = margin
    cw = W - 2 * margin

    def footer(page_no):
        c.setStrokeColorRGB(*AWS_ORANGE)
        c.setLineWidth(1)
        c.line(x, 14 * mm, W - margin, 14 * mm)
        c.setFillColorRGB(*MID)
        c.setFont("Helvetica", 8)
        c.drawString(x, 9.5 * mm, "AWS News Dashboard · News digest")
        c.drawRightString(W - margin, 9.5 * mm, f"Page {page_no}")

    # ---- cover header ----
    band_h = 34 * mm
    c.setFillColorRGB(*AWS_NAVY)
    c.rect(0, H - band_h, W, band_h, fill=1, stroke=0)
    # faux gradient to brand blue
    for i in range(24):
        t = i / 24.0
        c.setFillColorRGB(
            AWS_NAVY[0] + (BRAND[0] - AWS_NAVY[0]) * t * 0.6,
            AWS_NAVY[1] + (BRAND[1] - AWS_NAVY[1]) * t * 0.6,
            AWS_NAVY[2] + (BRAND[2] - AWS_NAVY[2]) * t * 0.6,
        )
        bw = W * 0.55
        c.rect(W - bw + (bw * t), H - band_h, bw / 24 + 1, band_h, fill=1, stroke=0)
    c.setFillColorRGB(*AWS_ORANGE)
    c.rect(0, H - band_h, W, 3 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 20)
    for i, line in enumerate(simpleSplit(title or "AWS Updates", "Helvetica-Bold", 20, cw)[:2]):
        c.drawString(x, H - 16 * mm - i * 8 * mm, line)
    c.setFillColorRGB(0.8, 0.82, 0.88)
    c.setFont("Helvetica", 9)
    c.drawString(x, H - band_h + 5 * mm,
                 f"{len(items)} announcements · generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    y = H - band_h - 10 * mm
    page_no = 1

    for idx, it in enumerate(items, 1):
        title_t = it.get("title") or "Untitled"
        summary = (it.get("summary") or "").strip()
        cat = it.get("category") or "AWS"
        accent = _accent_for(cat)
        date = (it.get("published") or "")[:10]

        t_lines = simpleSplit(f"{idx}. {title_t}", "Helvetica-Bold", 12, cw - 10 * mm)
        s_lines = simpleSplit(summary, "Helvetica", 9.5, cw - 10 * mm)[:6]
        card_h = 10 * mm + len(t_lines) * 5.6 * mm + len(s_lines) * 5 * mm + 6 * mm

        # page break
        if y - card_h < 20 * mm:
            footer(page_no)
            c.showPage()
            page_no += 1
            y = H - 20 * mm

        # card background + colored left rail
        c.setFillColorRGB(0.98, 0.98, 0.99)
        c.roundRect(x, y - card_h, cw, card_h, 4, fill=1, stroke=0)
        c.setFillColorRGB(*accent)
        c.roundRect(x, y - card_h, 3 * mm, card_h, 1, fill=1, stroke=0)

        iy = y - 6 * mm
        # category pill + date
        c.setFont("Helvetica-Bold", 7.5)
        pill = cat.upper()
        pw = c.stringWidth(pill, "Helvetica-Bold", 7.5) + 10
        c.setFillColorRGB(*accent)
        c.roundRect(x + 6 * mm, iy - 1 * mm, pw, 5 * mm, 2, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.drawString(x + 6 * mm + 5, iy + 0.4 * mm, pill)
        c.setFillColorRGB(*MID)
        c.setFont("Helvetica", 8)
        c.drawRightString(W - margin - 4 * mm, iy + 0.4 * mm, date)
        iy -= 7 * mm

        # title
        c.setFillColorRGB(*BRAND)
        c.setFont("Helvetica-Bold", 12)
        for line in t_lines:
            c.drawString(x + 6 * mm, iy, line)
            iy -= 5.6 * mm
        # summary
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 9.5)
        for line in s_lines:
            c.drawString(x + 6 * mm, iy, line)
            iy -= 5 * mm

        y -= card_h + 6 * mm

    footer(page_no)
    c.save()
    buf.seek(0)
    return buf.read()
