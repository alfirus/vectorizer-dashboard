import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8100";

export const runtime = "nodejs";

// D6: read-only Chroma proxy. The old catch-all exported every verb (GET/POST/
// PUT/DELETE) with no credentials — anyone reaching the dashboard could read
// raw embeddings and DELETE collections (full memory-workspace destruction).
// Now: D1 gate re-enforced in-code, GET only (other verbs → 405: no handler
// exported), and only the three read shapes the UI needs:
//   GET …/collections | …/collections/<id>/count | …/collections/<id>/get
// D11 (partial): upstream responses capped at 10 MB.
const MAX_RES_BYTES = 10_000_000;

const SEG = /^[A-Za-z0-9._~-]+$/;

function authFailed(req: NextRequest) {
  const v = checkAuth(req);
  if (v === "ok") return null;
  return NextResponse.json(
    { error: v === "misconfigured" ? "server misconfigured: DASHBOARD_AUTH_TOKEN is not set" : "unauthorized" },
    { status: v === "misconfigured" ? 503 : 401 }
  );
}

function allowedChromaPath(path: string[]): boolean {
  // Expected: api/v2/tenants/<t>/databases/<db>/collections[/<id>/(count|get)]
  if (path.length < 7) return false;
  const [api, v2, tenants, _t, databases, _db, collections, ...rest] = path;
  if (api !== "api" || v2 !== "v2" || tenants !== "tenants" || databases !== "databases" || collections !== "collections") {
    return false;
  }
  if (rest.length === 0) return true;
  if (rest.length === 2 && (rest[1] === "count" || rest[1] === "get")) return true;
  return false;
}

async function proxyChroma(req: NextRequest, path: string[]) {
  const denied = authFailed(req);
  if (denied) return denied;

  for (const seg of path) {
    if (!SEG.test(seg) || seg === "." || seg === "..") {
      return NextResponse.json({ error: "bad path" }, { status: 400 });
    }
  }
  if (!allowedChromaPath(path)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const targetPath = path.join("/");
  const url = new URL(req.url);
  const targetUrl = `${CHROMA_URL}/${targetPath}${url.search}`;

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  try {
    const res = await fetch(targetUrl, { method: "GET", headers });
    const data = await res.text();
    if (data.length > MAX_RES_BYTES) {
      return NextResponse.json({ error: "upstream response too large" }, { status: 502 });
    }
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Chroma proxy error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// GET only — POST/PUT/DELETE are not exported, so Next.js answers 405.
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyChroma(req, params.path);
}
