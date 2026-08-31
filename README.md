# Vectorizer Dashboard

Next.js 14 + Tailwind + shadcn — ops UI for [Vectorizer](../vectorizer) (semantic memory) + ChromaDB + Vault. Server-only secrets, mobile-first, Tailscale-ready.

**Live:** `https://alfirusdesktop.tail9c59fb.ts.net/dashboard` → `http://localhost:8092` (Tailscale Serve `https 443 → 8092`). LAN `192.168.0.113:8092`.

## Pages

| Route | What | Key details |
|-------|------|-------------|
| `/dashboard` | Overview | Health (`8091/health` + Chroma `heartbeat`), vault stats (68 files/1201 chunks/1419 nodes), workspace proportions, recent vault activity. Mobile: frosted header + bottom tabs, desktop: fixed sidebar `240px`. |
| `/dashboard/workspaces` | Workspaces | `GET /workspaces` + per-collection `GET /collections/:id/count` → `ws_maisarah 1556` etc. (Chroma list has no count; we fetch `count` per id). Creates/deletes workspaces. |
| `/dashboard/vault` | Vault explorer | `GET /api/vault?action=stats|files|tree|graph` → `00-index/MEMORY_INDEX.json + GRAPH.json`. Dry-run diff, reindex trigger. |
| `/dashboard/search` | Semantic search | `POST /messages/search` with workspace filter + `where.hybrid=true` toggle, highlight + copy per hit, latency sparkline. |
| `/dashboard/rag` | Ask RAG | `POST /api/brain` → Vectorizer search (5 sources) → LM Studio `qwen3.6-35b` streaming; strips `<think>` + falls back to synth answer from context when LM cold (12s race → `Masfirah Lina Alfiqah` etc). Sources collapsible with copy. |
| `/dashboard/embeddings` | Embeddings | `GET /collections` + `GET .../collections/:id/get` with `include=embeddings,documents,metadatas`. Dimension + sample vectors. |
| `/dashboard/graph` | Knowledge graph | `GRAPH.json` nodes/edges → `recharts` force-ish + BFS neighbors; stats 1419/7479. |
| `/dashboard/analytics` | Analytics | `GET /search/analytics` + workspace doc distribution + query latency bars. |
| `/dashboard/settings` | Settings | **Cron schedules** (reindex 1h, backup 7d 03:00, health 5m) — `ON/OFF` + cron expr → `cron_schedules.json` (host `hermes cron` owns execution). **Telegram** (`ALERT_TELEGRAM_BOT_TOKEN/CHAT_ID`) + **Email SMTP** (`ALERT_EMAIL_TO/FROM`, `SMTP_HOST/PORT/USER/PASS` — Gmail App Password) + **Backup retention**. All writes to `C:/Users/alfir/vectorizer/.env` server-side, secrets masked in UI. |

## Stack & Ports

- Next.js 14 (App Router), Tailwind `bg-background #0a0a0f / card #12121a / primary #7c3aed`, `Inter + JetBrains Mono`, `lucide-react`, `recharts`.
- Proxies (server-only keys): `app/api/vectorizer/[...path]` → `http://vectorizer:8091/api/v1/*` (+ `X-API-Key`), `app/api/chroma/[...path]` → Chroma `8000/api/v2/*`, `app/api/brain` → Vectorizer search + LM Studio, `app/api/vault|graph|settings|admin/reindex`.
- Vectorizer `8091`, Chroma `8100`, LM Studio `1234`, Dashboard `8092`. Docker `vectorizer:8091` inside, `host.docker.internal:1234` for LM Studio.

## Env (Dashboard)

In `C:/Users/alfir/vectorizer/.env` (compose `env_file` for `vectorizer`, `environment:` interpolation for `dashboard`):

```
VECTORIZER_API_KEY= / DEFAULT_API_KEY=vectorizer-local-key
LM_STUDIO_API_KEY=  LM_STUDIO_URL= / OAI_COMPATIBLE_URL=http://host.docker.internal:1234/v1
LLM_MODEL=qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive
# Alerts + retention (also editable in /dashboard/settings)
ALERT_TELEGRAM_BOT_TOKEN=  ALERT_TELEGRAM_CHAT_ID=
ALERT_EMAIL_TO=alfirus@gmail.com  ALERT_EMAIL_FROM=vectorizer@alfirus.my
SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=  SMTP_PASS=
BACKUP_RETENTION_DAYS=7  REINDEX_SCHEDULE=0 * * * *
VAULT_ROOT=/data/ai  GRAPH_PATH=/data/ai/maisarah/vault/00-index/GRAPH.json
```

