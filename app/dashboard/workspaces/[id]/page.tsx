"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getMessages, addMessage } from "@/lib/api";
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

  // Bulk import state
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");

  const loadMessages = useCallback(() => {
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

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const filtered = activeSession
    ? messages.filter((m) => m.session_id === activeSession)
    : messages;

  const handleFiles = async (files: FileList | File[]) => {
    const accepted = [".md", ".txt", ".json"];
    const fileArray = Array.from(files).filter((f) =>
      accepted.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (fileArray.length === 0) {
      alert("No accepted files. Use .md, .txt, or .json files.");
      return;
    }
    setImporting(true);
    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setImportProgress(`Importing ${i + 1}/${fileArray.length}: ${file.name}`);
        const content = await file.text();
        await addMessage(id, "import", "system", content);
      }
      setImportProgress(`Done! Imported ${fileArray.length} file(s).`);
      loadMessages();
    } catch (err) {
      console.error(err);
      setImportProgress("Import failed. Check console for details.");
    } finally {
      setTimeout(() => {
        setImporting(false);
        setImportProgress("");
      }, 2000);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono">{id}</h1>
        <p className="text-sm text-muted">{messages.length} messages</p>
      </div>

      {/* Bulk Import Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/40"
        )}
      >
        <div className="space-y-2">
          <p className="text-sm text-muted">
            📁 Drag & drop files here or{" "}
            <label className="text-primary cursor-pointer hover:underline">
              browse
              <input
                type="file"
                multiple
                accept=".md,.txt,.json"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
          </p>
          <p className="text-xs text-muted/60">
            Accepts .md, .txt, .json — imported as system messages
          </p>
        </div>
        {importing && importProgress && (
          <p className="mt-3 text-sm text-primary font-medium">{importProgress}</p>
        )}
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
