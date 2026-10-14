import json as _json
import logging
import os
import re as _re
import tempfile
import time as _time
import uuid as _uuid

from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS

from config import Config
from services.feed_service import FeedService
from services.retrieval import retrieve
from services.agent import run_agent
from services.article_agent import run_article_agent
from services.article_scraper import ArticleScraper
from services.infographic import (
    generate_infographic_content,
    render_infographic_pdf,
    render_chat_pdf,
    render_digest_pdf,
)
from services import premium_pdf
from services import premium_extras
from llm.factory import build_provider

# Directory where agent-generated digest PDFs are temporarily stored.
_GEN_DIR = os.path.join(tempfile.gettempdir(), "awsnews_generated")
os.makedirs(_GEN_DIR, exist_ok=True)
_GEN_TTL = 3600  # seconds


def _cleanup_generated():
    """Delete generated PDFs older than the TTL (best-effort)."""
    now = _time.time()
    try:
        for fn in os.listdir(_GEN_DIR):
            fp = os.path.join(_GEN_DIR, fn)
            if now - os.path.getmtime(fp) > _GEN_TTL:
                os.remove(fp)
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","name":"%(name)s","msg":"%(message)s"}',
)
log = logging.getLogger("app")


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, origins=Config.CORS_ORIGINS)

    feed_service = FeedService(Config.FEED_URLS, Config.CACHE_TTL_SECONDS)
    scraper = ArticleScraper(ttl_seconds=Config.ARTICLE_CACHE_TTL_SECONDS)
    llm = build_provider()
    log.info("LLM provider ready: %s", llm.name)

    def _save_pdf(pdf: bytes, title: str, suffix: str = "") -> tuple:
        _cleanup_generated()
        token = _uuid.uuid4().hex[:12]
        base = _re.sub(r"[^a-zA-Z0-9]+", "-", (title or "aws")).strip("-").lower()[:40] or "aws"
        filename = f"{base}{suffix}.pdf"
        stored = f"{token}__{filename}"
        with open(os.path.join(_GEN_DIR, stored), "wb") as f:
            f.write(pdf)
        return (f"/api/generated/{stored}", filename)

    def _digest_sink(title, items):
        """Render a digest PDF (premium HTML, reportlab fallback), save, return (url, filename)."""
        try:
            pdf = premium_pdf.render_premium_digest(title, items)
        except Exception as e:
            log.warning("premium digest failed (%s) — reportlab fallback", e)
            pdf = render_digest_pdf(title, items)
        return _save_pdf(pdf, title, "")

    def _weekly_sink(title, items, window):
        try:
            pdf = premium_extras.render_weekly_pdf(title, items, window_label=window)
        except Exception as e:
            log.warning("premium weekly failed (%s) — reportlab digest fallback", e)
            pdf = render_digest_pdf(title, items)
        return _save_pdf(pdf, title, "-weekly")

    def _comparison_sink(title, items, rows, verdict):
        try:
            pdf = premium_extras.render_comparison_pdf(title, items, rows, verdict)
        except Exception as e:
            log.warning("premium comparison failed (%s) — reportlab digest fallback", e)
            pdf = render_digest_pdf(title, items)
        return _save_pdf(pdf, title, "-comparison")

    def _find_item(item_id):
        return next((i for i in feed_service.get_items() if i.get("id") == item_id), None)

    # ---------- serve agent-generated PDFs ----------
    @app.get("/api/generated/<path:name>")
    def generated(name):
        # prevent path traversal
        safe = os.path.basename(name)
        fp = os.path.join(_GEN_DIR, safe)
        if not os.path.isfile(fp):
            return jsonify({"error": "not found or expired", "name": safe}), 404
        download = safe.split("__", 1)[-1]
        return send_file(
            fp, mimetype="application/pdf",
            as_attachment=True, download_name=download,
        )

    # ---------- health ----------
    @app.get("/api/health")
    def health():
        cached = feed_service.cache.get()
        return jsonify({
            "status": "ok",
            "provider": Config.LLM_PROVIDER,
            "local_mode": Config.LOCAL_LLM_MODE,
            "llm": {
                "name": llm.name,
                **llm.health(),
            },
            "last_successful_refresh": feed_service.last_successful_refresh,
            "cache_age_seconds": feed_service.cache.age_seconds(),
            "cached_items": len(cached) if cached else 0,
            "errors": feed_service.last_errors,
        })

    # ---------- force refresh (bypasses TTL) ----------
    @app.post("/api/refresh")
    def refresh():
        try:
            feed_service.get_items(force_refresh=True)
            cached = feed_service.cache.get()
            return jsonify({
                "status": "ok",
                "last_successful_refresh": feed_service.last_successful_refresh,
                "cache_age_seconds": feed_service.cache.age_seconds(),
                "cached_items": len(cached) if cached else 0,
                "errors": feed_service.last_errors,
            })
        except Exception as e:
            log.exception("refresh failed")
            return jsonify({"error": "refresh failed", "detail": str(e)}), 500

    # ---------- news ----------
    @app.get("/api/news")
    def news():
        try:
            page = int(request.args.get("page", 1))
            limit = int(request.args.get("limit", 20))
        except ValueError:
            return jsonify({"error": "page and limit must be integers"}), 400

        return jsonify(feed_service.query(
            category=request.args.get("category"),
            source=request.args.get("source"),
            from_=request.args.get("from"),
            to=request.args.get("to"),
            q=request.args.get("q"),
            page=page,
            limit=limit,
            sort=request.args.get("sort", "newest"),
        ))

    # ---------- categories ----------
    @app.get("/api/categories")
    def categories():
        items = feed_service.get_items()
        counts: dict[str, int] = {}
        for i in items:
            counts[i["category"]] = counts.get(i["category"], 0) + 1
        return jsonify({
            "categories": sorted(counts.items(), key=lambda x: -x[1]),
        })

    # ---------- article detail (full scraped content + images) ----------
    @app.get("/api/article/<item_id>")
    def article(item_id: str):
        item = _find_item(item_id)
        if not item:
            return jsonify({"error": "news item not found", "id": item_id}), 404
        try:
            data = scraper.get_article(item)
        except Exception as e:
            log.exception("article fetch failed")
            return jsonify({"error": "article fetch failed", "detail": str(e)}), 500
        return jsonify(data)

    # ---------- article AI detailed summary (SSE, agentic) ----------
    @app.post("/api/article/<item_id>/summary/stream")
    def article_summary_stream(item_id: str):
        item = _find_item(item_id)
        if not item:
            return jsonify({"error": "news item not found", "id": item_id}), 404

        feed = feed_service.get_items()
        article_data = scraper.get_article(item)

        def sse(name: str, data) -> str:
            return f"event: {name}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"

        def generate():
            try:
                for ev in run_article_agent(article_data, feed, llm):
                    etype = ev.get("type")
                    if etype == "token":
                        yield sse("token", {"text": ev["text"]})
                    elif etype == "reasoning":
                        yield sse("reasoning", {"text": ev["text"]})
                    elif etype == "tool_call":
                        yield sse("tool_call", {"tool": ev["tool"]})
                    elif etype == "tool_result":
                        yield sse("tool_result", {"tool": ev["tool"]})
                    elif etype == "sources":
                        yield sse("sources", {
                            "sources": ev["sources"],
                            "retrieved": ev.get("retrieved", len(ev["sources"])),
                        })
                    elif etype == "error":
                        yield sse("error", {"message": ev["message"]})
                    elif etype == "done":
                        yield sse("done", {"provider": llm.name})
            except Exception as e:
                log.exception("article summary stream crashed")
                yield sse("error", {"message": str(e)})
                yield sse("done", {"provider": llm.name})

        return Response(
            generate(),
            mimetype="text/event-stream; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    # ---------- infographic one-pager (PDF) ----------
    @app.get("/api/infographic/<item_id>")
    def infographic(item_id: str):
        item = _find_item(item_id)
        if not item:
            return jsonify({"error": "news item not found", "id": item_id}), 404

        try:
            # Ground the infographic on the full scraped article when available.
            article_data = scraper.get_article(item)
            # Premium path: Nova Pro rich schema -> HTML/CSS -> WeasyPrint PDF.
            try:
                content = premium_pdf.generate_premium_content(item, llm, article=article_data)
                pdf_bytes = premium_pdf.render_premium_infographic(item, content)
            except Exception as e:
                log.warning("premium infographic failed (%s) — reportlab fallback", e)
                content = generate_infographic_content(item, llm, article=article_data)
                pdf_bytes = render_infographic_pdf(item, content)
        except Exception as e:
            log.exception("infographic generation failed")
            return jsonify({"error": "infographic generation failed", "detail": str(e)}), 500

        # safe filename from the title
        import re as _re
        slug = _re.sub(r"[^a-zA-Z0-9]+", "-", (item.get("title") or "aws-news")).strip("-").lower()[:60]
        filename = f"{slug or 'aws-news'}-infographic.pdf"

        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
                "Cache-Control": "no-store",
            },
        )

    # ---------- chat (blocking RAG) ----------
    @app.post("/api/chat")
    def chat():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()

        if not question:
            return jsonify({"error": "question is required"}), 400
        if len(question) > 1000:
            return jsonify({"error": "question too long (max 1000 chars)"}), 400

        items = feed_service.get_items()
        hits = retrieve(items, question, top_k=Config.CHAT_TOP_K, min_score=0.5)

        sources = [
            {
                "id": it["id"], "title": it["title"], "link": it["link"],
                "published": it.get("published"), "category": it.get("category"),
                "source": it.get("source"),
            } for it in hits
        ]

        try:
            result = llm.chat(question, hits)
        except Exception as e:
            log.exception("chat provider failed")
            return jsonify({
                "error": "chat provider failed",
                "detail": str(e),
                "provider": llm.name,
            }), 502

        return jsonify({
            "answer": result["answer"],
            "sources": sources,
            "provider": result.get("provider", llm.name),
            "model": result.get("model"),
            "retrieved": len(hits),
        })

    # ---------- chat (SSE, agentic) ----------
    @app.post("/api/chat/stream")
    def chat_stream():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        history = body.get("history") or []

        if not question:
            return jsonify({"error": "question is required"}), 400
        if len(question) > 1000:
            return jsonify({"error": "question too long (max 1000 chars)"}), 400

        items = feed_service.get_items()
        initial_hits = retrieve(items, question, top_k=Config.CHAT_TOP_K, min_score=0.5)

        def sse(name: str, data) -> str:
            return f"event: {name}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"

        def generate():
            try:
                for ev in run_agent(
                    question=question,
                    feed=items,
                    provider=llm,
                    history=history,
                    initial_hits=initial_hits,
                    pdf_sink=_digest_sink,
                    weekly_sink=_weekly_sink,
                    comparison_sink=_comparison_sink,
                ):
                    etype = ev.get("type")
                    if etype == "token":
                        yield sse("token", {"text": ev["text"]})
                    elif etype == "reasoning":
                        yield sse("reasoning", {"text": ev["text"]})
                    elif etype == "tool_call":
                        yield sse("tool_call", {"tool": ev["tool"]})
                    elif etype == "tool_result":
                        yield sse("tool_result", {"tool": ev["tool"]})
                    elif etype == "artifact":
                        yield sse("artifact", {"artifact": ev["artifact"]})
                    elif etype == "sources":
                        yield sse("sources", {
                            "sources": ev["sources"],
                            "retrieved": ev.get("retrieved", len(ev["sources"])),
                        })
                    elif etype == "sources_final":
                        yield sse("sources", {
                            "sources": ev["sources"],
                            "retrieved": len(ev["sources"]),
                            "final": True,
                        })
                    elif etype == "error":
                        yield sse("error", {"message": ev["message"]})
                    elif etype == "done":
                        yield sse("done", {"provider": llm.name})
            except Exception as e:
                log.exception("stream crashed")
                yield sse("error", {"message": str(e)})
                yield sse("done", {"provider": llm.name})

        return Response(
            generate(),
            mimetype="text/event-stream; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    # ---------- chat answer -> PDF ----------
    @app.post("/api/chat/pdf")
    def chat_pdf():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        answer = (body.get("answer") or "").strip()
        sources = body.get("sources") or []

        if not answer:
            return jsonify({"error": "answer is required"}), 400
        if len(answer) > 20000:
            answer = answer[:20000]

        try:
            try:
                pdf_bytes = premium_pdf.render_premium_chat(
                    question, answer, sources=sources, provider_name=llm.name
                )
            except Exception as e:
                log.warning("premium chat pdf failed (%s) — reportlab fallback", e)
                pdf_bytes = render_chat_pdf(
                    question, answer, sources=sources, provider_name=llm.name
                )
        except Exception as e:
            log.exception("chat pdf failed")
            return jsonify({"error": "chat pdf failed", "detail": str(e)}), 500

        import re as _re
        slug = _re.sub(r"[^a-zA-Z0-9]+", "-", (question or "aws-chat")).strip("-").lower()[:50]
        filename = f"{slug or 'aws-chat'}-answer.pdf"
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
                "Cache-Control": "no-store",
            },
        )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)