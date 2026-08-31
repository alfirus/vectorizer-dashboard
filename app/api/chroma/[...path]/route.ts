import { NextRequest, NextResponse } from "next/server";

const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8100";
const CHROMA_TENANT = process.env.CHROMA_TENANT || "default_tenant";
const CHROMA_DB = process.env.CHROMA_DB || "default_database";

export const runtime = "nodejs";

// ChromaDB proxy — keeps Chroma internal, avoids CORS + direct exposure
// Proxies /api/chroma/* → CHROMA_URL/*
// Used for getCollections() and getCollectionVectors() (embeddings visualization)
async function proxyChroma(req: NextRequest, path: string[]) {
  const targetPath = path.join("/");
  const url = new URL(req.url);
  const targetUrl = `${CHROMA_URL}/${targetPath}${url.search}`;

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

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
    const msg = e instanceof Error ? e.message : "Chroma proxy error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyChroma(req, params.path);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyChroma(req, params.path);
}
export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyChroma(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyChroma(req, params.path);
}
