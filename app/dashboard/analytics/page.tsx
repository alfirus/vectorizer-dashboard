"use client";
import { useEffect, useState } from "react";
import { getSearchAnalytics, getWorkspaces } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { BarChart3, Layers, TrendingUp } from "lucide-react";

const COLORS = ["#7c3aed", "#22d3ee", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<{ total_workspaces: number; total_documents: number; workspaces: { workspace_id: string; document_count: number }[] } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [sparklines, setSparklines] = useState<number[]>([]);
  useEffect(() => { try { setSparklines(JSON.parse(sessionStorage.getItem("search_latencies") || "[]")); } catch {} }, []);
  useEffect(() => {
    Promise.all([getSearchAnalytics(), getWorkspaces()]).then(([a, w]) => {
      setAnalytics(a); setWorkspaces(w.workspaces || []);
      try { setSparklines(JSON.parse(sessionStorage.getItem("search_latencies") || "[]")); } catch {}
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const wsData = (analytics?.workspaces || []).map(ws => ({ name: ws.workspace_id.replace(/^ws_/, ""), count: ws.document_count }));
  const totalDocs = analytics?.total_documents || 0;

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2].map(i => <div key={i} className="h-48 bg-card border border-border rounded-2xl" />)}</div>;

  return (
    <div className="space-y-4 animate-fadeIn">
      <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> Analytics</h1>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center shadow-card"><div className="text-2xl font-bold">{analytics?.total_workspaces || 0}</div><div className="text-xs text-muted">Workspaces</div></div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center shadow-card"><div className="text-2xl font-bold">{totalDocs.toLocaleString()}</div><div className="text-xs text-muted">Documents</div></div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center shadow-card"><div className="text-2xl font-bold">{wsData.length ? Math.round(totalDocs / wsData.length) : 0}</div><div className="text-xs text-muted">Avg / WS</div></div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-muted" /> Documents by Workspace</h2>
        {wsData.length === 0 ? <p className="text-sm text-muted text-center py-6">No data.</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={wsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23233a" />
              <XAxis dataKey="name" tick={{ fill: "#6b7289", fontSize: 12 }} />
              <YAxis tick={{ fill: "#6b7289", fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid #23233a", borderRadius: 12 }} />
              <Bar dataKey="count" fill="#7c3aed" radius={[8,8,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-muted" /> Proportion</h2>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={wsData.length ? wsData.map(w => ({ name: w.name, value: w.count })) : [{ name: "No data", value: 1 }]} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
              {wsData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid #23233a", borderRadius: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-muted" /> Search latency <span className="text-xs font-normal text-muted">last 10 · ms</span></h2>
        {sparklines.length === 0 ? <p className="text-sm text-muted py-4 text-center">Search something first — latency will appear here.</p> : (
          <>
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={sparklines.map((v, i) => ({ i: i+1, v }))}><Bar dataKey="v" fill="#7c3aed" radius={[6,6,0,0]} /><Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid #23233a", borderRadius: 12 }} /></BarChart>
            </ResponsiveContainer>
            <div className="text-xs font-mono text-muted mt-1">avg {Math.round(sparklines.reduce((a,b)=>a+b,0)/sparklines.length)}ms · max {Math.max(...sparklines)}ms</div>
          </>
        )}
      </div>
    </div>
  );
}
