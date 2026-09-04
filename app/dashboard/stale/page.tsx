"use client";
import { useState } from "react";
import { Hourglass, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StaleItem {
  id: string;
  kind: string;
  document?: string;
  workspace_id: string;
  created_at?: string;
  age_days: number;
  importance?: number;
  reason: string;
}

export default function StalePage() {
  const [workspace, setWorkspace] = useState("maisarah");
  const [maxAge, setMaxAge] = useState("90");
  const [items, setItems] = useState<StaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const runScan = async () => {
    if (!workspace.trim()) return;
    setLoading(true); setError(""); setItems([]);
    try {
      const q = new URLSearchParams({ workspace_id: workspace.trim(), max_age_days: maxAge, limit: "50" });
      const res = await fetch(`/api/vectorizer/conclusions/stale?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setItems(data.candidates || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setLoading(false); }
  };

  const forget = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/vectorizer/messages/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspace.trim())}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeleting(null); }
  };

  return (
    <div className="animate-fadeIn max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Hourglass className="w-5 h-5 text-primary" /> Stale</h1>
        <p className="text-sm text-muted">Dead knowledge: old, never-reinforced, non-timeless. Scan proposes, you dispose.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="workspace_id" className="bg-card border border-border rounded-xl px-3 py-2 text-sm w-40 focus:outline-none focus:border-primary" />
        <select value={maxAge} onChange={e => setMaxAge(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
          <option value="30">older than 30d</option>
          <option value="90">older than 90d</option>
          <option value="180">older than 180d</option>
          <option value="365">older than 1y</option>
        </select>
        <button onClick={runScan} disabled={loading || !workspace.trim()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Scan
        </button>
      </div>

      {error && <div className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-xl p-3 flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-surface border border-border capitalize font-medium">{item.kind}</span>
                  <span className="text-muted">{item.age_days.toFixed(0)}d old</span>
                  {item.importance !== undefined && <span className="text-muted">imp {item.importance}</span>}
                </div>
                <p className="text-sm truncate">{item.document || item.id}</p>
                <p className="text-xs text-muted mt-1">{item.reason}</p>
              </div>
              <button onClick={() => forget(item.id)} disabled={deleting === item.id} title="Forget (DELETE)" className="shrink-0 w-9 h-9 rounded-xl border border-border bg-surface flex items-center justify-center hover:border-red-500/50 hover:text-red-400 disabled:opacity-50">
                {deleting === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      ) : !loading && (
        <div className="py-10 text-center bg-card border border-border rounded-2xl">
          <p className="text-sm font-medium">Nothing stale</p>
          <p className="text-xs text-muted mt-1">Run a scan — candidates show up here with a forget button.</p>
        </div>
      )}
    </div>
  );
}
