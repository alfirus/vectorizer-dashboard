import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://localhost:8091";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const verdict = checkAuth(req);
  if (verdict !== "ok") {
    return NextResponse.json(
      { error: verdict === "misconfigured" ? "server misconfigured: DASHBOARD_AUTH_TOKEN is not set" : "unauthorized" },
      { status: verdict === "misconfigured" ? 503 : 401 }
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 90);
    const res = await fetch(`${VECTORIZER_URL}/api/v1/usage/daily?days=${days}`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-Source": "dashboard",
        "X-Agent": "dashboard",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`/usage/daily: ${res.status}`);
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch usage";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
