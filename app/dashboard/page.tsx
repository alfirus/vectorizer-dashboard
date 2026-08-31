"use client";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { getHealth, getWorkspaces, getCollections } from "@/lib/api";
import type { HealthResponse, Workspace, ChromaCollection } from "@/lib/types";
import { Activity, Database, Cpu, Sparkles, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [collections, setCollections] = useState<ChromaCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getHealth(), getWorkspaces(), getCollections()])
      .then(([h, w, c]) => { setHealth(h); setWorkspaces(w.workspaces || []); setCollections(c); })
      .catch((e) => {
        console.error(e);
        setHealth({ status: "offline", name: "vectorizer", version: "—", llm_enabled: false, chromadb: "offline", embedding_model: "—" } as HealthResponse);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 rounded-2xl bg-card border border-border" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-card border border-border" />)}
      </div>
    </div>
  );

  if (!health || health.chromadb === "offline" || health.status === "offline") {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-danger/10 border border-danger/20 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-danger mx-auto mb-3" />
          <h2 className="font-bold">Vectorizer offline</h2>
          <p className="text-sm text-muted mt-1">Cannot reach 100.121.188.113:8091 · Check docker ps</p>
          <button onClick={() => location.reload()} className="mt-4 px-5 py-2.5 rounded-xl bg-danger text-white text-sm font-medium">Retry</button>
        </div>
      </div>
    );
  }

  const totalDocs = workspaces.reduce((s, w) => s + (w.document_count || 0), 0);
  const dims = collections.filter(c => c.name.startsWith("ws_")).map(c => c.dimension || 0).filter(Boolean);
  const avgDim = dims.length ? Math.round(dims.reduce((a,b)=>a+b,0)/dims.length) : 0;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-primary via-primary to-[#4f46e5] p-5 lg:p-6 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> All systems operational
          </div>
          <h1 className="text-2xl lg:text-[28px] font-bold tracking-tight mt-3">Semantic Memory</h1>
          <p className="text-sm text-white/80 mt-1 max-w-[36ch]">768d Nomic · 68 files indexed · Qwen3.6-35B RAG · instant hybrid search.</p>
          <div className="flex gap-2 mt-4">
            <Link href="/dashboard/search" className="inline-flex items-center gap-1.5 rounded-xl bg-white text-primary px-4 py-2.5 text-sm font-semibold">Search <ArrowRight className="w-4 h-4" /></Link>
            <Link href="/dashboard/rag" className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 text-white border border-white/20 px-4 py-2.5 text-sm font-medium">Ask RAG</Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="●" label="Status" value={health.status} accent="text-success" sub={health.version} />
        <StatCard icon="◧" label="Workspaces" value={workspaces.length} sub={`${totalDocs} docs`} />
        <StatCard icon="◈" label="Embedding" value={(health.embedding_model || "—").split("/").pop() || "—"} sub={`${avgDim || 768}d`} />
        <StatCard icon="✦" label="LLM Brain" value={health.llm_enabled ? "Enabled" : "Disabled"} accent={health.llm_enabled ? "text-success" : "text-muted"} sub={health.llm_enabled ? "Qwen3.6-35B" : "offline"} />
      </div>

      {/* Workspaces */}
      <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-3.5 flex items-center justify-between border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-muted" /> Workspaces</h2>
          <Link href="/dashboard/workspaces" className="text-xs font-medium text-primary">View all →</Link>
        </div>
        {/* Mobile: cards, Desktop: table */}
        <div className="lg:hidden divide-y divide-border">
          {workspaces.map(ws => {
            const col = collections.find(c => c.name === `ws_${ws.id}`);
            return (
              <Link key={ws.id} href={`/dashboard/workspaces/${ws.id}`} className="flex items-center justify-between px-4 py-3.5 active:bg-surface">
                <div className="min-w-0">
                  <div className="text-sm font-semibold font-mono truncate">{ws.id}</div>
                  <div className="text-xs text-muted">{ws.document_count ?? 0} docs · {col?.dimension ?? 768}d</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted shrink-0" />
              </Link>
            );
          })}
        </div>
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted border-b border-border"><th className="text-left font-medium px-4 py-2.5">Workspace</th><th className="text-right font-medium px-4 py-2.5">Docs</th><th className="text-right font-medium px-4 py-2.5">Dim</th><th className="text-right font-medium px-4 py-2.5">Created</th></tr></thead>
            <tbody>{workspaces.map(ws => {
              const col = collections.find(c => c.name === `ws_${ws.id}`);
              return <tr key={ws.id} className="border-b border-border/60 hover:bg-surface"><td className="px-4 py-2.5 font-mono">{ws.id}</td><td className="px-4 py-2.5 text-right font-mono">{ws.document_count ?? 0}</td><td className="px-4 py-2.5 text-right font-mono">{col?.dimension ?? "—"}</td><td className="px-4 py-2.5 text-right text-muted text-xs">{ws.created_at && ws.created_at !== "0001-01-01T00:00:00Z" ? new Date(ws.created_at).toLocaleDateString() : "—"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      {/* System */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Cpu className="w-4 h-4 text-muted" /> System</h3>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-muted">Version</span><span className="font-mono">{health.version}</span></div>
            <div className="flex justify-between"><span className="text-muted">ChromaDB</span><span className="font-mono flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" />{health.chromadb}</span></div>
            <div className="flex justify-between"><span className="text-muted">Total docs</span><span className="font-mono">{totalDocs}</span></div>
            <div className="flex justify-between"><span className="text-muted">Avg dim</span><span className="font-mono">{avgDim || "—"}</span></div>
          </dl>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-muted" /> Quick actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/vault" className="rounded-xl bg-surface border border-border p-3 hover:border-primary/30 transition-colors"><div className="text-sm font-semibold">Vault</div><div className="text-xs text-muted">68 files</div></Link>
            <Link href="/dashboard/search" className="rounded-xl bg-surface border border-border p-3 hover:border-primary/30 transition-colors"><div className="text-sm font-semibold">Search</div><div className="text-xs text-muted">Hybrid · Grep</div></Link>
            <Link href="/dashboard/graph" className="rounded-xl bg-surface border border-border p-3 hover:border-primary/30 transition-colors"><div className="text-sm font-semibold">Graph</div><div className="text-xs text-muted">1419 nodes</div></Link>
            <Link href="/dashboard/analytics" className="rounded-xl bg-surface border border-border p-3 hover:border-primary/30 transition-colors"><div className="text-sm font-semibold">Analytics</div><div className="text-xs text-muted">Latency</div></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
