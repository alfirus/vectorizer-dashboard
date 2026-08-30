"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { getHealth, getWorkspaces } from "@/lib/api";
import type { HealthResponse, Workspace } from "@/lib/types";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getHealth(), getWorkspaces()])
      .then(([h, w]) => {
        setHealth(h);
        setWorkspaces(w.workspaces || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="🟢"
          label="Status"
          value={health?.status || "unknown"}
          accent="text-success"
        />
        <StatCard icon="📦" label="Workspaces" value={workspaces.length} />
        <StatCard
          icon="🤖"
          label="Embedding Model"
          value={health?.embedding_model || "—"}
        />
        <StatCard
          icon="🧠"
          label="LLM Brain"
          value={health?.llm_enabled ? "Enabled" : "Disabled"}
          accent={health?.llm_enabled ? "text-success" : "text-muted"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-muted mb-3">
            System Info
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Version" value={health?.version || "—"} />
            <Row label="ChromaDB" value={health?.chromadb || "—"} />
            <Row
              label="LLM Enabled"
              value={health?.llm_enabled ? "Yes" : "No"}
            />
          </dl>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-muted mb-3">
            Workspaces
          </h2>
          {workspaces.length === 0 ? (
            <p className="text-sm text-muted">No workspaces found.</p>
          ) : (
            <ul className="space-y-2">
              {workspaces.map((ws) => (
                <li
                  key={ws.id}
                  className="flex items-center justify-between text-sm px-2 py-1 rounded bg-surface-hover"
                >
                  <span className="font-mono capitalize">{ws.name || ws.id}</span>
                  <span className="text-muted text-xs">
                    {ws.created_at !== "0001-01-01T00:00:00Z"
                      ? new Date(ws.created_at).toLocaleDateString()
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-surface-hover rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-surface-hover rounded-lg" />
        ))}
      </div>
    </div>
  );
}
