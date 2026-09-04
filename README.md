# Vectorizer Dashboard

Next.js 14 + Tailwind + shadcn — ops UI for [Vectorizer](../vectorizer) (semantic memory) + ChromaDB + Vault. Server-only secrets, mobile-first, Tailscale-ready.

## Live

- **Local:** `http://localhost:8092`
- **Tailscale:** `https://alfirusdesktop.tail9c59fb.ts.net/dashboard`
- **Production:** `https://vectorizer.alfirus.my` (Cloudflare proxied, nginx basic auth)

## Features

- **Overview** — Health (`8091/health` + Chroma `heartbeat`), vault stats (68 files/1201 chunks/1419 nodes), workspace proportions, recent vault activity
- **Workspaces** — `GET /workspaces` + per-collection `GET /collections/:id/count` → workspace document counts. Creates/deletes workspaces.
- **Vault explorer** — `GET /api/vault?action=stats|files|tree|graph` → `MEMORY_INDEX.json + GRAPH.json`. Dry-run diff, reindex trigger with **real-time SSE progress bar**.
- **Semantic search** — `POST /messages/search` with workspace filter + `where.hybrid=true` toggle, highlight + copy per hit, latency sparkline.
- **Ask RAG** — `POST /api/brain` → single-workspace Vectorizer search (floored, merged) → LM Studio `qwen3.6-35b` streaming; strips `<think>`, **abstains when nothing passes the relevance floor** instead of confabulating, falls back to synth answer from context when LM cold (no regex name-injection — that class of bug is dead). Sources collapsible with copy.
- **Embeddings** — `GET /collections` + `GET .../collections/:id/get` with `include=embeddings,documents,metadatas`. Dimension + sample vectors.
- **Knowledge graph** — `GRAPH.json` nodes/edges → `recharts` force-ish + BFS neighbors; stats 1419/7479.
- **Provenance + code index via proxy** — no dedicated pages yet, but the generic `app/api/vectorizer/[...path]` proxy forwards everything: `GET conclusions/trace|stale|brief`, `PUT messages/:id {sections}`, `POST code/index`, `GET code/symbols|callers` all work through `/api/vectorizer/...` today (e.g. `GET /api/vectorizer/conclusions/brief?workspace_id=family`).
- **Analytics** — `GET /search/analytics` + workspace doc distribution + query latency bars.
- **Settings** — **Cron schedules** (reindex 1h, backup 7d 03:00, health 5m) — `ON/OFF` + cron expr → `cron_schedules.json`. **Telegram** alerts + **Email SMTP** + **Backup retention**. All writes to Vectorizer `.env` server-side, secrets masked in UI.

## Pages

| Route | What | Key details |
|-------|------|-------------|
| `/dashboard` | Overview | Health, vault stats, workspace proportions |
| `/dashboard/workspaces` | Workspaces | Document counts, create/delete |
| `/dashboard/vault` | Vault explorer | File grid, dry-run, reindex with SSE progress bar |
| `/dashboard/search` | Semantic search | Workspace filter, hybrid toggle, highlight + copy |
| `/dashboard/rag` | Ask RAG | Streaming LLM, source citations |
| `/dashboard/embeddings` | Embeddings | Dimension + sample vectors |
| `/dashboard/graph` | Knowledge graph | Force graph, BFS neighbors |
| `/dashboard/analytics` | Analytics | Latency bars, doc distribution |
| `/dashboard/settings` | Settings | Cron, Telegram, SMTP, retention |

## Stack & Ports

- **Next.js 14** (App Router), Tailwind `bg-background #0a0a0f / card #12121a / primary #7c3aed`, `Inter + JetBrains Mono`, `lucide-react`, `recharts`
- **Proxies** (server-only keys): `app/api/vectorizer/[...path]` → `http://vectorizer:8091/api/v1/*` (+ `X-API-Key`), `app/api/chroma/[...path]` → Chroma `8000/api/v2/*`, `app/api/brain` → Vectorizer search + LM Studio, `app/api/vault|graph|settings|admin/reindex`
- **Ports:** Vectorizer `8091`, Chroma `8100` (local) / `8102` (server), LM Studio `1234`, Dashboard `8092`
- **Docker:** `vectorizer:8091` inside, `host.docker.internal:1234` for LM Studio

