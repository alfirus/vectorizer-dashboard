const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://vectorizer:8091";
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || process.env.OAI_COMPATIBLE_URL || "http://host.docker.internal:1234/v1";
const LM_STUDIO_KEY = process.env.LM_STUDIO_KEY || process.env.LM_STUDIO_API_KEY || process.env.OAI_API_KEY || "";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

const vHeaders = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

export const runtime = "nodejs";

// Relevance floor: Chroma cosine distance above this is treated as noise,
// not context. Feeding noise to the LLM is how "What is my daughter's name"
// got answered from Elizabeth's SOUL doc. Tune live via RAG_MAX_DISTANCE —
// starting default 0.78 (nomic-768d; true hits typically score well below,
// identity-doc junk in wrong workspaces scores ~0.8+).
const MAX_DISTANCE = parseFloat(process.env.RAG_MAX_DISTANCE || "0.78");

interface ScoredHit {
  document: string;
  distance: number;
  workspace_id: string;
}

// List non-empty workspace ids.
// (Was inline: GET /workspaces never returned document_count, only
// {id,name,created_at}, so doc-count filtering always saw 0. Now tries
// document_count first, then GET /workspaces/:id stats, then keeps all.)
async function listAllWorkspaceIds(): Promise<string[]> {
  try {
    const res = await fetch(`${VECTORIZER_URL}/api/v1/workspaces`, { headers: vHeaders });
    const data = await res.json();
    const ids: string[] = (data.workspaces || []).map((w: { id: string }) => w.id);
    if (ids.length === 0) return [];
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
    return hadStats ? nonEmpty : ids;
  } catch {
    // Fallback: try known workspace names
    return ["maisarah", "sofia", "family", "shiela"];
  }
}

// Fan out POST /messages/search over ids (hybrid flag forwarded as
// where.hybrid for BM25+RRF), merge by distance, drop noise above the
// relevance floor. Note: `r.distance ?? 1` — never `|| 1`, a perfect
// distance of 0 is falsy and must not become 1.
async function searchWorkspaces(question: string, ids: string[], hybrid: boolean): Promise<ScoredHit[]> {
  const searchPromises = ids.map((ws) =>
    fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
      method: "POST",
      headers: vHeaders,
      body: JSON.stringify({
        query: question,
        n_results: 5,
        where: hybrid ? { workspace_id: ws, hybrid: true } : { workspace_id: ws },
      }),
    })
      .then((r) => r.json())
      .catch(() => ({}))
  );

  const results = await Promise.all(searchPromises);

  const allResults: ScoredHit[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].results) {
      for (const r of results[i].results) {
        allResults.push({
          document: r.document,
          distance: r.distance ?? 1,
          workspace_id: ids[i],
        });
      }
    }
  }

  allResults.sort((a, b) => a.distance - b.distance);
  return allResults.filter((r) => r.distance <= MAX_DISTANCE).slice(0, 5);
}

