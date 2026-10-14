# RUN / Operations Guide — AWS News Dashboard

Operational notes for running, verifying, and switching LLM providers on the
EC2 deployment. For feature/architecture details see `README.md`.

---

## Live URLs (EC2)

- Dashboard: `http://<EC2_PUBLIC_IP>` (port 80) or `http://<EC2_PUBLIC_IP>:8090`
- API health: `http://<EC2_PUBLIC_IP>/api/health`

> The frontend (nginx) serves the React build and reverse-proxies `/api/*`
> to the backend. Ports 80 and 8090 both map to the frontend container.
> Open ports 80 / 8090 in the EC2 **security group** for external access.

---

## Run / restart / stop

```bash
cd ~/aws-news-feed

# start (reuses built images)
docker compose up -d

# rebuild after code changes, then start
docker compose build && docker compose up -d

# status / logs
docker compose ps
docker logs aws-news-backend  --tail 50
docker logs aws-news-frontend --tail 50

# stop
docker compose down
```

Containers run with `restart: unless-stopped`, so they survive reboots.
Port remapping (frontend → 80 + 8090) lives in `docker-compose.override.yml`,
picked up automatically by `docker compose`.

---

## LLM providers

The app is provider-agnostic. Switch by editing `backend/.env` then
`docker compose up -d` (backend restarts). **No code changes needed.**

| Mode | `backend/.env` settings | Needs |
|------|-------------------------|-------|
| Mock (offline, default) | `LLM_PROVIDER=local`, `LOCAL_LLM_MODE=mock` | nothing |
| Groq | `LLM_PROVIDER=local`, `LOCAL_LLM_MODE=groq`, `GROQ_API_KEY=...` | Groq API key |
| Bedrock Nova | `LLM_PROVIDER=bedrock` | IAM role + Nova model access |

### Switch to Groq
```bash
cd ~/aws-news-feed
sed -i 's/^LOCAL_LLM_MODE=.*/LOCAL_LLM_MODE=groq/' backend/.env
# set your key (replace XX... )
sed -i 's#^GROQ_API_KEY=.*#GROQ_API_KEY=gsk_XXXXXXXX#' backend/.env
docker compose up -d
curl -s http://localhost/api/health   # llm.name should be "groq"
```

### Switch to AWS Bedrock Nova
Prerequisites (done once in AWS, cannot be done from the instance without creds):
1. **Attach an IAM role** to this EC2 instance with:
   - `bedrock:InvokeModel`
   - `bedrock:InvokeModelWithResponseStream`
2. **Enable model access** for Amazon Nova Lite + Pro in the Bedrock console
   (region must match `AWS_REGION`, default `us-east-1`).

Then on the instance:
```bash
cd ~/aws-news-feed
sed -i 's/^LLM_PROVIDER=.*/LLM_PROVIDER=bedrock/' backend/.env
# optional: pick models (defaults shown)
#   BEDROCK_CHAT_MODEL_ID=amazon.nova-pro-v1:0
#   BEDROCK_SEARCH_MODEL_ID=amazon.nova-lite-v1:0
#   AWS_REGION=us-east-1
docker compose up -d
curl -s http://localhost/api/health   # llm.name should be "bedrock"
```

Verify Bedrock access is actually available before switching:
```bash
docker exec aws-news-backend python -c "import boto3; print(boto3.client('sts').get_caller_identity()['Arn'])"
```
If that errors with "Unable to locate credentials", the IAM role is not
attached yet — stay on mock/groq until it is.

---

## Feature: downloadable infographic (one-pager PDF)

Each news card has a **Download** action that generates a branded one-page
infographic PDF for that announcement.

- Endpoint: `GET /api/infographic/<item_id>`
- The active LLM provider distills the item into structured content
  (headline, subhead, key points, stats, who-it's-for); `reportlab` renders
  the PDF. A deterministic fallback guarantees a valid PDF even if the LLM
  output is unparseable.
- Quality scales with the provider: mock = basic, Groq/Bedrock = richer copy.

Quick test:
```bash
ID=$(curl -s "http://localhost/api/news?limit=1" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])")
curl -s -o /tmp/info.pdf -w "%{http_code} %{content_type}\n" "http://localhost/api/infographic/$ID"
```

---

## Health & smoke checks

```bash
# backend health (provider in use, cache state, feed errors)
curl -s http://localhost/api/health

# news feed
curl -s "http://localhost/api/news?limit=3"

# agentic chat stream (SSE): sources -> tool_call -> tool_result -> tokens
curl -s -N -X POST http://localhost/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"question":"What is new with Amazon Bedrock?"}' | head -20
```

---

## Notes / gotchas

- The public IP changes if the instance is stopped/started unless an Elastic
  IP is attached — update the URL you share accordingly.
- The app is unauthenticated; close the security-group ports when a demo is
  done, or restrict Source to specific IPs.
- `CORS_ORIGINS` in `backend/.env` must include the host/port the browser uses.
