"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getWorkspaces } from "@/lib/api";
import type { Workspace } from "@/lib/types";

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkspaces()
      .then((r) => setWorkspaces(r.workspaces || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Workspaces</h1>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <p className="text-muted">No workspaces found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/dashboard/workspaces/${ws.id}`}
              className="block bg-surface border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🗂️</span>
                <h2 className="font-semibold font-mono">{ws.id}</h2>
              </div>
              {ws.name && (
                <p className="text-sm text-muted mb-1">{ws.name}</p>
              )}
              <p className="text-xs text-muted">
                Created:{" "}
                {ws.created_at !== "0001-01-01T00:00:00Z"
                  ? new Date(ws.created_at).toLocaleDateString()
                  : "—"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
