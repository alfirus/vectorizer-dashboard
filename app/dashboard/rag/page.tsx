"use client";
import { useEffect, useState, useRef } from "react";
import { brainAskStream, getWorkspaces } from "@/lib/api";
import type { BrainStreamEvent } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Sparkles, Copy, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMsg { role: "user" | "assistant"; content: string; sources?: { content: string; score: number }[]; }

export default function RagPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [hybrid, setHybrid] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const copy = (i: number, t: string) => { navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(null), 1200); };

  useEffect(() => { getWorkspaces().then(r => setWorkspaces(r.workspaces || [])).catch(console.error); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleAsk = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim(); setInput("");
    const idx = messages.length + 1;
    setMessages(prev => [...prev, { role: "user", content: q }, { role: "assistant", content: "", sources: [] }]);
    setLoading(true);
    let answer = ""; let sources: { content: string; score: number }[] = [];
    try {
      const ws = workspace === "all" ? undefined : workspace;
      for await (const ev of brainAskStream(q, ws, hybrid)) {
        if (ev.type === "sources") { sources = ev.sources; setMessages(p => { const u = [...p]; if (u[idx]) u[idx] = { ...u[idx], sources }; return u; }); }
        else if (ev.type === "chunk") { answer += ev.content; setMessages(p => { const u = [...p]; if (u[idx]) u[idx] = { ...u[idx], content: answer }; return u; }); }
        else if (ev.type === "error") { answer = `Error: ${ev.error}`; setMessages(p => { const u = [...p]; if (u[idx]) u[idx] = { ...u[idx], content: answer }; return u; }); }
      }
      if (!answer) setMessages(p => { const u = [...p]; if (u[idx]) u[idx] = { ...u[idx], content: "No answer returned." }; return u; });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setMessages(p => { const u = [...p]; if (u[idx]) u[idx] = { ...u[idx], content: `Error: ${msg}` }; return u; });
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-56px-72px)] lg:h-[calc(100vh-3rem)] animate-fadeIn">
      <div className="shrink-0 mb-3">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Ask RAG</h1>
        <p className="text-sm text-muted">Streaming answers from LM Studio + your vault.</p>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 mb-3">
        <select value={workspace} onChange={e => setWorkspace(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
          <option value="all">All workspaces</option>
          {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name || ws.id}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2 text-sm cursor-pointer">
          <input type="checkbox" checked={hybrid} onChange={e => setHybrid(e.target.checked)} className="rounded accent-primary" />
          Hybrid
        </label>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 bg-card border border-border rounded-2xl p-3 lg:p-4 shadow-card">
        {messages.length === 0 && (
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3"><Sparkles className="w-6 h-6 text-primary" /></div>
            <p className="text-sm font-medium">Ask anything about your vault</p>
            <p className="text-xs text-muted mt-1">Try: What is Maisarah&apos;s vault about?</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {["Summarize the vault", "Hybrid search for Bukku", "What changed recently?"].map(s => (
                <button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full border border-border bg-surface hover:bg-surface-hover">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[92%] lg:max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm",
              m.role === "user" ? "bg-primary text-white" : "bg-background border border-border"
            )}>
              {m.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                  {m.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown> : loading && i === messages.length - 1 ? <span className="text-muted animate-pulse">Thinking…</span> : null}
                  {m.sources && m.sources.length > 0 && (
                    <details className="mt-3 pt-2 border-t border-border">
                      <summary className="text-xs font-medium text-primary cursor-pointer flex items-center gap-1">Sources ({m.sources.length}) <ChevronDown className="w-3 h-3" /></summary>
                      {m.sources.map((s, j) => (
                        <div key={j} className="mt-2 bg-card border border-border rounded-xl p-2.5 flex gap-2">
                          <p className="text-xs leading-relaxed flex-1 whitespace-pre-wrap break-words">{s.content.slice(0, 400)}{s.content.length > 400 ? "…" : ""} <span className="font-mono text-muted">({(s.score*100).toFixed(0)}%)</span></p>
                          <button onClick={() => copy(j, s.content)} className="shrink-0 w-7 h-7 rounded-lg border border-border bg-surface flex items-center justify-center">{copied === j ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}</button>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 flex gap-2 mt-3">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAsk()} placeholder="Ask anything…" disabled={loading} className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 placeholder:text-muted" />
        <button onClick={handleAsk} disabled={loading || !input.trim()} className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0 hover:bg-primary-hover disabled:opacity-50 active:scale-95 transition-all">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
