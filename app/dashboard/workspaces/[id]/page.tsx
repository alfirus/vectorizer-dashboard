"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getMessages } from "@/lib/api";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Msg {
  role: string;
  content: string;
  session_id: string;
  [key: string]: unknown;
}

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<string[]>([]);
  const [activeSession, setActiveSession] = useState<string>("");

  useEffect(() => {
    getMessages(id)
      .then((r) => {
        const msgs = r.messages || r || [];
        setMessages(Array.isArray(msgs) ? msgs : []);
        const uniqueSessions = Array.from(
          new Set((Array.isArray(msgs) ? msgs : []).map((m: Msg) => m.session_id))
        ).filter(Boolean) as string[];
        setSessions(uniqueSessions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const filtered = activeSession
    ? messages.filter((m) => m.session_id === activeSession)
    : messages;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono">{id}</h1>
        <p className="text-sm text-muted">{messages.length} messages</p>
      </div>

      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSession("")}
            className={cn(
              "px-3 py-1 rounded-full text-xs border transition-colors",
              !activeSession
                ? "bg-primary/15 border-primary text-primary"
                : "border-border text-muted hover:text-foreground"
            )}
          >
            All
          </button>
          {sessions.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSession(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors",
                activeSession === s
                  ? "bg-primary/15 border-primary text-primary"
                  : "border-border text-muted hover:text-foreground"
              )}
            >
              {s.length > 30 ? s.slice(0, 30) + "…" : s}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted">No messages found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "bg-surface border border-border rounded-lg p-4",
                msg.role === "user" && "border-l-2 border-l-primary",
                msg.role === "assistant" && "border-l-2 border-l-accent",
                msg.role === "system" && "border-l-2 border-l-muted"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    msg.role === "user" && "bg-primary/15 text-primary",
                    msg.role === "assistant" && "bg-accent/15 text-accent",
                    msg.role === "system" && "bg-muted/15 text-muted"
                  )}
                >
                  {msg.role}
                </span>
                <span className="text-xs text-muted font-mono">
                  {msg.session_id?.slice(0, 20)}
                </span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content?.slice(0, 500) || ""}
                </ReactMarkdown>
                {(msg.content?.length || 0) > 500 && (
                  <span className="text-muted">…</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
