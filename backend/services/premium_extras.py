"""Premium PDF extras: branding, SVG charts, weekly digest, comparison.

Builds on services.premium_pdf (shared palette, SVG icons, _html_to_pdf,
_esc, _data_uri, _accent). Everything is HTML/CSS -> WeasyPrint.
"""

import html as _html
import logging
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List

from services.premium_pdf import (
    _accent, _esc, _html_to_pdf, _svg_icon, _data_uri, CAT_HEX,
)

log = logging.getLogger(__name__)

# ───────────────────────── Branding ─────────────────────────

BRAND_NAVY = "#17213d"
BRAND_BLUE = "#0f4a83"
BRAND_ORANGE = "#ff9900"

# Neutral "AWS News" wordmark: an orange cloud mark + label. No external assets.
def _logo_mark() -> str:
    return (
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ff9900" '
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
        'style="vertical-align:middle;">'
        '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19z"/></svg>'
        '<span style="font-weight:800;font-size:12px;letter-spacing:.3px;color:#fff;'
        'vertical-align:middle;">&nbsp;AWS News</span>'
    )


def brand_footer(right_html: str = "") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return (
        '<table class="brand-foot"><tr>'
        f'<td>AWS News &middot; AI-assisted intelligence &middot; {stamp}</td>'
        f'<td class="r">{right_html}</td>'
        '</tr></table>'
    )


BRAND_CSS = """
@page { size:A4; margin:0; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:#14181f; }
.page { width:210mm; min-height:297mm; padding:0 0 20mm; position:relative; }
.topbar { padding:14mm 16mm 9mm; color:#fff;
  background:linear-gradient(135deg,""" + BRAND_BLUE + """ 0%,""" + BRAND_NAVY + """ 65%,#0b1120 100%); }
.topbar-strip { height:3mm; background:linear-gradient(90deg,#ff9900,#ff6a00); }
.brandtbl { width:100%; border-collapse:collapse; margin-bottom:7mm; }
.brandtbl td { font-size:10px; letter-spacing:1.2px; text-transform:uppercase; opacity:.92; vertical-align:middle; }
.brandtbl .r { text-align:right; }
.doc-title { font-size:26px; font-weight:800; line-height:1.12; letter-spacing:-0.3px; }
.doc-sub { font-size:12px; opacity:.88; margin-top:5px; }
.brand-foot { width:100%; border-collapse:collapse; border-top:2px solid #ff9900; margin:7mm 0 0; }
.brand-foot td { padding-top:6px; font-size:8.5px; color:#8a94a3; vertical-align:middle; }
.brand-foot .r { text-align:right; }
.sec { font-size:12px; font-weight:800;
  color:""" + BRAND_BLUE + """; text-transform:uppercase; letter-spacing:1px; margin:7mm 16mm 3mm;
  padding-left:9px; border-left:4px solid #ff9900; line-height:1.3; }
"""


# ───────────────────────── SVG charts ─────────────────────────

def svg_bar_chart(pairs: List, width: int = 500, height: int = 150) -> str:
    """Horizontal-ish vertical bar chart. pairs = [(label, value, color?), ...]."""
    pairs = [p for p in pairs if p[1] > 0][:8]
    if not pairs:
        return ""
    maxv = max(p[1] for p in pairs)
    n = len(pairs)
    pad_l, pad_b, pad_t = 8, 26, 10
    gap = 10
    bw = (width - pad_l - (gap * (n - 1))) / n
    plot_h = height - pad_b - pad_t
    bars = []
    for i, p in enumerate(pairs):
        label, val = p[0], p[1]
        color = p[2] if len(p) > 2 else BRAND_BLUE
        bh = (val / maxv) * plot_h if maxv else 0
        x = pad_l + i * (bw + gap)
        y = pad_t + (plot_h - bh)
        bars.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="3" fill="{color}"/>'
            f'<text x="{x + bw/2:.1f}" y="{y - 3:.1f}" text-anchor="middle" '
            f'font-size="10" font-weight="700" fill="#334155">{val}</text>'
            f'<text x="{x + bw/2:.1f}" y="{height - 8:.1f}" text-anchor="middle" '
            f'font-size="8" fill="#64748b">{_esc(str(label)[:9])}</text>'
        )
    baseline = pad_t + plot_h
    return (
        f'<svg viewBox="0 0 {width} {height}" width="100%" style="max-width:{width}px">'
        f'<line x1="{pad_l}" y1="{baseline}" x2="{width}" y2="{baseline}" stroke="#e2e8f0" stroke-width="1"/>'
        + "".join(bars) + "</svg>"
    )


def category_chart(items: List[Dict[str, Any]]) -> str:
    counts = Counter((it.get("category") or "General") for it in items)
    pairs = [(c, n, _accent(c)[0]) for c, n in counts.most_common(8)]
    return svg_bar_chart(pairs)


# ───────────────────────── Weekly digest ─────────────────────────

