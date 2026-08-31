"use client";
import { useEffect, useState } from "react";
import { Search as SearchIcon, SlidersHorizontal, Clock, Hash, Sparkles, Copy, Check } from "lucide-react";
import { searchMessages, getWorkspaces, grepMessages, temporalSearch } from "@/lib/api";
import type { SearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Hit { id: string; score: number; document: string; metadata: Record<string, unknown>; source?: string; }
type Mode = "semantic" | "hybrid" | "grep" | "temporal";

function Highlight({ text, query }: { text: string; query: string }) {
  const snippet = text.slice(0, 560);
  const q = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!q.length) return <>{snippet}{text.length > 560 ? "…" : ""}</>;
  const re = new RegExp(`(${q.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = snippet.split(re);
  return <>{parts.map((p, i) => q.some(s => s.toLowerCase() === p.toLowerCase()) ? <mark key={i} className="bg-primary/20 text-primary rounded px-0.5">{p}</mark> : <span key={i}>{p}</span>)}{text.length > 560 ? "…" : ""}</>;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [nResults, setNResults] = useState(10);
  const [mode, setMode] = useState<Mode>("semantic");
  const [after, setAfter] = useState(""); const [before, setBefore] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [page, setPage] = useState(0); const [copied, setCopied] = useState<string | null>(null);
  const pageSize = 10; const paged = results.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(results.length / pageSize);

  useEffect(() => { getWorkspaces().then(r => setWorkspaces(r.workspaces || [])).catch(console.error); }, []);
  const handleSearch = async () => {
    if (!query.trim()) return;
    if ((mode === "grep" || mode === "temporal") && workspace === "all") { alert("Grep/Temporal require a workspace — choose one."); return; }
    setLoading(true); setSearched(true); setPage(0);
    const t0 = performance.now();
    try {
      const ws = workspace === "all" ? undefined : workspace;
      let res: SearchResponse & { latency_ms?: number };
      if (mode === "grep") res = await grepMessages(workspace, query) as unknown as SearchResponse & { latency_ms?: number };
      else if (mode === "temporal") res = await temporalSearch(workspace, query, after || undefined, before || undefined) as unknown as SearchResponse & { latency_ms?: number };
      else { const hybrid = mode === "hybrid"; res = await searchMessages(query, ws, nResults, hybrid); if (res.latency_ms) setLatency(res.latency_ms); else setLatency(Math.round(performance.now() - t0)); }
      if (mode !== "semantic" && mode !== "hybrid") setLatency(Math.round(performance.now() - t0));
      setResults((res.results || []) as Hit[]);
      { const v = (res as SearchResponse & { latency_ms?: number }).latency_ms || Math.round(performance.now() - t0);
        try { const arr = JSON.parse(sessionStorage.getItem("search_latencies") || "[]"); arr.push(v); if (arr.length > 10) arr.shift(); sessionStorage.setItem("search_latencies", JSON.stringify(arr)); } catch {} }
    } catch (e) { console.error(e); setResults([]); setLatency(null); } finally { setLoading(false); }
  };
  const copy = (id: string, t: string) => { navigator.clipboard.writeText(t); setCopied(id); setTimeout(() => setCopied(null), 1200); };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Search</h1>
        {latency !== null && !loading && searched && <span className="text-xs font-mono text-muted bg-card border border-border rounded-full px-2.5 py-1">{latency}ms · {results.length} hits</span>}
      </div>

      {/* Search bar */}
      <div className="bg-card border border-border rounded-2xl shadow-card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder={mode === "grep" ? "Keyword…" : mode === "temporal" ? "Query + time range…" : mode === "hybrid" ? "Hybrid: vector + BM25…" : "Search your memory…"}
              className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted"
            />
          </div>
          <button onClick={handleSearch} disabled={loading || !query.trim()} className="shrink-0 rounded-xl bg-primary text-white px-5 py-3 text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 active:scale-[0.98] transition-all">Search</button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl bg-background border border-border px-2 py-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted" />
            <select value={workspace} onChange={e => setWorkspace(e.target.value)} className="bg-transparent text-sm focus:outline-none py-1">
              <option value="all">All workspaces</option>
              {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name || ws.id}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-background border border-border p-1">
            {(["semantic","hybrid","grep","temporal"] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium capitalize", mode === m ? "bg-primary text-white" : "text-muted hover:text-foreground")}>
                {m === "hybrid" ? "Hybrid" : m}
              </button>
            ))}
          </div>
          {mode !== "grep" && mode !== "temporal" && (
            <span className="flex items-center gap-2 text-xs text-muted ml-1">
              <Hash className="w-3.5 h-3.5" />
              <input type="range" min={1} max={50} value={nResults} onChange={e => setNResults(Number(e.target.value))} className="w-20 accent-primary" />
              <span className="w-5 text-center font-mono text-foreground">{nResults}</span>
            </span>
          )}
        </div>

        {mode === "temporal" && (
          <div className="flex gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted bg-background border border-border rounded-xl px-3 py-2">
              <Clock className="w-3.5 h-3.5" /> After <input type="date" value={after} onChange={e => setAfter(e.target.value)} className="bg-transparent focus:outline-none text-foreground ml-1" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted bg-background border border-border rounded-xl px-3 py-2">
              <Clock className="w-3.5 h-3.5" /> Before <input type="date" value={before} onChange={e => setBefore(e.target.value)} className="bg-transparent focus:outline-none text-foreground ml-1" />
            </label>
          </div>
        )}

        {mode !== "semantic" && (
          <p className="text-xs text-muted flex items-center gap-1.5">
            {mode === "hybrid" && <><Sparkles className="w-3.5 h-3.5" /> Hybrid merges vector cosine + BM25 via RRF — best for keyword-heavy queries.</>}
            {mode === "grep" && <>Exact substring, case-insensitive. Requires workspace.</>}
            {mode === "temporal" && <>Filters by after/before date. Requires workspace.</>}
          </p>
        )}
      </div>

      {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 bg-card border border-border rounded-2xl animate-pulse" />)}</div>}
      {!loading && searched && results.length === 0 && <div className="bg-card border border-border rounded-2xl p-10 text-center"><div className="text-3xl mb-2">🔍</div><p className="text-sm text-muted">No results. Try Hybrid or a different workspace.</p></div>}

      {!loading && paged.length > 0 && (
        <>
          <div className="space-y-3">
            {paged.map((r, i) => (
              <div key={r.id || i} className="bg-card border border-border rounded-2xl p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {typeof r.score === "number" && (
                    <span className={cn("px-2 py-1 rounded-full text-xs font-bold", r.score > 0.8 ? "bg-success/15 text-success" : r.score > 0.5 ? "bg-warning/15 text-warning" : "bg-muted/10 text-muted")}>
                      {(r.score * 100).toFixed(0)}%
                    </span>
                  )}
                  {r.source && <span className="text-xs px-2 py-1 bg-surface border border-border rounded-full">{r.source}</span>}
                  <span className="text-xs font-mono text-muted">{String(r.metadata?.workspace_id || "").slice(0,18)}</span>
                  <span className="text-xs font-mono text-muted truncate max-w-[150px]" title={String(r.metadata?.source_path || "")}>{String(r.metadata?.source_path || r.metadata?.header_path || "").split("/").slice(-2).join("/")}</span>
                  <button onClick={() => copy(r.id || String(i), r.document || "")} className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border bg-surface hover:bg-surface-hover">
                    {copied === (r.id || String(i)) ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />} {copied === (r.id || String(i)) ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words"><Highlight text={r.document || ""} query={query} /></p>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p-1))} className="px-4 py-2 rounded-xl border border-border bg-card text-sm disabled:opacity-40">Prev</button>
              <span className="text-xs font-mono text-muted">{page+1} / {totalPages}</span>
              <button disabled={page >= totalPages-1} onClick={() => setPage(p => p+1)} className="px-4 py-2 rounded-xl border border-border bg-card text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
