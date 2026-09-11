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
        },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`/usage/daily: ${res.status}`);
    const json = await res.json();

    // json.days[] has { date, total, by_source: { agent1: N, agent2: M, ... }, searches, stores, ask, chat, code, upload, other }
    const daysData = json.days || [];

    // Aggregate by source (agent) across all dates
    const agentTotals: Record<string, number> = {};
    const dailyByAgent: Record<string, Record<string, number>> = {};

    for (const d of daysData) {
      const dateKey = d.date; // YYYY-MM-DD
      dailyByAgent[dateKey] = {};
      const bySource = d.by_source || {};
      for (const [agent, count] of Object.entries(bySource)) {
        const n = Number(count) || 0;
        if (n > 0) {
          agentTotals[agent] = (agentTotals[agent] || 0) + n;
          dailyByAgent[dateKey][agent] = n;
        }
      }
    }

    // Sort agents by total usage descending, take top N for chart clarity
    const sortedAgents = Object.entries(agentTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // show top 8 agents max

    const agentNames = sortedAgents.map(([name]) => name);
    const agentColors: Record<string, string> = {
      mirza: "#7c3aed",
      maisarah: "#22d3ee",
      alfirus: "#f59e0b",
      default: "#6b7289",
    };

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
        color: agentColors[name] || agentColors.default,
      })),
      totalCalls,
      days,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch usage by agent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
