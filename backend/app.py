import json as _json
import logging

from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from config import Config
from services.feed_service import FeedService
from services.retrieval import retrieve
from services.agent import run_agent
from llm.factory import build_provider

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","name":"%(name)s","msg":"%(message)s"}',
)
log = logging.getLogger("app")


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, origins=Config.CORS_ORIGINS)

    feed_service = FeedService(Config.FEED_URLS, Config.CACHE_TTL_SECONDS)
    llm = build_provider()
    log.info("LLM provider ready: %s", llm.name)

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

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)