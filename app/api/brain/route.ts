import { NextResponse } from "next/server";

const VECTORIZER_URL = "http://localhost:8091";
const LM_STUDIO_URL = "http://localhost:1234";
const LM_STUDIO_KEY = process.env.LM_STUDIO_KEY || "";
const API_KEY = "vectorizer-local-key";

const vHeaders = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

// Workspace doc counts (cached, refreshed every 5 min)
let workspaceCache: Record<string, number> = {};
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getWorkspaceDocCounts(): Promise<Record<string, number>> {
  if (Date.now() - cacheTime < CACHE_TTL && Object.keys(workspaceCache).length > 0) {
    return workspaceCache;
  }
  try {
    const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces`, { headers: vHeaders });
    const data = await res.json();
    const counts: Record<string, number> = {};
    for (const ws of data.workspaces || []) {
      counts[ws.id] = ws.document_count || 0;
    }
    workspaceCache = counts;
    cacheTime = Date.now();
    return counts;
  } catch {
    return workspaceCache; // return stale cache on error
  }
}

export async function POST(req: Request) {
  const { question, workspaceId } = await req.json();

  // Determine which workspaces to search
  let workspaces: string[];
  if (workspaceId) {
    workspaces = [workspaceId];
  } else {
    const counts = await getWorkspaceDocCounts();
    // Only search workspaces that have documents
    workspaces = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([id]) => id);
  }

  if (workspaces.length === 0) {
    return NextResponse.json({
      answer: "No data found in any workspace. Upload some documents first.",
      sources: [],
    });
  }

  // Search all workspaces in parallel
  const searchPromises = workspaces.map((ws) =>
    fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
      method: "POST",
      headers: vHeaders,
      body: JSON.stringify({
        query: question,
        n_results: 5,
        where: { workspace_id: ws },
      }),
    }).then((r) => r.json())
  );

  const results = await Promise.all(searchPromises);

  // Merge and sort by relevance (lower distance = more relevant)
  const allResults: { document: string; distance: number; workspace_id: string }[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].results) {
      for (const r of results[i].results) {
        allResults.push({
          document: r.document,
          distance: r.distance || 1,
          workspace_id: workspaces[i],
        });
      }
    }
  }

  allResults.sort((a, b) => a.distance - b.distance);
  const topResults = allResults.slice(0, 5);
  const context = topResults.map((r) => r.document).join("\n");

  if (!context) {
    return NextResponse.json({
      answer: "No relevant context found in your workspaces.",
      sources: [],
    });
  }

  // Call LM Studio
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000);
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
              "You are an assistant answering questions based on the provided memory context. Answer concisely and directly. Use only information from the context when possible. If the answer is not in the context, say so.",
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
    const answer =
      data?.choices?.[0]?.message?.content || "No answer returned.";

    // Convert distance to score (1 = perfect match, 0 = unrelated)
    const sources = topResults.map((r) => ({
      content: r.document,
      score: Math.max(0, 1 - r.distance),
    }));

    return NextResponse.json({ answer, sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "LLM request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
