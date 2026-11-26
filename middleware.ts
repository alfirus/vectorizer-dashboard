import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// D1: shared-secret gate for every /api/* route.
// Clients send `Authorization: Bearer <DASHBOARD_AUTH_TOKEN>`.
// If DASHBOARD_AUTH_TOKEN is unset the API is fail-closed (503) — the
// operator must set a token; there is no anonymous mode.
// D13: per-IP token bucket in the same gate (sensitive endpoints throttled
// harder). Privileged handlers re-enforce the secret in-code (defense in
// depth); this middleware is the first layer, not the only one.

const WINDOW_MS = 60_000;
const LIMIT_DEFAULT = 120; // req/min per IP across /api/*
const LIMIT_SENSITIVE = 20; // req/min per IP for /api/admin/* and /api/brain

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  // NextRequest.ip is deprecated/undefined on some runtimes — fall back safely.
  const ip = (req as unknown as { ip?: string }).ip;
  return ip || "unknown";
}

function rateLimited(ip: string, sensitive: boolean): { limited: boolean; retryAfter: number } {
  const limit = sensitive ? LIMIT_SENSITIVE : LIMIT_DEFAULT;
  const now = Date.now();
  const key = `${sensitive ? "s" : "d"}:${ip}`;
  let b = buckets.get(key);
  if (!b || now >= b.reset) {
    b = { count: 0, reset: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    buckets.forEach((v, k) => {
      if (now >= v.reset) buckets.delete(k);
    });
  }
  if (b.count > limit) {
    return { limited: true, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
  return { limited: false, retryAfter: 0 };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const sensitive = pathname.startsWith("/api/admin/") || pathname.startsWith("/api/brain");
  const rl = rateLimited(clientIp(req), sensitive);
  if (rl.limited) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const token = process.env.DASHBOARD_AUTH_TOKEN || "";
  if (!token) {
    return NextResponse.json(
      { error: "server misconfigured: DASHBOARD_AUTH_TOKEN is not set" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || !timingSafeEqual(auth.slice(7), token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