def render_weekly_pdf(title: str, items: List[Dict[str, Any]],
                      window_label: str = "") -> bytes:
    by_cat: Dict[str, List[Dict[str, Any]]] = {}
    for it in items:
        by_cat.setdefault(it.get("category") or "General", []).append(it)
    ordered = sorted(by_cat.items(), key=lambda kv: -len(kv[1]))

    chart = category_chart(items)

    groups_html = ""
    for cat, its in ordered:
        c1, _c2 = _accent(cat)
        rows = "".join(
            f'<table class="w-item"><tr>'
            f'<td class="w-dot-td"><span class="w-dot" style="background:{c1}"></span></td>'
            f'<td><div class="w-title">{_esc(it.get("title") or "")}</div>'
            f'<div class="w-sum">{_esc((it.get("summary") or "")[:200])}</div>'
            f'<div class="w-date">{_esc((it.get("published") or "")[:10])}</div></td>'
            f'</tr></table>'
            for it in its[:6]
        )
        groups_html += (
            f'<div class="w-group">'
            f'<span class="w-cat" style="background:{c1}">'
            f'{_esc(cat)} &nbsp;<span class="w-count">{len(its)}</span></span>'
            f'{rows}</div>'
        )

    css = BRAND_CSS + """
.body { padding:0 16mm 10mm; }
.chartbox { margin:4mm 16mm 2mm; background:#f8fafc; border:1px solid #e5e9f0;
  border-radius:12px; padding:10px 14px; }
.chart-h { font-size:11px; font-weight:700; color:#0f4a83; margin-bottom:4px; }
.w-group { margin:5mm 0; page-break-inside:avoid; }
.w-cat { display:inline-block; color:#fff; font-weight:800;
  font-size:11px; text-transform:uppercase; letter-spacing:.5px; padding:4px 12px; border-radius:999px; }
.w-count { background:rgba(255,255,255,.28); border-radius:999px; padding:1px 7px; font-size:10px; }
.w-item { width:100%; border-collapse:collapse; border-bottom:1px solid #eef1f5; }
.w-item td { padding:6px 2px; vertical-align:top; }
.w-dot-td { width:16px; }
.w-dot { display:inline-block; width:8px;height:8px;border-radius:50%; margin-top:5px; }
.w-title { font-size:11.5px; font-weight:700; color:#1f2733; }
.w-sum { font-size:10px; color:#5b6472; line-height:1.4; margin-top:2px; }
.w-date { font-size:8.5px; color:#9aa3b0; margin-top:2px; }
"""
    return _html_to_pdf(f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="page">
  <div class="topbar">
    <table class="brandtbl"><tr>
      <td>AWS News &middot; Weekly</td>
      <td class="r">{_logo_mark()}</td>
    </tr></table>
    <div class="doc-title">{_esc(title or "This Week in AWS")}</div>
    <div class="doc-sub">{_esc(window_label)} &middot; {len(items)} announcements across {len(ordered)} categories</div>
  </div>
  <div class="topbar-strip"></div>
  <div class="sec">Announcements by category</div>
  <div class="chartbox"><div class="chart-h">Volume by category</div>{chart}</div>
  <div class="body">{groups_html}
    {brand_footer("Weekly digest")}
  </div>
</div></body></html>""")


# ───────────────────────── Comparison ─────────────────────────

def render_comparison_pdf(title: str, items: List[Dict[str, Any]],
                          rows: List[Dict[str, Any]], verdict: str = "") -> bytes:
    """items: 2-3 things compared. rows: [{aspect, values:[per-item]}]."""
    items = items[:3]
    n = len(items)
    colw = f"{int(68 / max(n,1))}%"

    heads = '<th class="aspect-h">Aspect</th>' + "".join(
        f'<th style="width:{colw}"><span class="ch-pill" '
        f'style="background:linear-gradient(135deg,{_accent(it.get("category"))[0]},{_accent(it.get("category"))[1]})">'
        f'{_esc(it.get("category") or "AWS")}</span>'
        f'<div class="ch-title">{_esc(it.get("title") or it.get("name") or "")}</div></th>'
        for it in items
    )

    body_rows = ""
    for r in rows:
        vals = r.get("values") or []
        cells = "".join(
            f'<td>{_esc(str(vals[i]) if i < len(vals) else "—")}</td>' for i in range(n)
        )
        body_rows += f'<tr><td class="aspect">{_esc(r.get("aspect",""))}</td>{cells}</tr>'

    verdict_html = ""
    if verdict:
        verdict_html = (
            f'<div class="sec">Bottom line</div>'
            f'<div class="verdict">{_esc(verdict)}</div>'
        )

    css = BRAND_CSS + """
.body { padding:4mm 16mm 10mm; }
.cmp { width:100%; border-collapse:collapse; margin-top:2mm; table-layout:fixed; }
.cmp th, .cmp td { border:1px solid #e5e9f0; padding:8px 9px; vertical-align:top; text-align:left; font-size:10.5px; word-wrap:break-word; }
.cmp th { background:#f1f5fb; }
.cmp .aspect-h, .cmp td.aspect { background:#0f4a83; color:#fff; font-weight:700; width:22%; }
.cmp td.aspect { background:#eef3fb; color:#0f4a83; }
.ch-pill { display:inline-block; color:#fff; font-size:8px; font-weight:700; text-transform:uppercase;
  letter-spacing:.5px; padding:2px 8px; border-radius:999px; }
.ch-title { font-size:11px; font-weight:800; color:#1f2733; margin-top:4px; }
.cmp tr:nth-child(even) td { background:#fafbfd; }
.cmp tr:nth-child(even) td.aspect { background:#e7eef9; }
.verdict { margin-top:4mm; background:#fff7ec;
  border:1px solid rgba(255,153,0,.35); border-radius:12px; padding:11px 14px; font-size:12px; color:#7a4b00; }
"""
    return _html_to_pdf(f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="page">
  <div class="topbar">
    <table class="brandtbl"><tr>
      <td>AWS News &middot; Comparison</td>
      <td class="r">{_logo_mark()}</td>
    </tr></table>
    <div class="doc-title">{_esc(title or "AWS Comparison")}</div>
    <div class="doc-sub">Side-by-side of {n} items</div>
  </div>
  <div class="topbar-strip"></div>
  <div class="body"><table class="cmp"><thead><tr>{heads}</tr></thead><tbody>{body_rows}</tbody></table>
  {verdict_html}
  {brand_footer("Comparison brief")}
  </div>
</div></body></html>""")
