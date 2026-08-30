"use client";

import { useState } from "react";
import { brainAsk } from "@/lib/api";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function RagPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [workspace, setWorkspace] = useState("family");
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await brainAsk(q, workspace);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer || "No answer returned." },
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
          Ask questions — powered by Vectorizer&apos;s LLM brain (can take
          several minutes with large models).
        </p>
      </div>

      {/* Workspace selector */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="text-muted">Workspace:</label>
        <input
          type="text"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          className="bg-surface border border-border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-primary"
        />
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
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary/20 text-foreground"
                  : "bg-surface-hover text-foreground border border-border"
              }`}
            >
              {m.content}
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
