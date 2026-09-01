import { NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

// Admin endpoint — triggers vault reindex + graph rebuild
// POST /api/admin/reindex  { dryRun?: boolean }
// Supports SSE streaming: send Accept: text/event-stream for real-time progress
// Guard: only allow from localhost (dashboard is localhost:8092 only)

const VAULT_ROOT = process.env.VAULT_ROOT || "/data/ai";
const PY = process.env.REINDEX_PYTHON || "python3";

function getScripts() {
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
    return NextResponse.json(
      { ok: false, error: `vault_index.py not available on this server.`, vault_script: vault, vault_exists: false },
      { status: 200 }
    );
  }

  // SSE streaming mode
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    return streamReindex(vault, graph, dryRun, limit, request.signal);
  }

  // Legacy JSON mode
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
    const msg = e instanceof Error ? e.message : "Unknown error";
    const stdout = (e as { stdout?: string })?.stdout?.slice(0, 8000) || "";
    const stderr = (e as { stderr?: string })?.stderr?.slice(0, 4000) || msg;
    return NextResponse.json({ ok: false, error: stderr, stdout, elapsed_ms: Date.now() - start }, { status: 500 });
  }
}

// ─── SSE streaming implementation ───────────────────────────────────────────

function streamReindex(
  vault: string,
  graph: string,
  dryRun: boolean,
  limit?: number,
  signal?: AbortSignal
) {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch { /* controller closed */ }
      };

      let aborted = false;
      signal?.addEventListener("abort", () => { aborted = true; try { controller.close(); } catch {} });

      let totalFiles = 0;
      let indexedCount = 0;

      try {
        // Phase 1: vault_index.py
        send("phase", { phase: "indexing", message: "Scanning vault files..." });

        const args = [vault];
        if (dryRun) args.push("--dry-run");
        if (limit) args.push("--limit", String(limit));

        await runScript(PY, args, 120_000, (line) => {
          if (aborted) return;
          send("log", { message: line });

          const totalMatch = line.match(/found (\d+) markdown files/);
          if (totalMatch) totalFiles = parseInt(totalMatch[1]);

          const toIndexMatch = line.match(/To index: (\d+) files/);
          if (toIndexMatch && !totalFiles) totalFiles = parseInt(toIndexMatch[1]);

          const indexMatch = line.match(/indexed (.+?): \+/);
          if (indexMatch) {
            indexedCount++;
            const fileName = indexMatch[1].split("/").pop() || indexMatch[1];
            const percent = totalFiles > 0 ? Math.round((indexedCount / totalFiles) * 100) : 0;
            send("progress", {
              phase: "indexing",
              current: indexedCount,
              total: totalFiles,
              file: fileName,
              percent,
            });
          }

          const doneMatch = line.match(/Done: indexed (\d+) files, (\d+) chunks/);
          if (doneMatch) {
            send("vault_done", {
              indexed: parseInt(doneMatch[1]),
              chunks: parseInt(doneMatch[2]),
            });
          }
        });

        if (aborted) return;

        // Phase 2: graph_build.py (unless dry run)
        if (!dryRun && existsSync(graph)) {
          send("phase", { phase: "graph", message: "Rebuilding knowledge graph..." });
          send("progress", { phase: "graph", percent: -1, message: "Building graph..." });

          await runScript(PY, [graph], 60_000, (line) => {
            if (aborted) return;
            send("log", { message: line });
          });

          if (!aborted) {
            send("progress", { phase: "graph", percent: 100, message: "Graph rebuilt" });
          }
        }

        if (!aborted) {
          const elapsed = Date.now() - startTime;
          send("done", { success: true, elapsed_ms: elapsed });
        }
      } catch (e: unknown) {
        if (!aborted) {
          send("error", { message: e instanceof Error ? e.message : String(e) });
        }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Helper: run a script with line-by-line callback ────────────────────────

function runScript(
  cmd: string,
  args: string[],
  timeoutMs: number,
  onLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });

    let buffer = "";
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) onLine(`[stderr] ${msg}`);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (buffer.trim()) onLine(buffer);
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code}`));
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
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
    sse: "POST with Accept: text/event-stream for real-time progress",
  });
}