// Small helper for terminal SSE replies (abstain / empty states).
function sseReply(events: Record<string, unknown>[]) {
  const enc = new TextEncoder();
  const s = new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(s, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

export async function POST(req: Request) {
  const { question, workspaceId, hybrid } = await req.json() as { question: string; workspaceId?: string; hybrid?: boolean };

  // Determine which workspaces to search
  let workspaces: string[];
  if (workspaceId) {
    workspaces = [workspaceId];
  } else {
    workspaces = await listAllWorkspaceIds();
    if (workspaces.length === 0) {
      return sseReply([
        { type: "sources", sources: [] },
        { type: "chunk", content: "No workspaces found. Create one first." },
      ]);
    }
  }

  let topResults = await searchWorkspaces(question, workspaces, !!hybrid);
  let scopeLabel = workspaceId ? `workspace '${workspaceId}'` : "any workspace";

  // Single-workspace fallback: scoped search found nothing relevant — the
  // answer may live elsewhere (e.g. asked in 'elizabeth', fact in 'family').
  // Expand to all workspaces before giving up.
  if (topResults.length === 0 && workspaceId) {
    const rest = (await listAllWorkspaceIds()).filter((id) => id !== workspaceId);
    if (rest.length > 0) {
      topResults = await searchWorkspaces(question, rest, !!hybrid);
      if (topResults.length > 0) scopeLabel = `workspace '${workspaceId}', so I searched all workspaces`;
    }
  }

  // Abstain: nothing passed the relevance floor. Do NOT call the LLM —
  // generating from noise is the confabulation bug.
  if (topResults.length === 0) {
    return sseReply([
      { type: "sources", sources: [] },
      { type: "chunk", content: `I couldn't find anything relevant in ${scopeLabel}. Try a different workspace, rephrase, or reindex the vault.` },
    ]);
  }

  const context = topResults.map((r) => r.document).join("\n");

  // Convert distance to score (1 = perfect match, 0 = unrelated)
  const sources = topResults.map((r) => ({
    content: r.document,
    score: Math.max(0, 1 - r.distance),
    workspace_id: r.workspace_id,
  }));

  // Call LM Studio with streaming — with generic snippet fallback if LM is
  // slow/offline or only returns reasoning
  const encoder = new TextEncoder();
  // Extract a concise answer directly from retrieved context as fallback (fast, no LLM needed)
  function synthAnswer(srcs: { content: string; score: number }[]): string | null {
    // Generic fallback: return the top source snippet when LLM is unavailable
    if (srcs.length > 0) {
      const top = srcs[0].content.replace(/^\\[.*?\\]\\\\n/, "").split("\\\\n").slice(0, 6).join("\\\\n").trim();
      if (top.length > 40) return top.slice(0, 600);
    }
    return null;
  }
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send sources first so the client knows them immediately
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`));

        let gotContent = false;
        let answerBuffer = "";
        const fallback = synthAnswer(sources);
        const llmPromise = (async () => {
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
                    "You are an assistant answering questions based on the provided memory context. Answer concisely and directly. Use only information from the context. If the answer is not in the context, say so explicitly — never guess, and never answer from identity documents that don't address the question. Do not wrap your answer in reasoning tags. Output only the final answer.",
                },
                {
                  role: "user",
                  content: `Context:\n${context}\n\nQuestion: ${question}`,
                },
              ],
              temperature: 0.2,
              max_tokens: 512,
              stream: true,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`LLM ${res.status} ${errText.slice(0, 200)}`);
          }

          const reader = res.body?.getReader();
          if (!reader) throw new Error("No LLM response body");
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t || !t.startsWith("data: ")) continue;
              const payload = t.slice(6);
              if (payload === "[DONE]") continue;
              try {
                const p = JSON.parse(payload);
                // Prefer real content; reasoning_content is fallback — strip reasoning tags
                let delta: string | undefined =
                  p.choices?.[0]?.delta?.content ?? p.choices?.[0]?.message?.content;
                const reasoning = p.choices?.[0]?.delta?.reasoning_content ?? p.choices?.[0]?.message?.reasoning_content;
                if (!delta && reasoning) {
                  // Skip verbose reasoning dumps; only use as last resort
                  continue;
                }
                if (delta) {
                  // Strip any leaked <think> tags
                  delta = delta.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*/g, "");
                  if (!delta.trim()) continue;
                  gotContent = true;
                  answerBuffer += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`));
                }
              } catch {}
            }
          }
        })();

        // Race LLM against a timeout — if LM Studio is slow/cold, return synth answer
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 12000));
        await Promise.race([llmPromise.catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          if (!gotContent) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
        }), timeout]);

        // If LLM timed out or produced no content, use synth fallback
        if (!gotContent) {
          if (fallback) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: fallback })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: "I found relevant context but the language model timed out. Here are the sources — answer is in the context above." })}\n\n`));
          }
        } else if (answerBuffer) {
          // Clean any remaining reasoning tags from assembled answer
          const cleaned = answerBuffer.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          if (!cleaned && fallback) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: fallback })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "LLM request failed";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
        const fb = synthAnswer(sources);
        if (fb) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: fb })}\n\n`));
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
