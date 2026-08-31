"use client";

import { useEffect, useState } from "react";

interface VaultFile {
  path: string;
  hash: string;
  chunks: number;
  mtime?: string;
}

interface VaultStats {
  files: number;
  total_chunks: number;
  version: string;
  graph: { nodes: number; edges: number; byType: Record<string, number> };
}

export default function VaultPage() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = async (q = query, off = offset) => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch("/api/vault?action=stats").then((r) => r.json()),
        fetch(`/api/vault?limit=${limit}&offset=${off}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((r) =>
          r.json()
        ),
      ]);
      if (sRes.files !== undefined) setStats(sRes);
      if (lRes.files) {
        setFiles(lRes.files);
        setTotal(lRes.total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setOffset(0);
    load(query, 0);
  };

  const handleReindex = async (dryRun: boolean) => {
    setReindexing(true);
    setReindexResult(null);
    setReindexError(null);
    try {
      const res = await fetch("/api/admin/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setReindexError(data.error || data.stderr || "Reindex failed");
        if (data.stdout) setReindexResult(data.stdout);
      } else {
        const out = data.vault?.stdout || "";
        const gOut = data.graph?.stdout || "";
        setReindexResult(
          `${out}\n${gOut ? `\n--- graph ---\n${gOut}` : ""}\n(${data.elapsed_ms}ms)`
        );
        if (!dryRun) load(query, offset);
      }
    } catch (e: unknown) {
      setReindexError(e instanceof Error ? e.message : String(e));
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vault</h1>
          <p className="text-sm text-muted mt-1">
            Markdown truth on SynologyDrive → 768d Nomic index. Reindex when files change.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleReindex(true)}
            disabled={reindexing}
            className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-surface-hover disabled:opacity-50"
          >
            {reindexing ? "…" : "Dry run"}
          </button>
          <button
            onClick={() => handleReindex(false)}
            disabled={reindexing}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {reindexing ? "Reindexing…" : "Reindex"}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-xs text-muted">Files indexed</div>
            <div className="text-xl font-bold">{stats.files}</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-xs text-muted">Total chunks</div>
            <div className="text-xl font-bold">{stats.total_chunks}</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-xs text-muted">Graph nodes / edges</div>
            <div className="text-xl font-bold">
              {stats.graph?.nodes || 0} / {stats.graph?.edges || 0}
            </div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="text-xs text-muted">Version</div>
            <div className="text-sm font-mono mt-1">{stats.version}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Filter by path…"
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-surface border border-border rounded-md text-sm hover:bg-surface-hover"
        >
          Search
        </button>
      </div>

      {/* Reindex output */}
      {(reindexResult || reindexError) && (
        <div className={`rounded-lg border p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto ${reindexError ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-surface border-border text-muted"}`}>
          {reindexError && <div className="text-red-400 font-bold mb-1">Error:</div>}
          {reindexError || reindexResult}
        </div>
      )}

      {/* File table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <p className="text-muted text-center py-8">No files found.</p>
      ) : (
        <>
          <div className="text-xs text-muted">
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </div>
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover">
                <tr className="text-left text-muted">
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium w-20">Chunks</th>
                  <th className="px-3 py-2 font-medium w-24">Hash</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.path} className="border-t border-border/50 hover:bg-surface-hover/50">
                    <td className="px-3 py-1.5 font-mono text-xs truncate max-w-[420px]" title={f.path}>
                      {f.path.replace(/^.*SynologyDrive\/ai\//, "").replace(/\\/g, "/")}
                    </td>
                    <td className="px-3 py-1.5 text-muted">{f.chunks}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted">{f.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              disabled={offset === 0}
              onClick={() => {
                const n = Math.max(0, offset - limit);
                setOffset(n);
                load(query, n);
              }}
              className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-surface-hover"
            >
              Prev
            </button>
            <button
              disabled={offset + limit >= total}
              onClick={() => {
                const n = offset + limit;
                setOffset(n);
                load(query, n);
              }}
              className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-surface-hover"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
