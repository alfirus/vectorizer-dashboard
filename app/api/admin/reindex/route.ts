import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

// Admin endpoint — triggers vault reindex + graph rebuild
// POST /api/admin/reindex  { dryRun?: boolean }
// Runs vault_index.py then graph_build.py via host python, returns stdout summary.
// Guard: only allow from localhost (dashboard is localhost:8092 only)

const VAULT_ROOT = process.env.VAULT_ROOT || "/data/ai";
const PY = process.env.REINDEX_PYTHON || "python";

function getScripts() {
  // Inside Docker: /data/ai/maisarah/vault/00-index/
  // Host fallback: try both
  const candidates = [
    `${VAULT_ROOT}/maisarah/vault/00-index/vault_index.py`,
    "C:/Users/alfir/SynologyDrive/ai/maisarah/vault/00-index/vault_index.py",
  ];
  const graphCandidates = [
    `${VAULT_ROOT}/maisarah/vault/00-index/graph_build.py`,
    "C:/Users/alfir/SynologyDrive/ai/maisarah/vault/00-index/graph_build.py",
  ];
  const vault = candidates.find((p) => existsSync(p)) || candidates[0];
  const graph = graphCandidates.find((p) => existsSync(p)) || graphCandidates[0];
  return { vault, graph };
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty body = full reindex */ }
  const dryRun = body.dryRun === true;
  const limit = typeof body.limit === "number" ? body.limit : undefined;

  const { vault, graph } = getScripts();

  if (!existsSync(vault)) {
    return NextResponse.json({ error: `vault_index.py not found: ${vault}` }, { status: 404 });
  }

  const args: string[] = [vault];
  if (dryRun) args.push("--dry-run");
  if (limit) args.push("--limit", String(limit));

  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(PY, args, {
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const elapsed = Date.now() - start;

    // Also rebuild graph unless dryRun
    let graphOut = "";
    let graphErr = "";
    if (!dryRun && existsSync(graph)) {
      try {
        const g = await execFileAsync(PY, [graph], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
        graphOut = g.stdout.slice(0, 4000);
        graphErr = g.stderr.slice(0, 2000);
      } catch (e: unknown) {
        graphErr = e instanceof Error ? e.message : String(e);
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      elapsed_ms: elapsed,
      vault: { args, stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 2000) },
      graph: graphOut ? { stdout: graphOut, stderr: graphErr } : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // execFile throws with stdout/stderr on non-zero exit — surface them
    const stdout = (e as { stdout?: string })?.stdout?.slice(0, 8000) || "";
    const stderr = (e as { stderr?: string })?.stderr?.slice(0, 4000) || msg;
    return NextResponse.json({ ok: false, error: stderr, stdout, elapsed_ms: Date.now() - start }, { status: 500 });
  }
}

export async function GET() {
  const { vault, graph } = getScripts();
  return NextResponse.json({
    vault_script: vault,
    graph_script: graph,
    vault_exists: existsSync(vault),
    graph_exists: existsSync(graph),
    python: PY,
    usage: "POST { dryRun?: boolean, limit?: number }",
  });
}
