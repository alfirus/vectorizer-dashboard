import type {
  HealthResponse,
  Workspace,
  SearchResponse,
  SearchResult,
  BrainResponse,
  ChromaCollection,
  ChromaGetResponse,
} from "./types";

const VECTORIZER_URL = "http://localhost:8091";
const CHROMA_URL = "http://localhost:8100";
const LM_STUDIO_URL = "http://localhost:1234";
const API_KEY = "vectorizer-local-key";
const LM_STUDIO_KEY = process.env.NEXT_PUBLIC_LM_STUDIO_KEY || "";
const CHROMA_TENANT = "default_tenant";
const CHROMA_DB = "default_database";

const vHeaders = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/health`);
  return res.json();
}

export async function getWorkspaces(): Promise<{ workspaces: Workspace[] }> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces`, {
    headers: vHeaders,
  });
  const data = await res.json();

  // Enrich with ChromaDB doc counts
  try {
    const collections = await getCollections();
    const colMap: Record<string, number> = {};
    for (const col of collections) {
      colMap[col.name] = col.document_count || 0;
    }
    for (const ws of data.workspaces || []) {
      ws.document_count = colMap[`ws_${ws.id}`] || 0;
    }
  } catch { /* ignore */ }

  return data;
}

export async function getMessages(
  workspaceId: string,
  sessionId?: string,
  limit = 50,
  offset = 0
) {
  const params = new URLSearchParams({ workspace_id: workspaceId, limit: String(limit), offset: String(offset) });
  if (sessionId) params.set("session_id", sessionId);
  const res = await fetch(`${VECTORIZER_URL}/api/v1/messages?${params}`, { headers: vHeaders });
  const data = await res.json();

  // Normalize: API returns {document, metadata: {role, session_id, ...}}
  const messages = (data.messages || []).map((m: Record<string, unknown>) => ({
    id: m.id,
    content: m.document || m.content,
    role: (m.metadata as Record<string, string>)?.role || "unknown",
    session_id: (m.metadata as Record<string, string>)?.session_id || "",
    workspace_id: (m.metadata as Record<string, string>)?.workspace_id || workspaceId,
    timestamp: (m.metadata as Record<string, string>)?.created_at,
  }));

  return { count: data.count, messages };
}

export async function searchMessages(
  query: string,
  workspaceId?: string,
  nResults = 5
): Promise<SearchResponse> {
  // If no workspace specified, search all workspaces and merge results
  if (!workspaceId) {
    const workspaces = ["family", "sofia", "maisarah"];
    const allResults: SearchResult[] = [];
    for (const ws of workspaces) {
      const res = await fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
        method: "POST",
        headers: vHeaders,
        body: JSON.stringify({ query, n_results: nResults, where: { workspace_id: ws } }),
      });
      const data = await res.json();
      if (data.results) allResults.push(...data.results);
    }
    // Sort by distance (lower = more relevant)
    allResults.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    return { count: allResults.length, results: allResults.slice(0, nResults) };
  }
  const where: Record<string, string> = { workspace_id: workspaceId };
  const res = await fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
    method: "POST",
    headers: vHeaders,
    body: JSON.stringify({ query, n_results: nResults, where }),
  });
  return res.json();
}

export async function brainAsk(
  question: string,
  workspaceId?: string
): Promise<BrainResponse> {
  const res = await fetch(`/api/brain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, workspaceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Brain request failed");
  }
  return res.json();
}

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