## Quick Start

### Local Development

```bash
cd vectorizer-dashboard
npm install
npm run dev
# Open http://localhost:3000
```

### Docker (with Vectorizer stack)

```bash
cd vectorizer
docker compose up -d
# Dashboard at http://localhost:8092
```

### Server Deployment

```bash
# Clone on server
git clone https://github.com/alfirus/vectorizer-dashboard.git /opt/vectorizer-dashboard
cd /opt/vectorizer-dashboard

# Create .env.local
cat > .env.local << 'EOF'
VECTORIZER_URL=http://vectorizer:8091/api/v1
VECTORIZER_API_KEY=vectorizer-local-key
CHROMA_URL=http://chromadb:8000
LM_STUDIO_URL=http://100.121.188.113:1234/v1
LLM_MODEL=qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive
VAULT_ROOT=/data/ai
GRAPH_PATH=/data/ai/maisarah/vault/00-index/GRAPH.json
EOF

# Build and start
docker compose -f /opt/vectorizer/docker-compose.server.yml up -d --build dashboard
```

**⚠️ Important:** After code changes, you must rebuild the container:

```bash
docker compose -f /opt/vectorizer/docker-compose.server.yml up -d --build --force-recreate --no-deps dashboard
```

A simple `docker compose restart` does NOT pick up code changes — Next.js standalone bundles need rebuilding.

## Env (Dashboard)

In `.env.local` or via Docker `environment:`:

```
VECTORIZER_URL=http://vectorizer:8091/api/v1
VECTORIZER_API_KEY=vectorizer-local-key
CHROMA_URL=http://chromadb:8000
LM_STUDIO_URL=http://host.docker.internal:1234/v1
LM_STUDIO_KEY=
LLM_MODEL=qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive
VAULT_ROOT=/data/ai
GRAPH_PATH=/data/ai/maisarah/vault/00-index/GRAPH.json
# Alerts + retention (also editable in /dashboard/settings)
ALERT_TELEGRAM_BOT_TOKEN=
ALERT_TELEGRAM_CHAT_ID=
ALERT_EMAIL_TO=alfirus@gmail.com
ALERT_EMAIL_FROM=vectorizer@alfirus.my
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
BACKUP_RETENTION_DAYS=7
```

Never expose `ALERT_* / SMTP_* / API_KEY` client-side — read only via `process.env` in `app/api/*` route handlers.

## Cron (host)

Owned by Hermes `hermes cron` (not dashboard Docker — it has no `hermes` binary):

```
vectorizer-reindex-1h   0 * * * *    → vectorizer_reindex.py   (hourly diff)
vectorizer-backup-daily 0 3 * * *    → vectorizer_backup.py    (tar + prune 7d)
vectorizer-health-5m    */5 * * * *  → vectorizer_healthcheck.py (health + docker restart)
```

`vectorizer_healthcheck.py` reads `ALERT_* + SMTP_*` from Vectorizer `.env` for alerts. `Settings → Save` persists cron desires to `cron_schedules.json`.

## Vault Reindex (SSE Progress Bar)

The vault page features a real-time progress bar powered by Server-Sent Events:

**Backend** (`app/api/admin/reindex/route.ts`):
- Spawns `python3 vault_index.py` with `spawn()` (not `execFile`)
- Streams stdout line-by-line via `ReadableStream`
- Parses progress from script output:
  - `found N markdown files` → total file count
  - `[workspace file imp=N] path hash=... chunks=N` → per-file progress (dry-run)
  - `indexed path: +N chunks` → per-file progress (actual indexing)
  - `Done: indexed N files, M chunks` → completion
