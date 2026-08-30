"use client";

import { useEffect, useState } from "react";
import { brainAsk, getWorkspaces } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: { content: string; score: number }[];
}

export default function RagPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

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

    try {
      const ws = workspace === "all" ? undefined : workspace;
      const res = await brainAsk(q, ws);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer || "No answer returned.", sources: res.sources },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">RAG Q&A</h1>
        <p className="text-sm text-muted">
          Ask questions — powered by LM Studio directly (can take several
          minutes with large models).
        </p>
      </div>

      {/* Workspace selector */}
      <div className="mb-3 flex items-center gap-2 text-sm">
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
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 bg-surface border border-border rounded-lg p-4">
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
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary/20 text-foreground"
                  : "bg-surface-hover text-foreground border border-border"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted mb-1">Sources:</p>
                      {m.sources.slice(0, 3).map((s, i) => (
                        <p key={i} className="text-xs text-muted/70 line-clamp-1">
                          {s.content.slice(0, 100)}… ({(s.score * 100).toFixed(0)}%)
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-hover border border-border rounded-lg px-4 py-2 text-sm text-muted animate-pulse">
              Thinking…
            </div>
          </div>
        )}
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
