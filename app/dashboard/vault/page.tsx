"use client";
import { useEffect, useState } from "react";
import { FolderOpen, RefreshCw, Search, Eye, Hash, FileText, Sparkles, ChevronDown } from "lucide-react";

interface VaultFile { path: string; hash: string; chunks: number; mtime?: string; }
interface VaultStats { files: number; total_chunks: number; version: string; graph: { nodes: number; edges: number; byType: Record<string, number> }; }
interface VaultFilePreview { path: string; content: string; meta: Record<string, unknown>; }
interface ReindexProgress {
  phase: string;
  percent: number;
  file: string;
  current: number;
  total: number;
  message: string;
  logs: string[];
}

export default function VaultPage() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [reindexProgress, setReindexProgress] = useState<ReindexProgress | null>(null);
  const [offset, setOffset] = useState(0); const limit = 50;
  const [preview, setPreview] = useState<VaultFilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openPreview = async (path: string) => {
    setPreviewLoading(true);
    try {
      const r = await fetch(`/api/vault?action=file&path=${encodeURIComponent(path)}`);
      const j = await r.json();
      if (r.ok) setPreview({ path: j.path, content: j.content, meta: j.meta || {} });
      else setPreview({ path, content: j.error || "Failed to load", meta: {} });
    } catch (e) { setPreview({ path, content: String(e), meta: {} }); }
    finally { setPreviewLoading(false); }
  };
  const load = async (q = query, off = offset) => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch("/api/vault?action=stats").then(r => r.json()),
        fetch(`/api/vault?limit=${limit}&offset=${off}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then(r => r.json()),
      ]);
      if (sRes.vault_available === false) { setStats(null); setFiles([]); setTotal(0); setLoading(false); return; }
      if (sRes.files !== undefined) setStats(sRes);
      if (lRes.files) { setFiles(lRes.files); setTotal(lRes.total); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { load("", 0); /* eslint-disable-next-line */ }, []);
  const handleSearch = () => { setOffset(0); load(query, 0); };

  const handleReindex = async (dryRun: boolean) => {
    setReindexing(true);
    setReindexResult(null);
    setReindexError(null);
    setReindexProgress({ phase: "starting", percent: 0, file: "", current: 0, total: 0, message: "Starting...", logs: [] });

    try {
      const res = await fetch("/api/admin/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ dryRun }),
        credentials: "include",
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to start reindex");
      }

      const contentType = res.headers.get("content-type") || "";

      // SSE streaming mode
      if (contentType.includes("text/event-stream")) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventStr of events) {
            if (!eventStr.trim()) continue;

            const eventMatch = eventStr.match(/^event: (.+)$/m);
            const dataMatch = eventStr.match(/^data: (.+)$/m);

            if (!eventMatch || !dataMatch) continue;

            const eventName = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            switch (eventName) {
              case "progress":
                setReindexProgress(prev => prev ? {
                  ...prev,
                  phase: data.phase || prev.phase,
                  percent: data.percent ?? prev.percent,
                  file: data.file || prev.file,
                  current: data.current ?? prev.current,
                  total: data.total ?? prev.total,
                  message: data.message || prev.message,
                } : null);
                break;
              case "phase":
                setReindexProgress(prev => prev ? {
                  ...prev,
                  phase: data.phase,
                  message: data.message,
                  file: "",
                  percent: data.phase === "graph" ? -1 : 0,
                } : null);
                break;
              case "log":
                setReindexProgress(prev => prev ? {
                  ...prev,
                  logs: [...prev.logs.slice(-100), data.message],
                } : null);
                break;
              case "vault_done":
                setReindexProgress(prev => prev ? {
                  ...prev,
                  message: `✓ Indexed ${data.indexed} files, ${data.chunks} chunks`,
                } : null);
                break;
              case "done":
                setReindexResult(`Completed in ${data.elapsed_ms}ms`);
                if (!dryRun) load(query, offset);
                break;
              case "error":
                setReindexError(data.message);
                break;
            }
          }
        }
      } else {
        // JSON fallback
        const data = await res.json();
        if (!res.ok || data.ok === false) {
          setReindexError(data.error || "Reindex failed");
          if (data.stdout) setReindexResult(data.stdout);
        } else {
          const out = data.vault?.stdout || "";
          const gOut = data.graph?.stdout || "";
          setReindexResult(`${out}\n${gOut ? `\n--- graph ---\n${gOut}` : ""}\n(${data.elapsed_ms}ms)`);
          if (!dryRun) load(query, offset);
        }
      }
    } catch (e: unknown) {
      setReindexError(e instanceof Error ? e.message : String(e));
    } finally {
      setReindexing(false);
      setTimeout(() => setReindexProgress(null), 5000);
    }
  };

  const shortPath = (p: string) => p.replace(/^.*SynologyDrive\/ai\//, "").replace(/\\/g, "/");

  const vaultAvailable = stats !== null || files.length > 0;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><FolderOpen className="w-5 h-5 text-primary" /> Vault</h1>
          <p className="text-sm text-muted mt-1">Markdown truth on SynologyDrive → 768d Nomic index.</p>
        </div>
        {!vaultAvailable && !loading && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <FolderOpen className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-sm font-semibold mb-1">Vault not available on this server</p>
            <p className="text-xs text-muted max-w-md mx-auto">Vault data lives on SynologyDrive (local machine). The reindex feature requires <code>vault_index.py</code> and the vault files which are only available locally.</p>
          </div>
        )}
        {vaultAvailable && (
          <div className="flex gap-2">
            <button onClick={() => handleReindex(true)} disabled={reindexing} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border border-border bg-card hover:bg-surface disabled:opacity-50">Dry run</button>
            <button onClick={() => handleReindex(false)} disabled={reindexing} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${reindexing ? "animate-spin" : ""}`} /> {reindexing ? "Reindexing…" : "Reindex"}
            </button>
          </div>
        )}
      </div>

      {/* ─── Progress Bar ─── */}
      {reindexProgress && (
        <div className="bg-card border border-primary/30 rounded-2xl p-4 shadow-card animate-fadeIn">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
              <span className="text-sm font-semibold text-foreground">
                {reindexProgress.phase === "graph"
                  ? "Rebuilding knowledge graph…"
                  : reindexProgress.phase === "indexing"
                  ? "Indexing vault files…"
                  : reindexProgress.message}
              </span>
            </div>
            {reindexProgress.percent >= 0 && (
              <span className="text-sm font-mono font-bold text-primary tabular-nums">{reindexProgress.percent}%</span>
            )}
          </div>

          {/* Progress bar track */}
          <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden mb-3">
            {reindexProgress.percent >= 0 ? (
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${reindexProgress.percent}%`,
                  background: "linear-gradient(90deg, var(--color-primary), var(--color-primary-hover, var(--color-primary)))",
                }}
              />
            ) : (
              <div className="h-full rounded-full bg-primary animate-pulse" style={{ width: "100%" }} />
            )}
          </div>

          {/* Status text */}
          <div className="text-xs font-mono text-muted truncate mb-1">
            {reindexProgress.file
              ? <>📄 <span className="text-foreground/80">{reindexProgress.file}</span> <span className="text-muted/60">({reindexProgress.current}/{reindexProgress.total})</span></>
              : reindexProgress.message}
          </div>

          {/* Vault done summary */}
          {reindexProgress.message.startsWith("✓") && (
            <div className="text-xs font-mono text-green-400 mt-1">{reindexProgress.message}</div>
          )}

          {/* Expandable log */}
          {reindexProgress.logs.length > 0 && (
            <details className="mt-2 group">
              <summary className="text-xs text-muted cursor-pointer hover:text-foreground select-none flex items-center gap-1">
                <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                Show log ({reindexProgress.logs.length} lines)
              </summary>
              <div className="mt-2 max-h-32 overflow-auto bg-background border border-border rounded-xl p-2 space-y-0.5">
                {reindexProgress.logs.slice(-30).map((log, i) => (
                  <div key={i} className="text-[10px] font-mono text-muted/60 truncate">{log}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Files", value: stats.files, icon: FileText, sub: `v${stats.version}` },
            { label: "Chunks", value: stats.total_chunks, icon: Hash, sub: "1201 vectors" },
            { label: "Graph", value: `${stats.graph?.nodes || 0} / ${stats.graph?.edges || 0}`, icon: Sparkles, sub: "nodes / edges" },
            { label: "Status", value: "Indexed", icon: FolderOpen, sub: "SynologyDrive" },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-2xl p-3.5 shadow-card">
              <card.icon className="w-4 h-4 text-muted mb-2" />
              <div className="text-lg font-bold tracking-tight">{card.value}</div>
              <div className="text-xs text-muted">{card.label}</div>
              <div className="text-[11px] text-muted/70">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {(reindexResult || reindexError) && (
        <div className={`rounded-2xl border p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto ${reindexError ? "bg-danger/10 border-danger/20 text-danger" : "bg-card border-border text-muted"}`}>
          {reindexError && <div className="font-bold mb-1">Error:</div>}{reindexError || reindexResult}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="p-3 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Filter by path…" className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <button onClick={handleSearch} className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shrink-0">Search</button>
        </div>

        {loading ? <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-surface rounded-xl animate-pulse" />)}</div>
        : files.length === 0 ? <div className="py-10 text-center text-sm text-muted">No files found.</div>
        : (
          <>
            <div className="px-4 pb-2 text-xs text-muted font-mono">Showing {offset+1}–{Math.min(offset+limit, total)} of {total}</div>
            <div className="divide-y divide-border">
              {files.map(f => (
                <button key={f.path} onClick={() => openPreview(f.path)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface text-left active:bg-surface-hover transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{shortPath(f.path).split("/").pop()}</div>
                    <div className="text-xs text-muted font-mono truncate">{shortPath(f.path)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-medium">{f.chunks} chunks</div>
                    <div className="text-[11px] font-mono text-muted">{f.hash}</div>
                  </div>
                  <Eye className="w-4 h-4 text-muted shrink-0" />
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-center p-3 border-t border-border">
              <button disabled={offset===0} onClick={() => { const n = Math.max(0, offset-limit); setOffset(n); load(query, n); }} className="px-4 py-2 rounded-xl border border-border bg-surface text-sm disabled:opacity-40">Prev</button>
              <span className="px-3 py-2 text-xs font-mono text-muted">{Math.floor(offset/limit)+1} / {Math.ceil(total/limit)}</span>
              <button disabled={offset+limit >= total} onClick={() => { const n = offset+limit; setOffset(n); load(query, n); }} className="px-4 py-2 rounded-xl border border-border bg-surface text-sm disabled:opacity-40">Next</button>
            </div>
          </>
        )}
      </div>

      {(preview || previewLoading) && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm p-0 lg:p-4" onClick={() => setPreview(null)}>
          <div className="bg-card border border-border rounded-t-2xl lg:rounded-2xl w-full lg:max-w-3xl max-h-[88vh] lg:max-h-[85vh] overflow-hidden flex flex-col animate-slideIn lg:animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <span className="font-mono text-sm truncate pr-3">{preview?.path ? shortPath(preview.path) : "Loading..."}</span>
              <button onClick={() => setPreview(null)} className="shrink-0 w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center text-sm">✕</button>
            </div>
            {previewLoading ? <div className="p-10 text-center text-muted animate-pulse">Loading…</div> : (
              <div className="overflow-auto p-4 space-y-3">
                {preview?.meta && Object.keys(preview.meta).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">{Object.entries(preview.meta).slice(0, 10).map(([k,v]) => <span key={k} className="text-xs bg-surface border border-border rounded-full px-2.5 py-1 font-mono">{k}: {String(v).slice(0,60)}</span>)}</div>
                )}
                <pre className="text-xs whitespace-pre-wrap break-words font-mono leading-relaxed bg-background border border-border rounded-xl p-3 max-h-[52vh] overflow-auto">{(preview?.content || "").slice(0, 12000)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
