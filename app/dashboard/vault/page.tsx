"use client";
import { useEffect, useState } from "react";
import { FolderOpen, RefreshCw, Search, Eye, Hash, FileText, Sparkles } from "lucide-react";

interface VaultFile { path: string; hash: string; chunks: number; mtime?: string; }
interface VaultStats { files: number; total_chunks: number; version: string; graph: { nodes: number; edges: number; byType: Record<string, number> }; }
interface VaultFilePreview { path: string; content: string; meta: Record<string, unknown>; }

export default function VaultPage() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
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
      if (sRes.files !== undefined) setStats(sRes);
      if (lRes.files) { setFiles(lRes.files); setTotal(lRes.total); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { load("", 0); /* eslint-disable-next-line */ }, []);
  const handleSearch = () => { setOffset(0); load(query, 0); };
  const handleReindex = async (dryRun: boolean) => {
    setReindexing(true); setReindexResult(null); setReindexError(null);
    try {
      const res = await fetch("/api/admin/reindex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun }) });
      const data = await res.json();
      if (!res.ok || data.ok === false) { setReindexError(data.error || data.stderr || "Reindex failed"); if (data.stdout) setReindexResult(data.stdout); }
      else { const out = data.vault?.stdout || ""; const gOut = data.graph?.stdout || ""; setReindexResult(`${out}\n${gOut ? `\n--- graph ---\n${gOut}` : ""}\n(${data.elapsed_ms}ms)`); if (!dryRun) load(query, offset); }
    } catch (e: unknown) { setReindexError(e instanceof Error ? e.message : String(e)); } finally { setReindexing(false); }
  };
  const shortPath = (p: string) => p.replace(/^.*SynologyDrive\/ai\//, "").replace(/\\/g, "/");

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><FolderOpen className="w-5 h-5 text-primary" /> Vault</h1>
          <p className="text-sm text-muted mt-1">Markdown truth on SynologyDrive → 768d Nomic index.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleReindex(true)} disabled={reindexing} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border border-border bg-card hover:bg-surface">Dry run</button>
          <button onClick={() => handleReindex(false)} disabled={reindexing} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${reindexing ? "animate-spin" : ""}`} /> {reindexing ? "Reindexing…" : "Reindex"}
          </button>
        </div>
      </div>

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
