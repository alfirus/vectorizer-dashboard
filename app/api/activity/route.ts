import { NextResponse } from "next/server";

const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://localhost:8091";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
  "X-Source": "dashboard",
};

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${VECTORIZER_URL}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function parseMetrics(text: string) {
  const metrics = { messages_added: 0, searches_total: 0, deriver_drops: 0, deriver_queue_depth: 0 };
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const match = line.match(/^(\w+)\s+(\d+)/);
    if (match) {
      const [, key, val] = match;
      if (key === "vectorizer_messages_total") metrics.messages_added = Number(val);
      else if (key === "vectorizer_searches_total") metrics.searches_total = Number(val);
      else if (key === "vectorizer_deriver_drops_total") metrics.deriver_drops = Number(val);
      else if (key === "vectorizer_deriver_queue_depth") metrics.deriver_queue_depth = Number(val);
    }
  }
  return metrics;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch all data in parallel
    const [healthRes, metricsRes, workspacesRes, sessionsRes, webhooksRes, keysRes] = await Promise.allSettled([
      fetchJSON<any>("/api/v1/health"),
      fetch(`${VECTORIZER_URL}/api/v1/metrics`, { headers, cache: "no-store" }).then(r => r.text()),
      fetchJSON<{ workspaces: any[] }>("/api/v1/workspaces"),
      fetchJSON<{ sessions: any[] }>("/api/v1/sessions").catch(() => ({ sessions: [] })),
      fetchJSON<{ webhooks: any[] }>("/api/v1/webhooks").catch(() => ({ webhooks: [] })),
      fetchJSON<{ keys: any[] }>("/api/v1/keys").catch(() => ({ keys: [] })),
    ]);

    const health = healthRes.status === "fulfilled" ? healthRes.value : { status: "error", chromadb: "unknown", embedding_model: "unknown", llm_enabled: false, name: "unknown", version: "0" };
    const metrics = metricsRes.status === "fulfilled" ? parseMetrics(metricsRes.value) : { messages_added: 0, searches_total: 0, deriver_drops: 0, deriver_queue_depth: 0 };
    const workspaces = workspacesRes.status === "fulfilled" ? (workspacesRes.value.workspaces || []) : [];
    const sessions = sessionsRes.status === "fulfilled" ? (sessionsRes.value.sessions || []) : [];
    const webhooks = webhooksRes.status === "fulfilled" ? (webhooksRes.value.webhooks || []) : [];
    const apiKeys = keysRes.status === "fulfilled" ? (keysRes.value.keys || []) : [];

    // Fetch recent messages from all workspaces (last 5 per workspace)
    const allMessages: any[] = [];
    const wsFetches = workspaces.map(async (ws: any) => {
      try {
        const data = await fetchJSON<{ messages: any[] }>(
          `/api/v1/messages?workspace_id=${ws.id}&limit=5&offset=0`
        );
        return (data.messages || []).map((m: any) => ({
          id: m.id,
          content: (m.document || m.content || "").slice(0, 200),
          role: m.metadata?.role || "unknown",
          session_id: m.metadata?.session_id || "",
          workspace_id: ws.id,
          timestamp: m.metadata?.created_at,
        }));
      } catch { return []; }
    });
    const msgResults = await Promise.allSettled(wsFetches);
    for (const r of msgResults) {
      if (r.status === "fulfilled") allMessages.push(...r.value);
    }
    allMessages.sort((a: any, b: any) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({
      health,
      metrics,
      workspaces,
      recentMessages: allMessages.slice(0, 30),
      sessions,
      webhooks,
      apiKeys,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch activity" }, { status: 500 });
  }
}
