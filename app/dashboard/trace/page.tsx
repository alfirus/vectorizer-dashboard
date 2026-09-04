"use client";
import { useState } from "react";
import { Network, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TraceNode {
  id: string;
  kind: string;
  document?: string;
  workspace_id?: string;
  created_at?: string;
  depth: number;
  via?: string;
}

const KIND_COLORS: Record<string, string> = {
  conclusion: "#6366f1",
  message: "#22d3ee",
  edge: "#f59e0b",
};

export default function TracePage() {
  const [workspace, setWorkspace] = useState("maisarah");
  const [conclusionId, setConclusionId] = useState("");
  const [direction, setDirection] = useState("forward");
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runTrace = async () => {
    if (!workspace.trim() || !conclusionId.trim()) return;
    setLoading(true); setError(""); setNodes([]);
    try {
      const q = new URLSearchParams({ workspace_id: workspace.trim(), id: conclusionId.trim(), direction, depth: "5" });
      const res = await fetch(`/api/vectorizer/conclusions/trace?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Trace failed");
      setNodes(data.nodes || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-fadeIn max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Network className="w-5 h-5 text-primary" /> Trace</h1>
        <p className="text-sm text-muted">Why do I believe conclusion X? Walks reasoning edges down to supporting messages.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="workspace_id" className="bg-card border border-border rounded-xl px-3 py-2 text-sm w-40 focus:outline-none focus:border-primary" />
        <input value={conclusionId} onChange={e => setConclusionId(e.target.value)} onKeyDown={e => e.key === "Enter" && runTrace()} placeholder="conclusion id" className="flex-1 min-w-[200px] bg-card border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary" />
        <select value={direction} onChange={e => setDirection(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
          <option value="forward">forward</option>
          <option value="reverse">reverse</option>
        </select>
        <button onClick={runTrace} disabled={loading || !workspace.trim() || !conclusionId.trim()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Trace
        </button>
      </div>

      {error && <div className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

      {nodes.length > 0 ? (
        <div className="relative pl-6 space-y-0">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
          {nodes.map((n, i) => (
            <div key={i} className="relative pb-3">
              <span className="absolute -left-6 top-3 w-[11px] h-[11px] rounded-full border-2 border-background" style={{ backgroundColor: KIND_COLORS[n.kind] || "#64748b" }} />
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className={cn("px-2 py-0.5 rounded-full font-medium capitalize")} style={{ backgroundColor: `${KIND_COLORS[n.kind] || "#64748b"}22`, color: KIND_COLORS[n.kind] || "#64748b" }}>{n.kind}</span>
                  <span className="text-muted">depth {n.depth}</span>
                  {n.via && <span className="text-muted">via {n.via}</span>}
                </div>
                <p className="text-sm font-mono truncate">{n.id}</p>
                {n.document && <p className="text-xs text-muted mt-1 truncate">{n.document.slice(0, 200)}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : !loading && (
        <div className="py-10 text-center bg-card border border-border rounded-2xl">
          <p className="text-sm font-medium">No trace yet</p>
          <p className="text-xs text-muted mt-1">Enter a workspace + conclusion id to walk its reasoning chain.</p>
        </div>
      )}
    </div>
  );
}