- Sends SSE events: `phase`, `log`, `progress`, `vault_done`, `done`, `error`

**Frontend** (`app/dashboard/vault/page.tsx`):
- Uses `fetch()` + `ReadableStream` reader (not `EventSource` — needed for POST)
- Animated gradient progress bar (`bg-gradient-to-r from-emerald-500 to-cyan-500`)
- Status text, file count, chunk count, percentage
- "Done" button on completion
- Expandable log viewer for raw output

**API:**
```bash
# Dry run (preview)
POST /api/admin/reindex?workspace=maisarah
Accept: text/event-stream
Content-Type: application/json
{"dryRun": true}

# Actual reindex
POST /api/admin/reindex?workspace=maisarah
Accept: text/event-stream
Content-Type: application/json
{"dryRun": false}

# Options
{"dryRun": false, "limit": 10}       # index max 10 files
{"dryRun": false, "reindex": true}   # force reindex all (ignore hash cache)
{"dryRun": false, "workspace": "maisarah"}  # filter by workspace
```

## Security

- `next.config.js` `output: standalone` + headers: `X-Frame-Options DENY, CSP frame-ancestors none, X-Content-Type-Options nosniff, Cache-Control no-store` on `/api/*`
- CORS via Vectorizer `CORS_ALLOWED_ORIGINS=*` (Tailscale/mobile)
- Rate limit `50/s` API-key bucket for vault reindex bursts
- **Nginx basic auth** on production (`vectorizer.alfirus.my`)
- All secrets server-side only — never exposed to browser

## Mobile

- `app/layout.tsx` `viewport: device-width`
- `Shell` = `flex-col` on mobile (header `56px` full-bleed) + `lg:flex-row` (sidebar `240px`)
- `Sidebar` = top bar + 5-item bottom tabs (`safe-bottom`) + drawer `300px slideIn` with all 8 pages + Settings
- `globals.css` `input min-h 44px, button min-h 44px, font 16px` to avoid iOS zoom
- `StatCard` + pages use `rounded-2xl shadow-card` + `grid-cols-1 lg:grid-cols-2` responsive

## Structure

```
vectorizer-dashboard/
├── app/
│   ├── api/
│   │   ├── brain/route.ts              # RAG: search + LM Studio streaming + synth fallback
│   │   ├── chroma/[...path]/route.ts   # Chroma proxy
│   │   ├── vectorizer/[...path]/route.ts # Vectorizer proxy
│   │   ├── vault/route.ts              # Stats/files/tree/graph from /data/ai
│   │   ├── graph/route.ts
│   │   ├── admin/reindex/route.ts      # SSE streaming vault reindex
│   │   └── settings/route.ts           # Reads/writes Vectorizer .env + cron_schedules.json
│   ├── dashboard/
│   │   ├── page.tsx                    # Overview
│   │   ├── workspaces/page.tsx         # Counts via /count per collection
│   │   ├── vault/page.tsx              # Card grid + reindex progress bar
│   │   ├── search/page.tsx             # Highlight + measure sparkline
│   │   ├── rag/page.tsx                # 100dvh streaming + quick prompts
│   │   ├── embeddings/page.tsx
│   │   ├── graph/page.tsx
│   │   ├── analytics/page.tsx
│   │   └── settings/page.tsx           # Cron + Telegram + SMTP + retention
│   ├── layout.tsx                      # Viewport device-width, Inter
│   └── globals.css                     # 44px taps, 16px ios
├── components/Sidebar.tsx              # Top bar + bottom tabs + drawer
├── components/Shell.tsx                # flex-col mobile, flex-row desktop
├── components/StatCard.tsx
├── lib/api.ts                          # PROXY /api/vectorizer, CHROMA_PROXY /api/chroma
├── lib/types.ts
├── Dockerfile                          # Multi-stage: deps → builder → runner (Alpine + python3)
└── .env.local                          # Server-only secrets
```

## License

MIT
