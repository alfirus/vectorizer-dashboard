"use client";
import { useState } from "react";
import { GitBranch, Loader2, ArrowLeft } from "lucide-react";

export default function CodePage() {
  const [workspace, setWorkspace] = useState("code_vectorizer");
  const [symbol, setSymbol] = useState("");
  const [callers, setCallers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState("");

  const runCallers = async (sym?: string) => {
    const target = (sym ?? symbol).trim();
    if (!workspace.trim() || !target) return;
    setLoading(true); setError(""); setCallers([]); setSearched(target);
    try {
      const q = new URLSearchParams({ workspace_id: workspace.trim(), symbol: target });
      const res = await fetch(`/api/vectorizer/code/callers?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setCallers(data.callers || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-fadeIn max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><GitBranch className="w-5 h-5 text-primary" /> Code</h1>
        <p className="text-sm text-muted">What calls this symbol? Answered from CALLS reasoning edges.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="workspace_id" className="bg-card border border-border rounded-xl px-3 py-2 text-sm w-44 focus:outline-none focus:border-primary" />
        <input value={symbol} onChange={e => setSymbol(e.target.value)} onKeyDown={e => e.key === "Enter" && runCallers()} placeholder="SymbolName (e.g. UpdateMessageSections)" className="flex-1 min-w-[200px] bg-card border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary" />
        <button onClick={() => runCallers()} disabled={loading || !workspace.trim() || !symbol.trim()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Who calls?
        </button>
      </div>

      {error && <div className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

      {searched && !loading && !error && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm mb-3">
            <span className="font-mono font-semibold">{searched}</span>
            <span className="text-muted"> is called by {callers.length} symbol{callers.length === 1 ? "" : "s"}</span>
          </p>
          {callers.length > 0 ? (
            <div className="space-y-1.5">
              {callers.map(c => (
                <button key={c} onClick={() => { setSymbol(c); runCallers(c); }} title="Trace this caller"
                  className="w-full text-left flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2 text-sm font-mono hover:border-primary/50">
                  <ArrowLeft className="w-3.5 h-3.5 text-primary shrink-0" /> {c}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No callers found — symbol may be an entrypoint, or the workspace needs re-indexing on fresh code.</p>
          )}
        </div>
      )}
    </div>
  );
}
