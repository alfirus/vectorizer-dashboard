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
const LM_STUDIO_KEY = "sk-lm-M5poAGT7x0H2W2Wdr6eFa9Ip8d8";
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
  // Step 1: Get context from Vectorizer search (no workspace = search all)
  const searchRes = await searchMessages(question, workspaceId, 5);
  const context = (searchRes.results || [])
    .map((r) => r.document)
    .join("\n");

  // Step 2: Call LM Studio directly (Vectorizer brain timeout too short at 12s)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000); // 10 min
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LM_STUDIO_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive",
        messages: [
          {
            role: "system",
            content:
              "You are an assistant answering questions based on the provided memory context. Use only information from the context when possible. If the answer is not in the context, say so.",
          },
          {
            role: "user",
            content: `Context:\n${context}\n\nQuestion: ${question}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content || "No answer returned.";
    const sources = (searchRes.results || []).map((r) => ({
      content: r.document,
      score: r.score,
    }));
    return { answer, sources };
  } finally {
    clearTimeout(timeout);
  }
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
