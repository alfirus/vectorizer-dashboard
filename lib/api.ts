import type {
  HealthResponse,
  Workspace,
  WorkspaceStats,
  SearchResponse,
  BrainResponse,
  ChromaCollection,
  ChromaGetResponse,
} from "./types";

const VECTORIZER_URL = "http://localhost:8091";
const CHROMA_URL = "http://localhost:8100";
const API_KEY = "vectorizer-local-key";
const CHROMA_TENANT = "default_tenant";
const CHROMA_DB = "default_database";

const vHeaders = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

// ── Vectorizer API ──────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/health`);
  return res.json();
}

export async function getWorkspaces(): Promise<{ workspaces: Workspace[] }> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces`, {
    headers: vHeaders,
  });
  return res.json();
}

export async function getWorkspaceStats(
  workspaceId: string
): Promise<WorkspaceStats> {
  const res = await fetch(
    `${VECTORIZER_URL}/api/v1/workspaces/${workspaceId}/stats`,
    { headers: vHeaders }
  );
  return res.json();
}

export async function getMessages(
  workspaceId: string,
  sessionId?: string,
  limit = 50,
  offset = 0
) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    limit: String(limit),
    offset: String(offset),
  });
  if (sessionId) params.set("session_id", sessionId);
  const res = await fetch(
    `${VECTORIZER_URL}/api/v1/messages?${params}`,
    { headers: vHeaders }
  );
  return res.json();
}

export async function searchMessages(
  query: string,
  workspaceId: string,
  nResults = 10
): Promise<SearchResponse> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
    method: "POST",
    headers: vHeaders,
    body: JSON.stringify({
      query,
      workspace_id: workspaceId,
      n_results: nResults,
    }),
  });
  return res.json();
}

export async function brainAsk(
  question: string,
  workspaceId: string
): Promise<BrainResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000); // 10 min for 35B
  try {
    const res = await fetch(`${VECTORIZER_URL}/api/v1/brain/ask`, {
      method: "POST",
      headers: vHeaders,
      body: JSON.stringify({ question, workspace_id: workspaceId }),
      signal: controller.signal,
    });
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── ChromaDB API (direct, for raw vectors) ─────────────────────

export async function getCollections(): Promise<ChromaCollection[]> {
  const res = await fetch(
    `${CHROMA_URL}/api/v2/tenants/${CHROMA_TENANT}/databases/${CHROMA_DB}/collections`
  );
  return res.json();
}

export async function getCollectionVectors(
  collectionId: string,
  limit = 500
): Promise<ChromaGetResponse> {
  const res = await fetch(
    `${CHROMA_URL}/api/v2/tenants/${CHROMA_TENANT}/databases/${CHROMA_DB}/collections/${collectionId}/get?limit=${limit}&include=embeddings,documents,metadatas`
  );
  return res.json();
}
