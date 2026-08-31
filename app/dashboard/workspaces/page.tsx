"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getWorkspaces, createWorkspace, deleteWorkspace, getHealth, getCollections } from "@/lib/api";
import type { Workspace, HealthResponse, ChromaCollection } from "@/lib/types";

interface WorkspaceHealth {
  embeddingModel: string;
  docCount: number;
  dimension: number | null;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Health data
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [wsHealth, setWsHealth] = useState<Record<string, WorkspaceHealth>>({});

  const loadWorkspaces = useCallback(() => {
    Promise.all([getWorkspaces(), getHealth(), getCollections()])
      .then(([w, h, collections]) => {
        setWorkspaces(w.workspaces || []);
        setHealth(h);

        // Build health map per workspace from ChromaDB collections
        const colMap: Record<string, ChromaCollection> = {};
        for (const col of collections) {
          colMap[col.name] = col;
        }

        const healthData: Record<string, WorkspaceHealth> = {};
        for (const ws of w.workspaces || []) {
          const colName = `ws_${ws.id}`;
          const col = colMap[colName];
          healthData[ws.id] = {
            embeddingModel: h?.embedding_model || "—",
            docCount: ws.document_count || col?.document_count || 0,
            dimension: col?.dimension ?? null,
          };
        }
        setWsHealth(healthData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(newName.trim());
      setNewName("");
      setShowCreate(false);
      loadWorkspaces();
    } catch (err) {
      console.error(err);
      alert("Failed to create workspace");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete workspace "${id}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteWorkspace(id);
      loadWorkspaces();
    } catch (err) {
      console.error(err);
      alert("Failed to delete workspace");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-primary/15 text-primary border border-primary/30 rounded-lg text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          {showCreate ? "Cancel" : "+ Add Workspace"}
        </button>
      </div>

      {showCreate && (
        <div className="flex items-center gap-3 bg-surface border border-border rounded-lg p-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Workspace name…"
            className="flex-1 bg-transparent border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <p className="text-muted">No workspaces found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => {
            const h = wsHealth[ws.id];
            return (
              <div
                key={ws.id}
                className="relative group bg-surface border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
              >
                <Link href={`/dashboard/workspaces/${ws.id}`} className="block">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🗂️</span>
                    <h2 className="font-semibold font-mono">{ws.id}</h2>
                  </div>
                  {ws.name && (
                    <p className="text-sm text-muted mb-1">{ws.name}</p>
                  )}

                  {/* Health info */}
                  {h && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Documents</span>
                        <span className="text-foreground font-mono">{h.docCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Embedding</span>
                        <span className="text-foreground font-mono text-right truncate max-w-[150px]" title={h.embeddingModel}>
                          {h.embeddingModel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Dimension</span>
                        <span className="text-foreground font-mono">
                          {h.dimension ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted mt-3">
                    Created:{" "}
                    {ws.created_at !== "0001-01-01T00:00:00Z"
                      ? new Date(ws.created_at).toLocaleDateString()
                      : "—"}
                  </p>
                </Link>
                <button
                  onClick={() => handleDelete(ws.id)}
                  disabled={deleting === ws.id}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-red-400 hover:bg-red-500/15 transition-all disabled:opacity-30"
                  title="Delete workspace"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
