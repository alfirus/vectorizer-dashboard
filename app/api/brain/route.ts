import { NextResponse } from "next/server";

const VECTORIZER_URL = "http://localhost:8091";
const LM_STUDIO_URL = "http://localhost:1234";
const LM_STUDIO_KEY = process.env.LM_STUDIO_KEY || "";
const API_KEY = "vectorizer-local-key";

const vHeaders = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

export async function POST(req: Request) {
  const { question, workspaceId } = await req.json();

  // Step 1: Search Vectorizer for context
  const workspaces = workspaceId
    ? [workspaceId]
    : ["family", "sofia", "maisarah"];
  const allResults: { document: string; distance?: number }[] = [];

  for (const ws of workspaces) {
    const res = await fetch(`${VECTORIZER_URL}/api/v1/messages/search`, {
      method: "POST",
      headers: vHeaders,
      body: JSON.stringify({
        query: question,
        n_results: 5,
        where: { workspace_id: ws },
      }),
    });
    const data = await res.json();
    if (data.results) allResults.push(...data.results);
  }

  allResults.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  const topResults = allResults.slice(0, 5);
  const context = topResults.map((r) => r.document).join("\n");

  if (!context) {
    return NextResponse.json({
      answer: "No relevant context found in your workspaces.",
      sources: [],
    });
  }

  // Step 2: Call LM Studio directly
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
    const sources = topResults.map((r) => ({
      content: r.document,
      score: r.distance || 0,
    }));
    return NextResponse.json({ answer, sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "LLM request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
