"use client";

import { useState, useEffect } from "react";
import { searchMessages, getWorkspaces, grepMessages, temporalSearch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Hit {
  id: string;
  score: number;
  document: string;
  metadata: Record<string, unknown>;
  source?: string;
}

type Mode = "semantic" | "hybrid" | "grep" | "temporal";

function highlightSnippet(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text.slice(0, 600) + (text.length > 600 ? "…" : "");
  const q = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (q.length === 0) return text.slice(0, 600) + (text.length > 600 ? "…" : "");
  const escaped = q.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const snippet = text.slice(0, 600);
  const parts = snippet.split(re);
  return parts.map((part, i) => q.some(s => s.toLowerCase() === part.toLowerCase()) ? <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{part}</mark> : part).concat(text.length > 600 ? "…" : "");
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [nResults, setNResults] = useState(10);
  const [mode, setMode] = useState<Mode>("semantic");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const paged = results.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(results.length / pageSize);

  useEffect(() => {
    getWorkspaces()
      .then((r) => setWorkspaces(r.workspaces || []))
      .catch(console.error);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    if ((mode === "grep" || mode === "temporal") && workspace === "all") {
      alert("Grep/Temporal require a workspace — choose one.");
      return;
    }
    setLoading(true);
    setSearched(true);
    setPage(0);
    const t0 = performance.now();
    try {
      const ws = workspace === "all" ? undefined : workspace;
      let res;
      if (mode === "grep") res = await grepMessages(workspace, query);
      else if (mode === "temporal") res = await temporalSearch(workspace, query, after || undefined, before || undefined);
      else {
        const hybrid = mode === "hybrid";
        res = await searchMessages(query, ws, nResults, hybrid);
        if (res.latency_ms) setLatency(res.latency_ms);
        else setLatency(Math.round(performance.now() - t0));
      }
      if (mode !== "semantic" && mode !== "hybrid") setLatency(Math.round(performance.now() - t0));
      setResults((res.results || []) as Hit[]);
    } catch (e) {
      console.error(e);
      setResults([]);
      setLatency(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Search</h1>
        {latency !== null && !loading && searched && (
          <span className="text-xs text-muted font-mono">{latency}ms · {results.length} hits</span>
        )}
      </div>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={
              mode === "grep" ? "Keyword (exact substring)…"
              : mode === "temporal" ? "Query + time range…"
              : mode === "hybrid" ? "Hybrid: vector + BM25 RRF…"
              : "Semantic search…"
            }
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted w-full lg:w-auto">
            Workspace:
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name || ws.id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-muted w-full lg:w-auto">
            Mode:
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
            >
              <option value="semantic">Semantic</option>
              <option value="hybrid">Hybrid (vector + BM25)</option>
              <option value="grep">Grep (keyword)</option>
              <option value="temporal">Temporal</option>
            </select>
          </label>

          {mode !== "grep" && mode !== "temporal" && (
            <label className="flex items-center gap-2 text-muted w-full lg:w-auto">
              Results:
              <input
                type="range"
                min={1}
                max={50}
                value={nResults}
                onChange={(e) => setNResults(Number(e.target.value))}
                className="w-24"
              />
              <span className="w-6 text-center">{nResults}</span>
            </label>
          )}

          {mode === "temporal" && (
            <>
              <label className="flex items-center gap-1 text-muted">
                After:
                <input type="date" value={after} onChange={(e) => setAfter(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-xs" />
              </label>
              <label className="flex items-center gap-1 text-muted">
                Before:
                <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-xs" />
              </label>
            </>
          )}
        </div>
        <p className="text-xs text-muted">
          {mode === "hybrid" && "Hybrid merges vector cosine + BM25 via RRF + time decay — best for keyword-heavy queries."}
          {mode === "grep" && "Grep is exact substring — no embedding, case-insensitive. Requires workspace."}
          {mode === "temporal" && "Temporal filters by after/before (ISO date). Requires workspace."}
        </p>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-muted text-center py-8">No results found.</p>
      )}

      {!loading && paged.length > 0 && (
        <>
          <div className="space-y-3">
            {paged.map((r, i) => (
              <div
                key={r.id || i}
                className="bg-surface border border-border rounded-lg p-4"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {typeof r.score === "number" && (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-bold",
                        r.score > 0.8
                          ? "bg-success/15 text-success"
                          : r.score > 0.5
                          ? "bg-warning/15 text-warning"
                          : "bg-muted/15 text-muted"
                      )}
                    >
                      {(r.score * 100).toFixed(1)}%
                    </span>
                  )}
                  {r.source && (
                    <span className="text-xs text-muted px-2 py-0.5 bg-surface-hover rounded">
                      {r.source}
                    </span>
                  )}
                  <span className="text-xs text-muted font-mono">
                    {String(r.metadata?.workspace_id || "").slice(0, 20)}
                  </span>
                  <span className="text-xs text-muted font-mono truncate max-w-[160px]" title={String(r.metadata?.source_path || "")}>
                    {String(r.metadata?.source_path || r.metadata?.header_path || "").split("/").slice(-2).join("/")}
                  </span>
                  <span className="text-xs text-muted font-mono">
                    {String(r.metadata?.session_id || r.id).slice(0, 18)}
                  </span>
                  {r.metadata?.role ? (
                    <span className="text-xs text-muted px-2 py-0.5 bg-surface-hover rounded">
                      {String(r.metadata.role)}
                    </span>
                  ) : null}
                  <button onClick={() => { navigator.clipboard.writeText(r.document || ""); }} className="ml-auto text-xs px-2 py-0.5 border border-border rounded hover:bg-surface-hover">Copy</button>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {highlightSnippet(r.document || "", query)}
                </p>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-surface-hover">Prev</button>
              <span className="text-xs text-muted font-mono">{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-surface-hover">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
