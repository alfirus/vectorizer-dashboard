import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://localhost:8091";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

export const runtime = "nodejs";

// D5: allowlisted forward proxy. The old catch-all forwarded ANY method/path
// with the server-side X-API-Key (unauthenticated confused deputy) and let
// decoded `..` segments escape the /api/v1/ prefix. Now:
//  - D1 gate re-enforced in-code (middleware is layer 1),
//  - each segment must be a safe token (no `.`/`..`, no slashes/backslashes),
//  - only the exact method+path shapes the UI calls are forwarded.
// D11 (partial): request bodies capped at 2 MB, upstream responses at 10 MB.
const MAX_REQ_BYTES = 2_000_000;
const MAX_RES_BYTES = 10_000_000;

const SEG = /^[A-Za-z0-9._~-]+$/;
const ID = "[A-Za-z0-9_-]+";

interface AllowEntry { method: string; re: RegExp }
const ALLOWLIST: AllowEntry[] = [
  { method: "GET", re: /^health$/ },
  { method: "GET", re: /^workspaces$/ },
  { method: "POST", re: /^workspaces$/ },
  { method: "GET", re: new RegExp(`^workspaces/${ID}$`) },
  { method: "DELETE", re: new RegExp(`^workspaces/${ID}$`) },
  { method: "GET", re: new RegExp(`^workspaces/${ID}/health$`) },
  { method: "GET", re: /^messages$/ },
  { method: "POST", re: /^messages$/ },
  { method: "DELETE", re: new RegExp(`^messages/${ID}$`) },
  { method: "POST", re: /^messages\/search$/ },
  { method: "POST", re: /^messages\/search\/all$/ },
  { method: "GET", re: /^messages\/analytics$/ },
  { method: "GET", re: /^messages\/grep$/ },
  { method: "GET", re: /^messages\/temporal$/ },
  { method: "GET", re: /^metrics$/ },
  { method: "GET", re: /^sessions$/ },
  { method: "GET", re: /^webhooks$/ },
  { method: "GET", re: /^keys$/ },
  { method: "GET", re: /^code\/callers$/ },
  { method: "GET", re: /^conclusions\/stale$/ },
  { method: "GET", re: /^conclusions\/trace$/ },
];

function authFailed(req: NextRequest) {
  const v = checkAuth(req);
  if (v === "ok") return null;
  return NextResponse.json(
    { error: v === "misconfigured" ? "server misconfigured: DASHBOARD_AUTH_TOKEN is not set" : "unauthorized" },
    { status: v === "misconfigured" ? 503 : 401 }
  );
}

async function proxyRequest(req: NextRequest, path: string[]) {
  const denied = authFailed(req);
  if (denied) return denied;

  for (const seg of path) {
    if (!SEG.test(seg) || seg === "." || seg === "..") {
      return NextResponse.json({ error: "bad path" }, { status: 400 });
    }
  }
  const targetPath = path.join("/");
  const allowed = ALLOWLIST.some(
    (a) => a.method === req.method && a.re.test(targetPath)
  );
  if (!allowed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const targetUrl = `${VECTORIZER_URL}/api/v1/${targetPath}${url.search}`;

  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") || "application/json",
    "X-API-Key": API_KEY,
    "X-Source": "dashboard",
  };

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const len = req.headers.get("content-length");
    if (len && Number(len) > MAX_REQ_BYTES) {
      return NextResponse.json({ error: "request body too large" }, { status: 413 });
    }
    const body = await req.text();
    if (body.length > MAX_REQ_BYTES) {
      return NextResponse.json({ error: "request body too large" }, { status: 413 });
    }
    init.body = body;
  }

  try {
    const res = await fetch(targetUrl, init);
    const data = await res.text();
    if (data.length > MAX_RES_BYTES) {
      return NextResponse.json({ error: "upstream response too large" }, { status: 502 });
    }
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}
// PUT removed: the UI issues no PUT through this proxy (D5 — least privilege).
// Next.js answers 405 for unexported methods.
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}