Never expose `ALERT_* / SMTP_* / API_KEY` client-side — read only via `process.env` in `app/api/*` route handlers.

## Cron (host)

Owned by Hermes `hermes cron` (not dashboard Docker — it has no `hermes` binary):

```
vectorizer-reindex-1h  0 * * * *   → vectorizer_reindex.py  (hourly diff)
vectorizer-backup-daily 0 3 * * *  → vectorizer_backup.py  (tar + prune 7d → SynologyDrive/ai/backups/vectorizer/)
vectorizer-health-5m   */5 * * * * → vectorizer_healthcheck.py (8091/8100/8092/1234, docker restart + tailscale serve, email+TG via .env)
```

`vectorizer_healthcheck.py` reads `ALERT_* + SMTP_*` from Vectorizer `.env` for `smtplib` + `Bot API` alerts. `Settings → Save` persists cron desires to `C:/Users/alfir/vectorizer/cron_schedules.json`.

## Mobile

`app/layout.tsx` `viewport: device-width`, `Shell` = `flex-col` on mobile (header `56px` full-bleed) + `lg:flex-row` (sidebar `240px`), `Sidebar` = top bar + 5-item bottom tabs (`safe-bottom`) + drawer `300px slideIn` with all 8 + Settings. `globals.css` `input min-h 44px, button min-h 44px, font 16px` to avoid iOS zoom. `StatCard` + pages use `rounded-2xl shadow-card` + `grid-cols-1 lg:grid-cols-2` responsive.

## Security

`next.config.js` `output: standalone` + headers: `X-Frame-Options DENY, CSP frame-ancestors none, X-Content-Type-Options nosniff, Cache-Control no-store` on `/api/*`. CORS via Vectorizer `CORS_ALLOWED_ORIGINS=*` (Tailscale/mobile). Rate limit `50/s` API-key bucket for vault reindex bursts.

## Quick start

```bash
cd C:/Users/alfir/vectorizer && docker compose up -d
# curl http://localhost:8091/api/v1/health  # nomic 768d, space cosine
# curl http://localhost:8092/ -I  # X-Frame-Options: DENY
# Settings: open /dashboard/settings, fill Telegram SMTP, Save
```

## Structure

```
vectorizer-dashboard/
├── app/
│   ├── api/
│   │   ├── brain/route.ts          # RAG: search + LM Studio streaming + synth fallback
│   │   ├── chroma/[...path]/route.ts # Chroma proxy
│   │   ├── vectorizer/[...path]/route.ts # Vectorizer proxy
│   │   ├── vault/route.ts          # Stats/files/tree/graph from /data/ai
│   │   ├── graph/route.ts
│   │   ├── admin/reindex/route.ts  # vault_index.py runner
│   │   └── settings/route.ts       # Reads/writes Vectorizer .env + cron_schedules.json (masked)
│   ├── dashboard/
│   │   ├── page.tsx                # Overview
│   │   ├── workspaces/page.tsx     # Counts via /count per collection
│   │   ├── vault/page.tsx          # Card grid + bottom-sheet preview
│   │   ├── search/page.tsx         # Highlight + measure sparkline
│   │   ├── rag/page.tsx            # 100dvh streaming + quick prompts
│   │   ├── embeddings/page.tsx
│   │   ├── graph/page.tsx
│   │   ├── analytics/page.tsx
│   │   └── settings/page.tsx       # Cron + Telegram + SMTP + retention
│   ├── layout.tsx                  # Viewport device-width, Inter
│   └── globals.css                 # 44px taps, 16px ios
├── components/Sidebar.tsx          # Top bar + bottom tabs + drawer, Settings entry
├── components/Shell.tsx            # flex-col mobile, flex-row desktop
├── components/StatCard.tsx
├── lib/api.ts                      # PROXY /api/vectorizer, CHROMA_PROXY /api/chroma; getWorkspaces() enriches via /count
└── lib/types.ts
```
