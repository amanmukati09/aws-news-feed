# AWS News Dashboard

A fast, self-contained reader for official AWS announcements, with filters,
bookmarks, dark mode, and an **agentic AI assistant** that answers questions
strictly from the fetched items and cites its sources.

Runs **fully offline** (mock provider, no API keys, no DB) or with **Groq**
locally, and switches to **AWS Bedrock** on EC2 by changing environment
variables only — no code changes.

---

## Features

**News**
- Aggregates 4 official AWS RSS feeds (What's New, News Blog, ML Blog, Compute Blog)
- Normalizes items: title, summary, link, published, category, source, tags
- In-memory TTL cache (default 15 min), per-feed fault isolation
- Full-text (BM25) search, multi-select category + source filters, date presets
  + custom range, 4 sort modes, pagination
- Bookmarks (localStorage), recent searches, trending topics, activity pulse
- Reading time, category avatars, share menu, native mobile share

**AI assistant (drawer)**
- Streaming SSE responses, rendered as Markdown with code highlighting
- Grounded: answers only from retrieved items, cites sources as [1], [2]…
- Agentic: uses tools (`search_news`, `get_recent`, `get_item_summary`)
  the model chooses, in a 2-round tool loop
- Collapsible tool-call cards, reasoning traces, sources grid
- Multi-session chat history, rename/delete, per-message copy/regenerate

**UI**
- Light + premium dark mode, `prefers-color-scheme` aware
- Keyboard: `/` focus search, `⌘K`/`Ctrl+K` command palette, `↑↓` navigation
- Fully responsive: mobile drawer sidebar, mobile-friendly chat
- A11y: ARIA roles, focus rings, 4.5:1 contrast

---

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, Vite, Tailwind v4, axios |
| Backend  | Python 3.11+, Flask, feedparser, requests, gunicorn |
| Retrieval | Pure-Python BM25 (no embeddings, no vector DB) |
| LLM       | Provider abstraction: `mock`, `groq`, `bedrock` |
| Container | Docker, Docker Compose, nginx (multi-stage) |

---

## Quickstart

### Local development

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # edit if you want Groq
python app.py              # http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173 (proxies /api to :8000)
```

### Docker Compose

```bash
cp backend/.env.example backend/.env
# (optional) put your Groq key in backend/.env
docker compose up --build
# frontend → http://localhost:8080
# backend  → http://localhost:8000
```

---

## Environment variables

See `backend/.env.example` for the full list. Highlights:

| Var | Default | Notes |
|-----|---------|-------|
| `LLM_PROVIDER`      | `local`  | `local` or `bedrock` |
| `LOCAL_LLM_MODE`    | `mock`   | `mock` (offline) or `groq` |
| `GROQ_API_KEY`      | *(empty)* | Required when `LOCAL_LLM_MODE=groq` |
| `GROQ_MODEL`        | `openai/gpt-oss-20b` | Any chat model on your Groq account |
| `AWS_REGION`        | `us-east-1` | Used only by Bedrock |
| `BEDROCK_CHAT_MODEL_ID` | `amazon.nova-pro-v1:0` | Bedrock chat model |
| `FEED_URLS`         | 4 AWS feeds | Comma-separated RSS URLs |
| `CACHE_TTL_SECONDS` | `900`    | Feed cache freshness |
| `CORS_ORIGINS`      | localhost dev | Comma-separated allowed origins |

---

## Switching to Bedrock (EC2)

No code changes. On the EC2 instance:

```bash
# 1. Attach an IAM role with bedrock:InvokeModel + bedrock:InvokeModelWithResponseStream

# 2. In backend/.env:
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_CHAT_MODEL_ID=amazon.nova-pro-v1:0

# 3. Restart
docker compose up -d --build
```

Credentials come from the IAM role — **no keys in env**. `/api/health`
will report `llm.name = "bedrock"`.

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/health`          | Status, provider, cache age, item count |
| GET  | `/api/news`            | Paginated, filtered, sorted news |
| GET  | `/api/categories`      | Category list with counts |
| POST | `/api/refresh`         | Force re-fetch of all RSS feeds |
| POST | `/api/chat`            | Blocking grounded answer |
| POST | `/api/chat/stream`     | **SSE** streaming agentic chat |

Query params for `/api/news`: `category`, `source`, `from`, `to`, `q`,
`page`, `limit`, `sort` (`newest` · `oldest` · `title_asc` · `title_desc`).

---

## Project structure

```
aws-news-dashboard/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py                 # Flask routes
│   ├── config.py              # env loading
│   ├── services/
│   │   ├── cache.py           # in-memory TTL cache
│   │   ├── feed_service.py    # fetch / normalize / query
│   │   ├── retrieval.py       # BM25
│   │   ├── tools.py           # agent tool schemas + impls
│   │   └── agent.py           # tool loop
│   └── llm/
│       ├── base.py            # LLMProvider interface
│       ├── mock_provider.py
│       ├── groq_provider.py   # streaming + tools
│       ├── bedrock_provider.py # written, inactive
│       └── factory.py         # picks from env
└── frontend/
    ├── Dockerfile
    ├── nginx.conf             # SPA + /api reverse proxy
    └── src/
        ├── App.jsx
        ├── api/client.js
        ├── hooks/             # useChatStream, useDarkMode, ...
        ├── lib/               # categories, format, highlight
        └── components/
            ├── Header · Sidebar · FilterBar · NewsFeed · NewsCard
            ├── Pagination · Footer · StaleBanner · CommandPalette
            ├── SearchBox · ScrollTop · ChatButton · ChatDrawer
            └── chat/          # ChatMessage, ChatSidebar, ChatInput, ...
```

---

## Design principles

1. **No database, no vector store.** In-memory TTL cache, pure-Python BM25.
   Keeps the app tiny and fully self-contained.
2. **Provider abstraction.** Every AI call goes through `LLMProvider`.
   Switching models is an env change, never a code change.
3. **Grounded, cited answers.** The agent only sees retrieved items and is
   instructed to say "I couldn't find…" rather than invent.
4. **Per-feed fault isolation.** A failing RSS feed never breaks the app —
   other feeds still return and `last_errors` in `/api/health` reports it.
5. **Local-first UI.** All state (bookmarks, recents, sessions, theme,
   density) lives in `localStorage`. No accounts, no cookies, no tracking.

---

## License

Unofficial community project. Not affiliated with or endorsed by Amazon Web
Services. AWS, Amazon Bedrock, and related names are trademarks of Amazon.com,
Inc.
