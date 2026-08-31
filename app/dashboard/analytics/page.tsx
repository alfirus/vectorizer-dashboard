"use client";

import { useEffect, useState } from "react";
import { getSearchAnalytics, getWorkspaces } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#6366f1", "#22d3ee", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"];

interface AnalyticsData {
  total_workspaces: number;
  total_documents: number;
  workspaces: { workspace_id: string; document_count: number }[];
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSearchAnalytics(), getWorkspaces()])
      .then(([a, w]) => {
        setAnalytics(a);
        setWorkspaces(w.workspaces || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const wsData = (analytics?.workspaces || []).map((ws) => ({
    name: ws.workspace_id,
    count: ws.document_count,
  }));

  const totalDocs = analytics?.total_documents || 0;

  // Build role distribution from workspace data (approximation based on doc counts)
  const roleData = wsData.length > 0
    ? wsData.map((ws) => ({ name: ws.name, value: ws.count }))
    : [{ name: "No data", value: 1 }];

  // Activity timeline — use real creation dates from workspaces
  const activityData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    // Count workspaces created on each day
    const dayStr = d.toISOString().split("T")[0];
    const createdOnDay = workspaces.filter((ws) =>
      ws.created_at && ws.created_at.startsWith(dayStr)
    ).length;
    return {
      date: d.toLocaleDateString("en", { weekday: "short" }),
      messages: createdOnDay,
    };
  });

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-xl lg:text-2xl font-bold">Analytics</h1>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary Stats */}
          <div className="bg-surface border border-border rounded-lg p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold text-muted mb-3">Overview</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{analytics?.total_workspaces || 0}</p>
                <p className="text-xs text-muted">Workspaces</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalDocs.toLocaleString()}</p>
                <p className="text-xs text-muted">Total Documents</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {wsData.length > 0 ? Math.round(totalDocs / wsData.length) : 0}
                </p>
                <p className="text-xs text-muted">Avg Docs/Workspace</p>
              </div>
            </div>
          </div>

          {/* Workspace Distribution */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-muted mb-4">
              Documents by Workspace
            </h2>
            {wsData.length === 0 ? (
              <p className="text-muted text-sm">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={wsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#12121a",
                      border: "1px solid #1e1e2e",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Workspace Proportion */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-muted mb-4">
              Workspace Proportion
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={roleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {roleData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid #1e1e2e",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
