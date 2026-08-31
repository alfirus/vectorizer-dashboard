import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

// Vault explorer API — reads MEMORY_INDEX.json + GRAPH.json directly from SynologyDrive mount
// Returns paginated vault file list with chunk + metadata preview

const VAULT_ROOT = process.env.VAULT_ROOT || "/data/ai";
const MEMORY_INDEX_PATH =
  process.env.MEMORY_INDEX_PATH || `${VAULT_ROOT}/maisarah/vault/00-index/MEMORY_INDEX.json`;
const GRAPH_PATH =
  process.env.GRAPH_PATH || `${VAULT_ROOT}/maisarah/vault/00-index/GRAPH.json`;

interface VaultFile {
  path: string;
  hash: string;
  chunks: number;
  mtime?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  if (action === "file") {
    const p = searchParams.get("path") || "";
    if (!p) return NextResponse.json({ error: "path required" }, { status: 400 });
    // Security: only allow reading under VAULT_ROOT, no traversal
    const path = await import("path");
    const resolved = path.resolve(p);
    const root = path.resolve(VAULT_ROOT);
    if (!resolved.startsWith(root) && !path.resolve(VAULT_ROOT + "/" + p).startsWith(root)) {
      return NextResponse.json({ error: "path outside vault" }, { status: 403 });
    }
    const target = existsSync(p) ? p : existsSync(path.join(VAULT_ROOT, p)) ? path.join(VAULT_ROOT, p) : path.join(root, p.replace(/^.*SynologyDrive\/ai\//, "").replace(/\\/g, "/"));
    const real = existsSync(target) ? target : p;
    if (!existsSync(real)) return NextResponse.json({ error: `not found: ${real}` }, { status: 404 });
    try {
      const content = await readFile(real, "utf-8");
      // Try to get metadata from index
      let meta: Record<string, unknown> = {};
      try {
        const idxRaw = await readFile(MEMORY_INDEX_PATH, "utf-8");
        const idx = JSON.parse(idxRaw);
        const entry = idx.files?.[p] || idx.files?.[real] || Object.entries(idx.files || {}).find(([k]) => real.endsWith(k.replace(/\\/g, "/")))?.[1] as Record<string, unknown> | undefined;
        if (entry) meta = entry as Record<string, unknown>;
      } catch { /* no meta */ }
      return NextResponse.json({ path: p, real, content: content.slice(0, 12000), meta });
    } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
  }

  try {
    if (action === "stats") {
      // Quick stats for vault tab header
      if (!existsSync(MEMORY_INDEX_PATH)) {
        return NextResponse.json({ error: `MEMORY_INDEX not found at ${MEMORY_INDEX_PATH}` }, { status: 404 });
      }
      const raw = await readFile(MEMORY_INDEX_PATH, "utf-8");
      const idx = JSON.parse(raw);
      const files = idx.files || {};
      const fileList: VaultFile[] = Object.entries(files as Record<string, Record<string, unknown>>).map(([p, v]) => ({
        path: p,
        hash: String(v.hash || "").slice(0, 8),
        chunks: Number(v.chunks || 0),
        mtime: v.mtime ? String(v.mtime) : undefined,
      }));
      const totalChunks = fileList.reduce((s, f) => s + f.chunks, 0);

      // Graph stats
      let graphStats: Record<string, unknown> = {};
      if (existsSync(GRAPH_PATH)) {
        try {
          const gRaw = await readFile(GRAPH_PATH, "utf-8");
          const g = JSON.parse(gRaw);
          const typeCounts: Record<string, number> = {};
          for (const n of g.nodes || []) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
          graphStats = { nodes: g.nodes?.length || 0, edges: g.edges?.length || 0, byType: typeCounts };
        } catch { /* ignore */ }
      }

      return NextResponse.json({
        version: idx.version || "1.0",
        files: fileList.length,
        total_chunks: totalChunks,
        graph: graphStats,
        index_path: MEMORY_INDEX_PATH,
        graph_path: GRAPH_PATH,
      });
    }

    // Default: list files with pagination
    if (!existsSync(MEMORY_INDEX_PATH)) {
      return NextResponse.json({ error: `MEMORY_INDEX not found at ${MEMORY_INDEX_PATH}` }, { status: 404 });
    }
    const raw = await readFile(MEMORY_INDEX_PATH, "utf-8");
    const idx = JSON.parse(raw);
    const files = idx.files || {};
    const allFiles: VaultFile[] = Object.entries(files as Record<string, Record<string, unknown>>)
      .map(([p, v]) => ({
        path: String(p).replace(/\\/g, "/"),
        hash: String(v.hash || "").slice(0, 8),
        chunks: Number(v.chunks || 0),
        mtime: v.mtime ? String(v.mtime) : undefined,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    // Optional filter by query
    const q = searchParams.get("q")?.toLowerCase();
    const filtered = q
      ? allFiles.filter((f) => f.path.toLowerCase().includes(q))
      : allFiles;

    const paged = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      total: filtered.length,
      offset,
      limit,
      version: idx.version || "1.0",
      files: paged,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
