"use client";

import { useEffect, useState, useRef } from "react";
import { brainAskStream, getWorkspaces } from "@/lib/api";
import type { BrainStreamEvent } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: { content: string; score: number }[];
}

interface QueryLog {
  query: string;
  workspace: string;
  timestamp: number;
  duration: number;
  resultCount: number;
}

function logQuery(entry: QueryLog) {
  try {
    const existing = JSON.parse(localStorage.getItem("vectorizer_queries") || "[]");
    existing.unshift(entry);
    // Keep only last 200 queries
    if (existing.length > 200) existing.length = 200;
    localStorage.setItem("vectorizer_queries", JSON.stringify(existing));
  } catch { /* ignore */ }
}

export default function RagPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [hybrid, setHybrid] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Context Preview state
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewSources, setPreviewSources] = useState<{ content: string; score: number }[]>([]);
  const [previewQuery, setPreviewQuery] = useState("");

  useEffect(() => {
    getWorkspaces()
      .then((r) => setWorkspaces(r.workspaces || []))
      .catch(console.error);
  }, []);

  const handleAsk = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    // Show what query is being previewed
    setPreviewQuery(q);
    setPreviewSources([]);
    setPreviewOpen(true);

    // Add a placeholder assistant message that we'll update as chunks arrive
    const assistantIdx = messages.length + 1; // +1 for the user msg we just pushed
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", sources: [] },
    ]);

    const startTime = Date.now();

    try {
      const ws = workspace === "all" ? undefined : workspace;
      let answerText = "";
      let sources: { content: string; score: number }[] = [];

      for await (const event of brainAskStream(q, ws, hybrid)) {
        switch (event.type) {
          case "sources":
            sources = event.sources;
            // Update sources on the assistant message immediately
            setMessages((prev) => {
              const updated = [...prev];
              const msg = updated[assistantIdx];
              if (msg) updated[assistantIdx] = { ...msg, sources };
              return updated;
            });
            // Also update the context preview panel
            setPreviewSources(sources);
            break;
          case "chunk":
            answerText += event.content;
            // Update the assistant message content progressively
            setMessages((prev) => {
              const updated = [...prev];
              const msg = updated[assistantIdx];
              if (msg) updated[assistantIdx] = { ...msg, content: answerText };
              return updated;
            });
            break;
          case "error":
            answerText = `Error: ${event.error}`;
            setMessages((prev) => {
              const updated = [...prev];
              const msg = updated[assistantIdx];
              if (msg) updated[assistantIdx] = { ...msg, content: answerText };
              return updated;
            });
            break;
        }
      }

      // Log query analytics
      const duration = Date.now() - startTime;
      logQuery({
        query: q,
        workspace: workspace,
        timestamp: startTime,
        duration,
        resultCount: sources.length,
      });

      // If we got no content at all, show a fallback
      if (!answerText) {
        setMessages((prev) => {
          const updated = [...prev];
          const msg = updated[assistantIdx];
          if (msg) updated[assistantIdx] = { ...msg, content: "No answer returned." };
          return updated;
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed";
      // Log the failed query too
      logQuery({
        query: q,
        workspace: workspace,
        timestamp: startTime,
        duration: Date.now() - startTime,
        resultCount: 0,
      });
      setMessages((prev) => {
        const updated = [...prev];
        const target = updated[assistantIdx];
        if (target) updated[assistantIdx] = { ...target, content: `Error: ${msg}` };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[70vh] lg:h-[calc(100vh-3rem)]">
      <div className="mb-4">
        <h1 className="text-xl lg:text-2xl font-bold">RAG Q&A</h1>
        <p className="text-sm text-muted">
          Ask questions — powered by LM Studio directly (streaming responses).
        </p>
      </div>

      {/* Workspace selector */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <label className="text-muted">Workspace:</label>
        <select
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          className="bg-surface border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
        >
          <option value="all">All Workspaces</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name || ws.id}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-muted ml-2">
          <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} className="rounded" />
          Hybrid (vector + BM25)
        </label>
      </div>

      {/* Context Preview Panel */}
      <div className="mb-3 bg-surface border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>📋</span>
            <span className="font-medium text-foreground">Context Preview</span>
            {previewSources.length > 0 && (
              <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                {previewSources.length} chunks
              </span>
            )}
            {loading && previewSources.length === 0 && (
              <span className="text-xs text-muted animate-pulse">Searching…</span>
            )}
          </div>
          <svg
            className={cn(
              "w-4 h-4 text-muted transition-transform",
              previewOpen && "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {previewOpen && (
          <div className="border-t border-border">
            {previewSources.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted">
                {loading
                  ? "Waiting for search results from Vectorizer…"
                  : "Send a question to see what context the LLM will receive."}
              </div>
            ) : (
              <div className="px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
                {previewQuery && (
                  <p className="text-xs text-muted mb-2">
                    Query: <span className="text-foreground">{previewQuery}</span>
                  </p>
                )}
                {previewSources.map((s, i) => (
                  <div
                    key={i}
                    className="bg-surface-hover border border-border/50 rounded-md p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-primary">
                        Chunk {i + 1}
                      </span>
                      <span className="text-xs text-muted">
                        Score: {(s.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted/80 leading-relaxed whitespace-pre-wrap">
                      {s.content.length > 300 ? s.content.slice(0, 300) + "…" : s.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat messages */}
      <div className="flex-1 min-h-[240px] overflow-y-auto space-y-3 mb-4 bg-surface border border-border rounded-lg p-4">
        {messages.length === 0 && (
          <p className="text-muted text-center py-12">
            Ask something about your data…
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[92%] lg:max-w-[80%] rounded-lg px-3 lg:px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary/20 text-foreground"
                  : "bg-surface-hover text-foreground border border-border"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  {m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  ) : loading && i === messages.length - 1 ? (
                    <span className="text-muted animate-pulse">Thinking…</span>
                  ) : null}
                  {m.sources && m.sources.length > 0 && (
                    <details className="mt-3 pt-2 border-t border-border/50">
                      <summary className="text-xs text-primary cursor-pointer">Sources ({m.sources.length})</summary>
                      {m.sources.map((s, i) => (
                        <div key={i} className="mt-2 bg-background border border-border rounded p-2 flex gap-2">
                          <p className="text-xs text-muted/80 leading-relaxed flex-1 whitespace-pre-wrap">{s.content.slice(0, 400)}{s.content.length > 400 ? "…" : ""} <span className="font-mono">({(s.score * 100).toFixed(0)}%)</span></p>
                          <button onClick={() => { navigator.clipboard.writeText(s.content); }} className="text-xs px-1.5 py-0.5 border border-border rounded h-fit shrink-0 hover:bg-surface">Copy</button>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
