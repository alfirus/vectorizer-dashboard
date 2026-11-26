import { NextRequest, NextResponse } from "next/server";
import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { checkAuth } from "@/lib/auth";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
// Admin endpoint — triggers vault reindex + graph rebuild
// POST /api/admin/reindex  { dryRun?: boolean, workspace?: string, reindex?: boolean }
// Supports SSE streaming: send Accept: text/event-stream for real-time progress
// D7: the old "localhost guard" was a comment, not a check — this endpoint now
// requires the dashboard bearer token (middleware layer 1, checkAuth layer 2).

const VAULT_ROOT = process.env.VAULT_ROOT || "/data/ai";
const PY = process.env.REINDEX_PYTHON || "python3";
// Optional explicit override for the index scripts (de-hardcodes the
// maisarah/Windows paths below when set).
const SCRIPT_DIR_OVERRIDE = process.env.REINDEX_SCRIPT_DIR || "";

// D7: workspace names are single path segments — validated before spawn.
const WORKSPACE_RE = /^[A-Za-z0-9_-]{1,64}$/;

// D8: single-flight guard — one reindex at a time (each run holds Python
// children plus Chroma/LM Studio load for up to ~3 min).
let reindexRunning = false;

function authFailed(req: NextRequest) {
  const v = checkAuth(req);
  if (v === "ok") return null;
  return NextResponse.json(
    { error: v === "misconfigured" ? "server misconfigured: DASHBOARD_AUTH_TOKEN is not set" : "unauthorized" },
    { status: v === "misconfigured" ? 503 : 401 }
  );
}

function scriptCandidates(workspace: string | undefined): { vault: string[]; graph: string[] } {
  const ws = workspace && WORKSPACE_RE.test(workspace) ? workspace : "maisarah";
  const vault = [
    ...(SCRIPT_DIR_OVERRIDE ? [`${SCRIPT_DIR_OVERRIDE}/vault_index.py`] : []),
    `${VAULT_ROOT}/${ws}/vault/00-index/vault_index.py`,
    `${VAULT_ROOT}/maisarah/vault/00-index/vault_index.py`,
    "C:/Users/alfir/SynologyDrive/ai/maisarah/vault/00-index/vault_index.py",
  ];
  const graph = [
    ...(SCRIPT_DIR_OVERRIDE ? [`${SCRIPT_DIR_OVERRIDE}/graph_build.py`] : []),
    `${VAULT_ROOT}/${ws}/vault/00-index/graph_build.py`,
    `${VAULT_ROOT}/maisarah/vault/00-index/graph_build.py`,
    "C:/Users/alfir/SynologyDrive/ai/maisarah/vault/00-index/graph_build.py",
  ];
  return { vault, graph };
}

function getScripts(workspace: string | undefined) {
  const { vault, graph } = scriptCandidates(workspace);
  const v = vault.find((p) => existsSync(p)) || vault[0];
  const g = graph.find((p) => existsSync(p)) || graph[0];
  return { vault: v, graph: g };
}

