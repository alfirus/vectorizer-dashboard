"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getWorkspaces, createWorkspace, deleteWorkspace, getHealth, getCollections } from "@/lib/api";
import type { Workspace, HealthResponse, ChromaCollection } from "@/lib/types";
import { FolderKanban, Plus, Trash2, Search, Layers, Box } from "lucide-react";

interface WH { embeddingModel: string; docCount: number; dimension: number | null; }

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState(""); const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [wsHealth, setWsHealth] = useState<Record<string, WH>>({});

  const load = useCallback(() => {
    Promise.all([getWorkspaces(), getHealth(), getCollections()]).then(([w, h, cols]) => {
      setWorkspaces(w.workspaces || []);
      const colMap: Record<string, ChromaCollection> = {}; for (const c of cols) colMap[c.name] = c;
      const hd: Record<string, WH> = {};
      for (const ws of w.workspaces || []) {
        const col = colMap[`ws_${ws.id}`];
        hd[ws.id] = { embeddingModel: h?.embedding_model || "—", docCount: ws.document_count || col?.document_count || 0, dimension: col?.dimension ?? null };
      }
      setWsHealth(hd);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return; setCreating(true);
    try { await createWorkspace(newName.trim()); setNewName(""); setShowCreate(false); load(); }
    catch { alert("Failed to create workspace"); } finally { setCreating(false); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm(`Delete workspace "${id}"? This cannot be undone.`)) return;
    setDeleting(id); try { await deleteWorkspace(id); load(); } catch { alert("Failed to delete"); } finally { setDeleting(null); }
  };
  const filtered = q ? workspaces.filter(w => w.id.toLowerCase().includes(q.toLowerCase()) || (w.name || "").toLowerCase().includes(q.toLowerCase())) : workspaces;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><FolderKanban className="w-5 h-5 text-primary" /> Workspaces</h1>
        <button onClick={() => setShowCreate(!showCreate)} className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold ${showCreate ? "bg-card border border-border" : "bg-primary text-white"}`}>
          <Plus className="w-4 h-4" /> {showCreate ? "Cancel" : "New"}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter workspaces…" className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-2xl p-4 shadow-card flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} placeholder="Workspace name…" autoFocus className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <button onClick={handleCreate} disabled={creating || !newName.trim()} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 shrink-0">{creating ? "…" : "Create"}</button>
        </div>
      )}

      {loading ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{[1,2,3].map(i => <div key={i} className="h-32 bg-card border border-border rounded-2xl animate-pulse" />)}</div>
      : filtered.length === 0 ? <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted">{q ? "No matches." : "No workspaces yet."}</div>
      : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(ws => {
            const h = wsHealth[ws.id];
            return (
              <div key={ws.id} className="group relative bg-card border border-border rounded-2xl p-4 shadow-card hover:border-primary/30 transition-colors">
                <Link href={`/dashboard/workspaces/${ws.id}`} className="block">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"><FolderKanban className="w-4 h-4 text-primary" /></div>
                    <div className="min-w-0"><div className="text-sm font-bold font-mono truncate">{ws.id}</div><div className="text-xs text-muted truncate">{ws.name || "—"}</div></div>
                  </div>
                  {h && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-surface border border-border px-2.5 py-2 text-center"><div className="text-xs text-muted flex items-center justify-center gap-1"><Layers className="w-3 h-3" /> Docs</div><div className="text-sm font-bold font-mono">{h.docCount}</div></div>
                      <div className="rounded-xl bg-surface border border-border px-2.5 py-2 text-center"><div className="text-xs text-muted flex items-center justify-center gap-1"><Box className="w-3 h-3" /> Dim</div><div className="text-sm font-bold font-mono">{h.dimension ?? "—"}</div></div>
                      <div className="rounded-xl bg-surface border border-border px-2.5 py-2 text-center"><div className="text-xs text-muted">Model</div><div className="text-[11px] font-mono truncate" title={h.embeddingModel}>{h.embeddingModel.split("/").pop()}</div></div>
                    </div>
                  )}
                  <div className="text-[11px] text-muted font-mono mt-2">{ws.created_at && ws.created_at !== "0001-01-01T00:00:00Z" ? new Date(ws.created_at).toLocaleDateString() : "—"}</div>
                </Link>
                <button onClick={() => handleDelete(ws.id)} disabled={deleting === ws.id} className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-danger/10 border border-danger/20 text-danger flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
