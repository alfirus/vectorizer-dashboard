"use client";
import { useEffect, useState, useRef } from "react";
import { listWorkspaces, peerChat, VectorizerError } from "@/lib/api";
import type { ReasoningLevel, ChatToolTrace } from "@/lib/types";
import { REASONING_LEVELS } from "@/lib/types";
import { VectorizerBanner } from "@/components/VectorizerBanner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, MessagesSquare, ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  tools?: ChatToolTrace[];
}

function ToolTrace({ tools }: { tools: ChatToolTrace[] }) {
  if (tools.length === 0) return null;
  return (
    <details className="mt-3 pt-2 border-t border-border">
      <summary className="text-xs font-medium text-primary cursor-pointer flex items-center gap-1">
        <Wrench className="w-3 h-3" /> Tool trace ({tools.length}) <ChevronDown className="w-3 h-3" />
      </summary>
      <div className="mt-2 space-y-2">
        {tools.map((t, j) => (
          <div key={j} className="bg-card border border-border rounded-xl p-2.5">
            <div className="text-xs font-mono font-semibold">{t.tool || `step ${j + 1}`}</div>
            {t.args && (
              <pre className="text-[11px] font-mono text-muted whitespace-pre-wrap break-words mt-1">
                {JSON.stringify(t.args, null, 2).slice(0, 800)}
              </pre>
            )}
            {typeof t.result === "string" && t.result && (
              <p className="text-xs mt-1 whitespace-pre-wrap break-words">
                {t.result.slice(0, 600)}{t.result.length > 600 ? "…" : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function ChatPage() {
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [ws, setWs] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [observer, setObserver] = useState("");
  const [observed, setObserved] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [level, setLevel] = useState<ReasoningLevel>("low");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listWorkspaces()
      .then((r) => {
        const list = r.workspaces || [];
        setWorkspaces(list);
        if (list.length > 0) setWs((cur) => cur || list[0].id);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading || !ws) return;
    setInput(""); setError(null);
    // Mirror the backend fallback: observer/observed default to each other.
    const effObserver = observer.trim() || observed.trim();
    const effObserved = observed.trim() || observer.trim();
    const idx = messages.length + 1;
    setMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setLoading(true);
    try {
      const r = await peerChat(ws, {
        query: q,
        ...(effObserver ? { observer: effObserver } : {}),
        ...(effObserved ? { observed: effObserved } : {}),
        ...(sessionId.trim() ? { session_id: sessionId.trim() } : {}),
        reasoning_level: level,
      });
      const answer = r.answer || "(empty answer)";
      setMessages((p) => {
        const u = [...p];
        if (u[idx]) u[idx] = { role: "assistant", content: answer, tools: r.tools };
        return u;
      });
    } catch (e) {
      if (e instanceof VectorizerError) {
        const statusMsg =
          e.status === 401 || e.status === 403
            ? "Not authorized — check VECTORIZER_API_KEY / peer JWT"
            : e.status === 503
              ? "LLM brain not enabled"
              : e.status === 502
                ? "Vectorizer unreachable"
                : `Request failed (${e.status})`;
        setMessages((p) => {
          const u = [...p];
          if (u[idx]) u[idx] = { role: "assistant", content: `Error: ${statusMsg}` };
          return u;
        });
        setError(e);
      } else {
        setMessages((p) => {
          const u = [...p];
          if (u[idx]) u[idx] = { role: "assistant", content: "Error: request failed." };
          return u;
        });
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-56px-72px)] lg:h-[calc(100vh-3rem)] animate-fadeIn">
      <div className="shrink-0 mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 mr-auto">
          <MessagesSquare className="w-5 h-5 text-primary" /> Chat
        </h1>
        <select
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          aria-label="Workspace"
        >
          {workspaces.length === 0 && <option value="">No workspaces</option>}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name || w.id}</option>
          ))}
        </select>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as ReasoningLevel)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          aria-label="Reasoning level"
          title="Reasoning level"
        >
          {REASONING_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <input
          value={observer}
          onChange={(e) => setObserver(e.target.value)}
          placeholder="observer (defaults to observed)"
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <input
          value={observed}
          onChange={(e) => setObserved(e.target.value)}
          placeholder="observed (defaults to observer)"
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="session_id (optional)"
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
        />
      </div>

      <div className="shrink-0 mb-3"><VectorizerBanner error={error} /></div>

      <div className="flex-1 overflow-y-auto space-y-3 bg-card border border-border rounded-2xl p-3 lg:p-4 shadow-card">
        {messages.length === 0 && (
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
              <MessagesSquare className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium">Dialectic peer chat</p>
            <p className="text-xs text-muted mt-1">
              {ws ? "Ask as one peer about another — answers build on peer cards." : "Waiting for workspaces…"}
            </p>
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
                  {m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  ) : loading && i === messages.length - 1 ? (
                    <span className="text-muted animate-pulse">Thinking…</span>
                  ) : null}
                  {m.tools && m.tools.length > 0 && <ToolTrace tools={m.tools} />}
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={ws ? "Ask anything…" : "No workspace available"}
          disabled={loading || !ws}
          className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 placeholder:text-muted"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || !ws}
          className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0 hover:bg-primary-hover disabled:opacity-50 active:scale-95 transition-all"
          aria-label="Send"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
