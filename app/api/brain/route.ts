const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://vectorizer:8091";
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || process.env.OAI_COMPATIBLE_URL || "http://host.docker.internal:1234/v1";
const LM_STUDIO_KEY = process.env.LM_STUDIO_KEY || process.env.LM_STUDIO_API_KEY || process.env.OAI_API_KEY || "";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

const vHeaders = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { question, workspaceId, hybrid } = await req.json() as { question: string; workspaceId?: string; hybrid?: boolean };

  // Determine which workspaces to search
  // Bug fix: GET /workspaces never returned document_count (just {id,name,created_at}),
  // so the old getWorkspaceDocCounts() always saw 0 and short-circuited with
  // "No data found in any workspace" even though Chroma had 1500+ docs.
  // Now we try document_count first, then fall back to GET /workspaces/:id stats
  // and finally just use the workspace list if stats also fail.
  let workspaces: string[];
  if (workspaceId) {
    workspaces = [workspaceId];
  } else {
    try {
      const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces`, { headers: vHeaders });
      const data = await res.json();
      const ids: string[] = (data.workspaces || []).map((w: { id: string }) => w.id);
      if (ids.length === 0) {
        const enc = new TextEncoder();
        const s = new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "sources", sources: [] })}\n\n`));
            c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "chunk", content: "No workspaces found. Create one first." })}\n\n`));
            c.enqueue(enc.encode("data: [DONE]\n\n")); c.close();
          },
        });
        return new Response(s, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
      }
      // Try to filter to non-empty workspaces via stats, but don't block if stats fail
      const statsResults = await Promise.allSettled(
        ids.map((id) => fetch(`${VECTORIZER_URL}/api/v1/workspaces/${id}`, { headers: vHeaders }).then((r) => r.json()))
      );
      const nonEmpty: string[] = [];
      let hadStats = false;
      for (let i = 0; i < ids.length; i++) {
        const r = statsResults[i];
        if (r.status === "fulfilled") {
          const v = r.value as { stats?: { document_count?: number }; document_count?: number };
          const count = v.stats?.document_count ?? v.document_count;
          if (typeof count === "number") {
            hadStats = true;
            if (count > 0) nonEmpty.push(ids[i]);
            continue;
          }
        }
        // If stats endpoint failed or has no count, keep the workspace (don't filter)
        if (!hadStats) nonEmpty.push(ids[i]);
      }
      workspaces = hadStats ? nonEmpty : ids;
      if (workspaces.length === 0) {
        // All workspaces are empty according to stats — still let the LLM explain context is empty
        // instead of the misleading "no data" message
        const enc = new TextEncoder();
        const s = new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "sources", sources: [] })}\n\n`));
            c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "chunk", content: "No documents found in any workspace yet. Try reindexing the vault or adding documents." })}\n\n`));
            c.enqueue(enc.encode("data: [DONE]\n\n")); c.close();
          },
        });
        return new Response(s, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
      }
    } catch {
      // Fallback: try known workspace names
      workspaces = ["maisarah", "sofia", "family", "shiela"];
    }
  }

  // Search all workspaces in parallel (hybrid flag forwarded as where.hybrid for BM25+RRF)
  const searchPromises = workspaces.map((ws) =>
    fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
      method: "POST",
      headers: vHeaders,
      body: JSON.stringify({
        query: question,
        n_results: 5,
        where: hybrid ? { workspace_id: ws, hybrid: true } : { workspace_id: ws },
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
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "sources", sources: [] })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: "No relevant context found in your workspaces." })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Convert distance to score (1 = perfect match, 0 = unrelated)
  const sources = topResults.map((r) => ({
    content: r.document,
    score: Math.max(0, 1 - r.distance),
  }));

  // Call LM Studio with streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send sources first so the client knows them immediately
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`));

        const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LM_STUDIO_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.LLM_MODEL || "qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive",
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
            stream: true,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: `LLM request failed: ${res.status} ${errText}` })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // Pipe the SSE stream from LM Studio to the client
        const reader = res.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: "No response body from LLM" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const payload = trimmed.slice(6);
              if (payload === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`));
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          if (buffer.trim() === "data: [DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        }

        // Ensure we send [DONE] if the upstream didn't
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "LLM request failed";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
