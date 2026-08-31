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
  // If no workspace specified, search all workspaces in parallel
  if (!workspaceId) {
    const workspaces = ["family", "sofia", "maisarah"];
    const searchPromises = workspaces.map((ws) =>
      fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
        method: "POST",
        headers: vHeaders,
        body: JSON.stringify({ query, n_results: nResults, where: { workspace_id: ws } }),
      }).then((r) => r.json())
    );
    const results = await Promise.all(searchPromises);
    const allResults: SearchResult[] = [];
    for (const data of results) {
      if (data.results) allResults.push(...data.results);
    }
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

// ---- Streaming brain API ----

/** SSE event types returned by /api/brain */
export type BrainStreamEvent =
  | { type: "sources"; sources: { content: string; score: number }[] }
  | { type: "chunk"; content: string }
  | { type: "error"; error: string };

/**
 * Stream brain answer via SSE. Yields parsed events as they arrive.
 * Usage:
 *   for await (const event of brainAskStream(question, workspaceId)) {
 *     if (event.type === "chunk") appendText(event.content);
 *     if (event.type === "sources") setSources(event.sources);
 *   }
 */
export async function* brainAskStream(
  question: string,
  workspaceId?: string
): AsyncGenerator<BrainStreamEvent> {
  const res = await fetch("/api/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, workspaceId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Brain request failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload) as BrainStreamEvent;
        yield parsed;
      } catch {
        // skip malformed
      }
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ")) {
      const payload = trimmed.slice(6);
      if (payload !== "[DONE]") {
        try {
          const parsed = JSON.parse(payload) as BrainStreamEvent;
          yield parsed;
        } catch { /* skip */ }
      }
    }
  }
}

/**
 * Non-streaming brain API (kept for backward compatibility).
 */
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

export async function createWorkspace(name: string): Promise<{ workspace: Workspace }> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces`, {
    method: "POST",
    headers: vHeaders,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create workspace failed: ${res.status}`);
  return res.json();
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces/${id}`, {
    method: "DELETE",
    headers: vHeaders,
  });
  if (!res.ok) throw new Error(`Delete workspace failed: ${res.status}`);
}

export async function addMessage(
  workspaceId: string,
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/messages`, {
    method: "POST",
    headers: vHeaders,
    body: JSON.stringify({ workspace_id: workspaceId, session_id: sessionId, role, content }),
  });
  if (!res.ok) throw new Error(`Add message failed: ${res.status}`);
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

// ---- New API functions for Phase 3 ----

export async function searchAllWorkspaces(
  query: string,
  nResults = 10
): Promise<SearchResponse> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/messages/search/all`, {
    method: "POST",
    headers: vHeaders,
    body: JSON.stringify({ query, n_results: nResults }),
  });
  return res.json();
}

export async function getWorkspaceHealth(
  workspaceId: string
): Promise<WorkspaceHealth> {
  const res = await fetch(
    `${VECTORIZER_URL}/api/v1/workspaces/${workspaceId}/health`,
    { headers: vHeaders }
  );
  return res.json();
}

export async function getSearchAnalytics(): Promise<SearchAnalytics> {
  const res = await fetch(`${VECTORIZER_URL}/api/v1/messages/analytics`, {
    headers: vHeaders,
  });
  return res.json();
}
