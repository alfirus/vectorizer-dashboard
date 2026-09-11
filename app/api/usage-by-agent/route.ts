import { NextResponse } from "next/server";

const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://localhost:8091";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

export const dynamic = "force-dynamic";

/**
 * GET /api/usage-by-agent?days=7|30
 * Returns daily usage aggregated by agent/source for the grouped bar chart.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1), 90);

    // Fetch raw daily usage from Vectorizer
    const res = await fetch(
      `${VECTORIZER_URL}/api/v1/usage/daily?days=${days}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
          "X-Source": "dashboard",
          "X-Agent": "dashboard",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`/usage/daily: ${res.status}`);
    const json = await res.json();

    // json.days[] has { date, total, by_agent?, by_agent_action?, by_source, ... }
    // Prefer by_agent (real caller identity via X-Agent) once the backend
    // ships it; fall back to by_source so the chart works against the old API.
    const daysData = json.days || [];

    // Aggregate by agent across all dates, plus each agent's action mix
    // (how much they searched, stored, asked...) from by_agent_action.
    const agentTotals: Record<string, number> = {};
    const agentActions: Record<string, Record<string, number>> = {};
    const dailyByAgent: Record<string, Record<string, number>> = {};

    const ACTION_KEYS = ["search", "store", "ask", "chat", "code", "upload", "other"];
    const addActions = (agent: string, mix: any) => {
      if (!mix || typeof mix !== "object") return;
      for (const a of ACTION_KEYS) {
        const n = Number(mix[a]) || 0;
        if (n > 0) agentActions[agent][a] = (agentActions[agent][a] || 0) + n;
      }
    };

    for (const d of daysData) {
      const dateKey = d.date; // YYYY-MM-DD
      dailyByAgent[dateKey] = {};
      const byAgent = (d.by_agent && Object.keys(d.by_agent).length ? d.by_agent : d.by_source) || {};
      for (const [agent, count] of Object.entries(byAgent)) {
        const n = Number(count) || 0;
        if (n > 0) {
          agentTotals[agent] = (agentTotals[agent] || 0) + n;
          dailyByAgent[dateKey][agent] = n;
          if (!agentActions[agent]) agentActions[agent] = {};
          addActions(agent, d.by_agent_action?.[agent]);
        }
      }
      // Agents present only in by_agent_action (shouldn't happen, but cheap to cover)
      if (d.by_agent_action && typeof d.by_agent_action === "object") {
        for (const agent of Object.keys(d.by_agent_action)) {
          if (!(agent in agentTotals)) {
            if (!agentActions[agent]) agentActions[agent] = {};
            addActions(agent, d.by_agent_action[agent]);
            const t = ACTION_KEYS.reduce((s, a) => s + (agentActions[agent][a] || 0), 0);
            if (t > 0) agentTotals[agent] = t;
          }
        }
      }
    }

    // Sort agents by total usage descending, take top N for chart clarity
    const sortedAgents = Object.entries(agentTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // show top 8 agents max

    const agentNames = sortedAgents.map(([name]) => name);

    // Distinct color per agent. Known agents keep their brand colors;
    // everyone else gets a stable palette color hashed from the name,
    // so colors don't shuffle between reloads or when ranks change.
    const KNOWN_COLORS: Record<string, string> = {
      mirza: "#7c3aed",
      maisarah: "#22d3ee",
      alfirus: "#f59e0b",
    };
    const PALETTE = [
      "#34d399", // emerald
      "#f472b6", // pink
      "#60a5fa", // blue
      "#a3e635", // lime
      "#fb7185", // rose
      "#fb923c", // orange
      "#2dd4bf", // teal
      "#818cf8", // indigo
    ];
    const hashName = (name: string): number => {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      return h;
    };
    // Assign in rank order with linear probing: hash picks the preferred
    // slot, taken slots are skipped, so the visible agents are always
    // distinct. Deterministic for the same agent set.
    const used = new Set<string>(Object.values(KNOWN_COLORS));
    const colors: Record<string, string> = {};
    for (const name of agentNames) {
      if (KNOWN_COLORS[name]) {
        colors[name] = KNOWN_COLORS[name];
        continue;
      }
      let idx = hashName(name) % PALETTE.length;
      let guard = 0;
      while (used.has(PALETTE[idx]) && guard < PALETTE.length) {
        idx = (idx + 1) % PALETTE.length;
        guard++;
      }
      colors[name] = PALETTE[idx];
      used.add(PALETTE[idx]);
    }

    // Build chart data: one entry per date, with bars per agent
    const chartData = daysData.map((d: any) => {
      const entry: Record<string, string | number> = {
        name: d.date.slice(5), // MM-DD for brevity
        fullDate: d.date,
      };
      for (const agent of agentNames) {
        entry[agent] = dailyByAgent[d.date]?.[agent] || 0;
      }
      return entry;
    });

    const totalCalls = Object.values(agentTotals).reduce((s, v) => s + v, 0);

    return NextResponse.json({
      chartData,
      agents: agentNames.map(name => ({
        name,
        total: agentTotals[name],
        color: colors[name],
        actions: agentActions[name] || {},
      })),
      totalCalls,
      days,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch usage by agent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
