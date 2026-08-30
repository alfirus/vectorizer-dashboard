# Vectorizer Dashboard Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a Next.js dashboard to visualize Vectorizer semantic memory — workspaces, messages, search, RAG Q&A, embedding cluster maps, and analytics charts.

**Architecture:** Next.js 14 App Router frontend, connects to two local APIs:
- Vectorizer API (`localhost:8091`) — messages, search, brain/RAG, workspaces
- ChromaDB API (`localhost:8100`) — raw vectors for embedding visualization

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Recharts, react-plotly.js (scatter plots for t-SNE/UMAP), date-fns

---

## Data Sources

| Data | Source | Endpoint |
|------|--------|----------|
| Health/status | Vectorizer | `GET /api/v1/health` |
| Workspaces | Vectorizer | `GET /api/v1/workspaces` |
| Workspace stats | Vectorizer | `GET /api/v1/workspaces/:id/stats` |
| Messages | Vectorizer | `GET /api/v1/messages?workspace_id=:id&session_id=:sid` |
| Store message | Vectorizer | `POST /api/v1/messages` |
| Search | Vectorizer | `POST /api/v1/messages/search` |
| RAG Ask | Vectorizer | `POST /api/v1/brain/ask` |
| Summarize | Vectorizer | `POST /api/v1/brain/summarize` |
| Raw vectors | ChromaDB | `GET /api/v2/tenants/{tenant}/databases/{db}/collections/{id}/get` |
| Collection info | ChromaDB | `GET /api/v2/tenants/{tenant}/databases/{db}/collections` |

---

## Task 1: Scaffold Next.js Project

