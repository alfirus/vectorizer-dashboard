import { NextRequest, NextResponse } from "next/server";

const VECTORIZER_URL = process.env.VECTORIZER_URL || "http://localhost:8091";
const API_KEY = process.env.VECTORIZER_API_KEY || "vectorizer-local-key";

export const runtime = "nodejs";

async function proxyRequest(req: NextRequest, path: string[]) {
  const targetPath = path.join("/");
  const url = new URL(req.url);
  const targetUrl = `${VECTORIZER_URL}/api/v1/${targetPath}${url.search}`;

  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") || "application/json",
    "X-API-Key": API_KEY,
  };

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(targetUrl, init);
    const data = await res.text();
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
export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}