function validateParams(
  workspace: string | undefined,
  limit: number | undefined
): NextResponse | null {
  if (workspace !== undefined && !WORKSPACE_RE.test(workspace)) {
    return NextResponse.json({ error: "bad workspace" }, { status: 400 });
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) {
    return NextResponse.json({ error: "bad limit" }, { status: 400 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const denied = authFailed(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const queryWorkspace = url.searchParams.get("workspace") || undefined;

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty body = full reindex */ }
  const dryRun = body.dryRun === true;
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  const forceReindex = body.reindex === true;
  const workspace = (typeof body.workspace === "string" ? body.workspace : queryWorkspace) || undefined;
  const bad = validateParams(workspace, limit);
  if (bad) return bad;

  const { vault, graph } = getScripts(workspace);

  if (!existsSync(vault)) {
    // D7: no absolute script paths disclosed — availability only.
    return NextResponse.json(
      { ok: false, error: `vault_index.py not available on this server.`, vault_exists: false },
      { status: 200 }
    );
  }

  // D8: single-flight.
  if (reindexRunning) {
    return NextResponse.json({ ok: false, error: "reindex already running" }, { status: 409 });
  }

  // SSE streaming mode
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    reindexRunning = true;
    return streamReindex(vault, graph, dryRun, limit, forceReindex, workspace, request.signal);
  }

  // Legacy JSON mode
  const args: string[] = [];
  if (dryRun) args.push("--dry-run");
  if (workspace) args.push("--workspace", workspace);
  if (limit) args.push("--limit", String(limit));
  if (forceReindex) args.push("--reindex");

  reindexRunning = true;
  const start = Date.now();
  try {
    // D8: thread the client abort signal into execFile so a disconnect kills
    // the Python child instead of orphaning it.
    const { stdout, stderr } = await execFileAsync(PY, [vault, ...args], {
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
      signal: request.signal,
    });

    const elapsed = Date.now() - start;

    let graphOut = "";
    let graphErr = "";
    if (!dryRun && existsSync(graph) && !request.signal.aborted) {
      try {
        const g = await execFileAsync(PY, [graph], {
          timeout: 60_000,
          maxBuffer: 2 * 1024 * 1024,
          signal: request.signal,
        });
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
  } finally {
    reindexRunning = false;
  }
}

// ─── SSE streaming implementation ───────────────────────────────────────────

function streamReindex(
  vault: string,
  graph: string,
  dryRun: boolean,
  limit?: number,
  forceReindex?: boolean,
  workspace?: string,
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

      let aborted = signal?.aborted || false;
      const onAbort = () => { aborted = true; try { controller.close(); } catch {} };
      signal?.addEventListener("abort", onAbort, { once: true });

      let totalFiles = 0;
      let indexedCount = 0;

      try {
        // Phase 1: vault_index.py
        send("phase", { phase: "indexing", message: "Scanning vault files..." });

        const args: string[] = [];
        if (dryRun) args.push("--dry-run");
        if (workspace) args.push("--workspace", workspace);
        if (limit) args.push("--limit", String(limit));
        if (forceReindex) args.push("--reindex");

        await runScript(PY, [vault, ...args], 120_000, (line) => {
          if (aborted) return;
          send("log", { message: line });

          const totalMatch = line.match(/found (\d+) markdown files/);
          if (totalMatch) totalFiles = parseInt(totalMatch[1]);

          const toIndexMatch = line.match(/To index: (\d+) files/);
          if (toIndexMatch && !totalFiles) totalFiles = parseInt(toIndexMatch[1]);

          // Match actual indexing: "indexed path: +N chunks (batch N)"
          const indexMatch = line.match(/indexed (.+?): \+/);
          // Match dry-run output: "[workspace file imp=N] path hash=... chunks=N"
          const dryRunMatch = line.match(/\[\w+ file imp=\d+\]\s+(.+?)\s+hash=\S+\s+chunks=(\d+)/);

          const matchedFile = indexMatch?.[1] || dryRunMatch?.[1];
          if (matchedFile) {
            indexedCount++;
            const fileName = matchedFile.split("/").pop() || matchedFile;
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
        }, signal);

        if (aborted) return;

        // Phase 2: graph_build.py (unless dry run)
        if (!dryRun && existsSync(graph)) {
          send("phase", { phase: "graph", message: "Rebuilding knowledge graph..." });
          send("progress", { phase: "graph", percent: -1, message: "Building graph..." });

          await runScript(PY, [graph], 60_000, (line) => {
            if (aborted) return;
            send("log", { message: line });
          }, signal);

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
        signal?.removeEventListener("abort", onAbort);
        releaseReindexSlot();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      // Client disconnected: the signal listener + runScript kill the child.
      releaseReindexSlot();
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
  onLine: (line: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(cmd, args, { timeout: timeoutMs });

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };

    let buffer = "";
    const timeout = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch { /* already exited */ }
      fail(new Error(`Script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // D8: client abort kills the spawned child instead of orphaning it.
    const onAbort = () => {
      try { proc.kill("SIGTERM"); } catch { /* already exited */ }
      fail(new Error("reindex aborted by client"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

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
      cleanup();
      if (settled) return;
      settled = true;
      if (buffer.trim()) onLine(buffer);
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code}`));
    });

    proc.on("error", (err) => {
      cleanup();
      fail(err);
    });
  });
}

function releaseReindexSlot() {
  reindexRunning = false;
}

export async function GET(request: NextRequest) {
  const denied = authFailed(request);
  if (denied) return denied;
  // D7: availability only — the old response disclosed absolute server paths
  // (script locations, python binary). Clients don't need them.
  const { vault } = getScripts(undefined);
  return NextResponse.json({
    available: existsSync(vault),
    usage: "POST { dryRun?: boolean, workspace?: string, reindex?: boolean }",
    sse: "POST with Accept: text/event-stream for real-time progress",
  });
}