**Objective:** Create the Next.js project with all dependencies installed.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\package.json`
- Create: `C:\Users\alfir\vectorizer-dashboard\tsconfig.json`
- Create: `C:\Users\alfir\vectorizer-dashboard\next.config.js`
- Create: `C:\Users\alfir\vectorizer-dashboard\tailwind.config.ts`
- Create: `C:\Users\alfir\vectorizer-dashboard\postcss.config.js`
- Create: `C:\Users\alfir\vectorizer-dashboard\app\globals.css`
- Create: `C:\Users\alfir\vectorizer-dashboard\app\layout.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\app\page.tsx`

**Step 1:** Create package.json with dependencies:
```json
{
  "name": "vectorizer-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 8092",
    "build": "next build",
    "start": "next start -p 8092"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0",
    "plotly.js-dist-min": "^2.35.0",
    "react-plotly.js": "^2.6.0",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

**Step 2:** Create tsconfig.json, next.config.js, tailwind.config.ts, postcss.config.js (standard configs).

**Step 3:** Create `app/globals.css` with Tailwind directives.

**Step 4:** Create `app/layout.tsx` with dark theme, Inter font, sidebar nav.

**Step 5:** Create `app/page.tsx` as redirect to `/dashboard`.

**Step 6:** Run `npm install` and `npm run dev` to verify.

**Verification:** `npm run dev` starts on port 8092, page loads in browser.

---

## Task 2: API Client Library

**Objective:** Create a typed API client for both Vectorizer and ChromaDB.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\lib\api.ts`
- Create: `C:\Users\alfir\vectorizer-dashboard\lib\types.ts`

**Step 1:** Define TypeScript types in `lib/types.ts`:
- `HealthResponse`, `Workspace`, `WorkspaceStats`
- `Message`, `SearchResult`, `BrainResponse`
- `ChromaCollection`, `ChromaGetResponse`

**Step 2:** Create `lib/api.ts` with two clients:
- `vectorizerApi` — all Vectorizer endpoints (health, workspaces, messages, search, brain)
- `chromaApi` — ChromaDB endpoints (collections, get vectors)

**Step 3:** Test by importing in a page and logging output.

**Verification:** Types compile, API calls return data.

---

## Task 3: Layout with Sidebar Navigation

**Objective:** Build the app shell with sidebar nav and dark theme.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\components\Sidebar.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\components\Shell.tsx`
- Modify: `C:\Users\alfir\vectorizer-dashboard\app\layout.tsx`

**Step 1:** Create `Shell.tsx` — dark background, sidebar + main content area.

**Step 2:** Create `Sidebar.tsx` with nav links:
- 📊 Dashboard (overview)
- 🗂️ Workspaces
- 🔍 Search
- 💬 RAG Q&A
- 🧬 Embeddings
- 📈 Analytics

**Step 3:** Update `layout.tsx` to use Shell.

**Step 4:** Create placeholder pages for each route.

**Verification:** Sidebar renders, links navigate between placeholder pages.

---

## Task 4: Dashboard Overview Page

**Objective:** Show health status, workspace stats, and recent activity.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\page.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\components\StatCard.tsx`

**Step 1:** Create `StatCard.tsx` — displays a metric with label and value.

**Step 2:** Build dashboard page:
- Health status card (green/red indicator, version, embedding model)
- Workspace count card
- Total documents card
- LLM brain status card
- Recent activity feed (last 10 messages across all workspaces)

**Verification:** Dashboard loads with real data from Vectorizer API.

---

## Task 5: Workspaces Browser

**Objective:** List workspaces with stats, click to view messages.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\workspaces\page.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\workspaces\[id]\page.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\components\WorkspaceCard.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\components\MessageList.tsx`

**Step 1:** Workspaces list page — cards showing name, doc count, created date.

**Step 2:** Workspace detail page — messages list with pagination, role badges (user/assistant/system).

**Step 3:** MessageList component — renders messages with markdown, timestamps.

**Verification:** Can browse workspaces and see messages.

---

## Task 6: Semantic Search Page

**Objective:** Search interface with result visualization.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\search\page.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\components\SearchResultCard.tsx`

**Step 1:** Search form — query input, workspace selector, n_results slider.

**Step 2:** Results display — cards with relevance score, session ID, role, content snippet.

**Step 3:** Highlight matched terms in results.

**Verification:** Can search and see scored results.

---

## Task 7: RAG Q&A Page

**Objective:** Ask questions and get answers with source context.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\rag\page.tsx`

**Step 1:** Chat-like interface — input box, workspace selector.

**Step 2:** Display answer with sources (cited messages).

**Step 3:** Loading state for LLM processing (can take 5-7min for 35B model).

**Verification:** Can ask questions and receive answers with sources.

---

## Task 8: Embedding Visualization

**Objective:** 2D scatter plot of document embeddings with t-SNE/UMAP projection.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\embeddings\page.tsx`
- Create: `C:\Users\alfir\vectorizer-dashboard\lib\dimensionality.ts`
- Create: `C:\Users\alfir\vectorizer-dashboard\components\EmbeddingScatter.tsx`

**Step 1:** Create `lib/dimensionality.ts` — client-side t-SNE using `tsne-js` or a simple PCA implementation. Since 768d vectors are too large for browser t-SNE, use PCA to reduce to 2D first (faster, lighter).

**Step 2:** Fetch raw vectors from ChromaDB API:
```
GET /api/v2/tenants/default_tenant/databases/default_database/collections/ws_family/get?include=["embeddings","documents","metadatas"]
```

**Step 3:** `EmbeddingScatter.tsx` — plotly.js scatter plot:
- X/Y = PCA-projected dimensions
- Color = role (user/assistant/system)
- Hover = document snippet
- Click = show full message

**Step 4:** Controls — select collection, filter by role, adjust point size.

**Verification:** Scatter plot renders with real embedding data, points are colored by role.

---

## Task 9: Analytics Charts

**Objective:** Visualize workspace analytics with Recharts.

**Files:**
- Create: `C:\Users\alfir\vectorizer-dashboard\app\dashboard\analytics\page.tsx`

**Step 1:** Charts:
- **Document distribution** — bar chart of docs per workspace
- **Message roles** — pie chart of user/assistant/system messages
- **Message timeline** — line chart of messages over time (by date)
- **Workspace sizes** — horizontal bar chart

**Step 2:** All charts use dark theme consistent with the app.

**Verification:** Charts render with real data.

---

## Task 10: Polish & Deployment

**Objective:** Dark theme polish, error handling, PM2 deployment.

**Files:**
- Modify: various files for consistent dark theme
- Create: ecosystem.config.js (PM2)

**Step 1:** Consistent dark theme across all pages.

**Step 2:** Error states — API down, empty data, loading spinners.

**Step 3:** PM2 config for production.

**Step 4:** Test full flow: dashboard → workspaces → messages → search → RAG → embeddings → analytics.

**Verification:** All pages load, no console errors, PM2 keeps it running.

---

## Port Assignment

| Service | Port |
|---------|------|
| Vectorizer API | 8091 |
| ChromaDB | 8100 |
| **Dashboard** | **8092** |
| LM Studio | 1234 |

## Directory Structure

```
vectorizer-dashboard/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── dashboard/
│       ├── page.tsx              (overview)
│       ├── workspaces/
│       │   ├── page.tsx          (list)
│       │   └── [id]/page.tsx     (detail)
│       ├── search/page.tsx
│       ├── rag/page.tsx
│       ├── embeddings/page.tsx
│       └── analytics/page.tsx
├── components/
│   ├── Shell.tsx
│   ├── Sidebar.tsx
│   ├── StatCard.tsx
│   ├── WorkspaceCard.tsx
│   ├── MessageList.tsx
│   ├── SearchResultCard.tsx
│   └── EmbeddingScatter.tsx
├── lib/
│   ├── api.ts
│   ├── types.ts
│   └── dimensionality.ts
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── postcss.config.js
```
