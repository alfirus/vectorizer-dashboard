"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import type { ActivityData } from "@/lib/types";
import {
  Activity, Heart, Zap, MessageSquare, Search, AlertTriangle,
  Database, Users, Webhook, Key, Clock, RefreshCw, TrendingUp,
  Circle, ArrowUpRight, Server
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

function timeAgo(ts: string | undefined): string {
  if (!ts) return "unknown";
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? "bg-success animate-pulse" : "bg-danger"}`} />
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-card hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color || "bg-primary/10"}`}>
          <Icon className={`w-4 h-4 ${color ? "text-white" : "text-primary"}`} />
        </div>
        <span className="text-xs text-muted font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ActivityPage() {
  // Action metadata for the per-agent breakdown ("what did Shiela store, what did Sofia search")
  const ACTION_META: { key: string; label: string; Icon: any }[] = [
    { key: "search", label: "search", Icon: Search },
    { key: "store", label: "stored", Icon: Database },
    { key: "ask", label: "ask", Icon: MessageSquare },
    { key: "chat", label: "chat", Icon: MessageSquare },
    { key: "code", label: "code", Icon: Zap },
    { key: "upload", label: "upload", Icon: ArrowUpRight },
    { key: "other", label: "other", Icon: Activity },
  ];
  const [data, setData] = useState<ActivityData | null>(null);
  const [agentData, setAgentData] = useState<{ chartData: any[]; agents: { name: string; total: number; color: string; actions: Record<string, number> }[]; totalCalls: number } | null>(null);
  const [usageDays, setUsageDays] = useState<7 | 30>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to load activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(true), 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  // Daily usage by agent (separate fetch — refreshes on toggle + every 60s, not every 5s)
  useEffect(() => {
    let cancelled = false;
    const fetchAgentUsage = async () => {
      try {
        const res = await fetch(`/api/usage-by-agent?days=${usageDays}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.chartData) setAgentData(json);
      } catch { /* usage is bonus — activity page works without it */ }
    };
    fetchAgentUsage();
    const t = setInterval(fetchAgentUsage, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [usageDays]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-card rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-card rounded-2xl" />)}
        </div>
        <div className="h-64 bg-card rounded-2xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" /> Activity
        </h1>
        <div className="bg-card border border-danger/30 rounded-2xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-2" />
          <p className="text-sm text-muted">{error}</p>
          <button onClick={() => fetchData()} className="mt-3 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const health = data?.health;
  const m = data?.metrics;
  const ws = data?.workspaces || [];
  const msgs = data?.recentMessages || [];
  const sessions = data?.sessions || [];
  const webhooks = data?.webhooks || [];
  const keys = data?.apiKeys || [];
  const isHealthy = health?.status === "ok" && health?.chromadb === "ok";

  // Build workspace bar chart data
  const wsChartData = ws.map((w: any) => ({
    name: w.id,
    docs: w.document_count || 0,
  }));

  // Role distribution
  const roleCounts = { user: 0, assistant: 0, system: 0 };
  msgs.forEach((m: any) => { roleCounts[m.role as keyof typeof roleCounts] = (roleCounts[m.role as keyof typeof roleCounts] || 0) + 1; });

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" /> Activity
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted font-mono">
            <Clock className="w-3 h-3 inline mr-1" />
            {lastRefresh.toLocaleTimeString()}
          </span>
          {refreshing && <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />}
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" title="Auto-refreshing every 5s" />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-2 text-xs text-danger">
          Refresh failed: {error}
        </div>
      )}

      {/* Server Health */}
      <div className={`bg-card border rounded-2xl p-4 shadow-card flex items-center gap-4 ${isHealthy ? "border-success/30" : "border-danger/30"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isHealthy ? "bg-success/10" : "bg-danger/10"}`}>
          <Server className={`w-5 h-5 ${isHealthy ? "text-success" : "text-danger"}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <StatusDot ok={isHealthy} />
            <span className="font-semibold text-sm">
              {isHealthy ? "Vectorizer Online" : "Vectorizer Offline"}
            </span>
            {health?.version && <span className="text-[11px] text-muted font-mono">v{health.version}</span>}
          </div>
          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-3">
            <span>ChromaDB: <span className={health?.chromadb === "ok" ? "text-success" : "text-danger"}>{health?.chromadb || "?"}</span></span>
            <span>LLM: <span className={health?.llm_enabled ? "text-success" : "text-muted"}>{health?.llm_enabled ? "enabled" : "disabled"}</span></span>
            <span>Embed: <span className="text-foreground/70">{health?.embedding_model || "?"}</span></span>
          </div>
        </div>
      </div>

      {/* Daily Usage By Agent */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted" /> Daily Usage By Agent
            <span className="text-xs font-normal text-muted">(API calls per day)</span>
          </h2>
          <div className="flex gap-1 text-[11px]">
            {([7, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setUsageDays(d)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${usageDays === d ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"}`}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>
        {!agentData ? (
          <p className="text-sm text-muted text-center py-6">Loading usage…</p>
        ) : agentData.totalCalls === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            No API usage in the last {usageDays} days — no agent has called Vectorizer yet.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agentData.chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23233a" />
                <XAxis dataKey="name" tick={{ fill: "#6b7289", fontSize: 10 }} interval={usageDays === 30 ? 4 : 0} />
                <YAxis tick={{ fill: "#6b7289", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#12121a", border: "1px solid #23233a", borderRadius: 12 }}
                  labelFormatter={(l: string) => {
                    const entry = agentData.chartData.find((d: any) => d.name === l);
                    return entry?.fullDate || l;
                  }}
                />
                {agentData.agents.map(agent => (
                  <Bar
                    key={agent.name}
                    dataKey={agent.name}
                    fill={agent.color}
                    name={agent.name}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted">
              {agentData.agents.map(agent => (
                <span key={agent.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: agent.color }} />
                  {agent.name}
                </span>
              ))}
              <span className="ml-auto font-mono">
                {agentData.totalCalls.toLocaleString()} calls / {usageDays}d
              </span>
            </div>
            {/* Per-agent action mix: what each agent actually did */}
            <div className="flex flex-col gap-1.5 mt-3">
              {agentData.agents.map(agent => {
                const acts = ACTION_META
                  .map(m => ({ ...m, n: agent.actions?.[m.key] || 0 }))
                  .filter(x => x.n > 0);
                if (acts.length === 0) return null;
                return (
                  <div key={agent.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground min-w-20">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: agent.color }} />
                      {agent.name}
                    </span>
                    {acts.map(({ key, label, Icon, n }) => (
                      <span key={key} className="inline-flex items-center gap-1 text-muted">
                        <Icon className="w-3 h-3" />{n} {label}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={MessageSquare} label="Messages" value={m?.messages_added || 0} color="bg-primary" />
        <MetricCard icon={Search} label="Searches" value={m?.searches_total || 0} color="bg-cyan" />
        <MetricCard icon={AlertTriangle} label="Dropped" value={m?.deriver_drops || 0} sub={m?.deriver_drops ? "facts discarded" : "none"} color={m?.deriver_drops ? "bg-danger" : "bg-success/20"} />
        <MetricCard icon={TrendingUp} label="Queue" value={m?.deriver_queue_depth || 0} sub={m?.deriver_queue_depth ? "pending" : "empty"} color={m?.deriver_queue_depth ? "bg-warning" : "bg-success/20"} />
      </div>

      {/* Vault Writeback */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-muted" /> Vault Writeback
          <span className="text-xs font-normal text-muted">(staging markdown mirror)</span>
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={MessageSquare} label="MD Appends" value={m?.writeback_writes || 0} sub={(m?.writeback_writes || 0) === 0 ? "off or idle" : "turns mirrored"} color="bg-primary" />
          <MetricCard icon={TrendingUp} label="WB Queue" value={m?.writeback_queue_depth || 0} sub={m?.writeback_queue_depth ? "pending" : "empty"} color={m?.writeback_queue_depth ? "bg-warning" : "bg-success/20"} />
          <MetricCard icon={AlertTriangle} label="WB Dropped" value={m?.writeback_drops || 0} sub={m?.writeback_drops ? "turns lost" : "none"} color={m?.writeback_drops ? "bg-danger" : "bg-success/20"} />
          <MetricCard icon={AlertTriangle} label="Skipped (RO)" value={m?.writeback_skipped_ro || 0} sub={m?.writeback_skipped_ro ? "vault read-only" : "writable"} color={m?.writeback_skipped_ro ? "bg-warning" : "bg-success/20"} />
        </div>
      </div>

      {/* Workspace Chart + Role Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 shadow-card">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted" /> Workspaces
            <span className="text-xs font-normal text-muted">({ws.length} total)</span>
          </h2>
          {wsChartData.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No workspaces.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={wsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23233a" />
                <XAxis dataKey="name" tick={{ fill: "#6b7289", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7289", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#12121a", border: "1px solid #23233a", borderRadius: 12 }} />
                <Bar dataKey="docs" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted" /> Message Roles
          </h2>
          <div className="space-y-3">
            {(["user", "assistant", "system"] as const).map(role => {
              const count = roleCounts[role] || 0;
              const total = msgs.length || 1;
              const pct = Math.round((count / total) * 100);
              const colors = { user: "bg-cyan", assistant: "bg-primary", system: "bg-success" };
              return (
                <div key={role}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium capitalize">{role}</span>
                    <span className="text-muted">{count} <span className="text-[10px]">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[role]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-xs text-muted space-y-1">
              <div className="flex items-center gap-2"><Webhook className="w-3 h-3" /> Webhooks: {webhooks.length}</div>
              <div className="flex items-center gap-2"><Key className="w-3 h-3" /> API Keys: {keys.length}</div>
              <div className="flex items-center gap-2"><Users className="w-3 h-3" /> Sessions: {sessions.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Messages Feed */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-muted" /> Recent Messages
          <span className="text-xs font-normal text-muted">last {msgs.length}</span>
        </h2>
        {msgs.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">No messages yet.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {msgs.map((msg: any, i: number) => (
              <div key={msg.id || i} className="flex items-start gap-3 p-3 bg-surface rounded-xl hover:bg-surface/80 transition-colors group">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  msg.role === "user" ? "bg-cyan/10 text-cyan" :
                  msg.role === "assistant" ? "bg-primary/10 text-primary" :
                  "bg-success/10 text-success"
                }`}>
                  {msg.role === "user" ? "U" : msg.role === "assistant" ? "A" : "S"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-muted">{msg.workspace_id || "?"}</span>
                    <span className="text-border">·</span>
                    <span className="text-muted">{msg.session_id?.slice(0, 12) || "?"}</span>
                    <span className="text-border">·</span>
                    <span className="text-muted">{timeAgo(msg.timestamp)}</span>
                  </div>
                  <p className="text-xs text-foreground/80 mt-1 line-clamp-2 break-all">
                    {msg.content?.slice(0, 200) || <span className="italic text-muted">empty</span>}
                  </p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sessions + Webhooks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted" /> Sessions
            <span className="text-xs font-normal text-muted">({sessions.length})</span>
          </h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No active sessions.</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {sessions.slice(0, 10).map((s: any, i: number) => (
                <div key={s.id || i} className="flex items-center gap-3 p-2 bg-surface rounded-lg text-xs">
                  <Circle className="w-2 h-2 text-primary fill-primary shrink-0" />
                  <div className="flex-1 min-w-0 truncate font-mono text-muted">{s.id?.slice(0, 16) || "?"}</div>
                  <div className="shrink-0 text-muted">{s.workspace_id}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Webhook className="w-4 h-4 text-muted" /> Webhooks
            <span className="text-xs font-normal text-muted">({webhooks.length})</span>
          </h2>
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No webhooks configured.</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {webhooks.map((wh: any, i: number) => (
                <div key={wh.id || i} className="p-2 bg-surface rounded-lg text-xs">
                  <div className="font-mono text-foreground/80 truncate">{wh.url}</div>
                  <div className="text-muted mt-1">
                    {(wh.events || []).map((e: string) => (
                      <span key={e} className="inline-block px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] mr-1">{e}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
