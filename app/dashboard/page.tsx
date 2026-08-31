"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { getHealth, getWorkspaces, getCollections } from "@/lib/api";
import type { HealthResponse, Workspace, ChromaCollection } from "@/lib/types";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [collections, setCollections] = useState<ChromaCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getHealth(), getWorkspaces(), getCollections()])
      .then(([h, w, c]) => {
        setHealth(h);
        setWorkspaces(w.workspaces || []);
        setCollections(c);
      })
      .catch((e) => {
        console.error(e);
        setHealth({ status: "offline", name: "vectorizer", version: "—", llm_enabled: false, chromadb: "offline", embedding_model: "—" } as HealthResponse);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (!health || health.chromadb === "offline" || health.status === "offline") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl lg:text-2xl font-bold">Dashboard</h1>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
          <div className="text-2xl mb-2">⚠️ Vectorizer offline</div>
          <p className="text-sm text-muted mb-3">Cannot reach Vectorizer at {typeof window !== "undefined" ? window.location.origin : "8091"}. Check docker ps and retry.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-500 text-white rounded-md text-sm">Retry</button>
        </div>
      </div>
    );
  }

  // Calculate totals
  const totalDocs = workspaces.reduce((sum, ws) => sum + (ws.document_count || 0), 0);
  const wsCollections = collections.filter((c) => c.name.startsWith("ws_"));
  const avgDimension = wsCollections.length > 0
    ? Math.round(wsCollections.reduce((sum, c) => sum + (c.dimension || 0), 0) / wsCollections.length)
    : 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-xl lg:text-2xl font-bold">Dashboard</h1>
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

      {/* Workspace Health Summary */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-muted mb-3">
          Workspace Health
        </h2>
        {workspaces.length === 0 ? (
          <p className="text-sm text-muted">No workspaces found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-muted font-medium py-2 pr-4">Workspace</th>
                  <th className="text-right text-muted font-medium py-2 px-4">Documents</th>
                  <th className="text-right text-muted font-medium py-2 px-4">Dimension</th>
                  <th className="text-right text-muted font-medium py-2 pl-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((ws) => {
                  const colName = `ws_${ws.id}`;
                  const col = collections.find((c) => c.name === colName);
                  return (
                    <tr key={ws.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <td className="py-2 pr-4 font-mono text-foreground">{ws.name || ws.id}</td>
                      <td className="py-2 px-4 text-right font-mono text-foreground">
                        {ws.document_count ?? "—"}
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-foreground">
                        {col?.dimension ?? "—"}
                      </td>
                      <td className="py-2 pl-4 text-right text-muted">
                        {ws.created_at !== "0001-01-01T00:00:00Z"
                          ? new Date(ws.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
            <Row label="Total Documents" value={String(totalDocs)} />
            <Row label="Avg Dimension" value={avgDimension > 0 ? String(avgDimension) : "—"} />
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
                    {ws.document_count || 0} docs
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
