"use client";

import { useEffect, useState } from "react";
import { getWorkspaces } from "@/lib/api";
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

export default function AnalyticsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkspaces()
      .then((r) => setWorkspaces(r.workspaces || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const wsData = workspaces.map((ws) => ({
    name: ws.id,
    // We don't have doc counts in the list endpoint, so use 1 per workspace
    // A real implementation would fetch stats for each
    count: 1,
  }));

  // Role distribution placeholder (would come from API in real impl)
  const roleData = [
    { name: "User", value: 45 },
    { name: "Assistant", value: 35 },
    { name: "System", value: 20 },
  ];

  // Activity timeline placeholder
  const activityData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString("en", { weekday: "short" }),
      messages: Math.floor(Math.random() * 50) + 5,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Workspace Distribution */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-muted mb-4">
              Workspaces
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

          {/* Role Distribution */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-muted mb-4">
              Message Roles
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

          {/* Activity Timeline */}
          <div className="bg-surface border border-border rounded-lg p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold text-muted mb-4">
              Activity (Last 7 Days)
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#12121a",
                    border: "1px solid #1e1e2e",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="messages" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
