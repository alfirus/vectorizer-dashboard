import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { checkAuth } from "@/lib/auth";

export const runtime = "nodejs";

// D1: all handlers require the dashboard bearer token (middleware is layer 1).
// D10-class fix: paths come from env; the hardcoded Windows default only
// applies on win32 host runs. Elsewhere an unset path fails cleanly (501)
// instead of writing into a nonexistent C:/… tree.
const ENV_PATH =
  process.env.SETTINGS_ENV_PATH ||
  (process.platform === "win32" ? "C:/Users/alfir/vectorizer/.env" : "");
const SCHEDULES_PATH =
  process.env.SETTINGS_SCHEDULES_PATH ||
  (process.platform === "win32" ? "C:/Users/alfir/vectorizer/cron_schedules.json" : "");

const KEYS = [
  "ALERT_TELEGRAM_BOT_TOKEN",
  "ALERT_TELEGRAM_CHAT_ID",
  "ALERT_EMAIL_TO",
  "ALERT_EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "BACKUP_RETENTION_DAYS",
  "REINDEX_SCHEDULE",
] as const;

// D4: values written to the .env must never contain newlines (injection of
// arbitrary env lines, e.g. DEFAULT_API_KEY=…), plus a length cap.
const MAX_VALUE_LEN = 4096;

function validateValue(key: string, value: unknown): string | null {
  if (typeof value !== "string") return `${key} must be a string`;
  if (value.length > MAX_VALUE_LEN) return `${key} too long (max ${MAX_VALUE_LEN})`;
  // D4: reject CR/LF (and NUL) — the write path can never emit a second line.
  if (/[\r\n\0]/.test(value)) return `${key} must not contain newlines`;
  return null;
}

// Quote a value for shell-style .env: bare tokens stay bare, everything else
// is double-quoted with backslash/quote/dollar escaping.
function quoteEnvValue(v: string): string {
  if (/^[A-Za-z0-9_@.:/+=-]+$/.test(v)) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`")}"`;
}

type ScheduleState = Record<string, { enabled: boolean; schedule: string }>;

// Restrict persisted schedules to the jobs the dashboard actually manages,
// with cron-shaped schedule strings (charset + length gate).
const KNOWN_JOBS = new Set([
  "vectorizer-reindex-1h",
  "vectorizer-backup-daily",
  "vectorizer-health-5m",
]);
const SCHEDULE_RE = /^[\d\s*\/\-,A-Za-z]+$/;

function validateScheduleEntry(job: string, entry: unknown): string | null {
  if (!KNOWN_JOBS.has(job)) return `unknown job: ${job}`;
  if (typeof entry !== "object" || entry === null) return `${job}: bad entry`;
  const e = entry as Record<string, unknown>;
  if (typeof e.enabled !== "boolean") return `${job}: enabled must be boolean`;
  if (typeof e.schedule !== "string" || e.schedule.length > 100 || !SCHEDULE_RE.test(e.schedule)) {
    return `${job}: bad schedule`;
  }
  return null;
}

function authFailed(req: NextRequest) {
  const v = checkAuth(req);
  if (v === "ok") return null;
  return NextResponse.json(
    { error: v === "misconfigured" ? "server misconfigured: DASHBOARD_AUTH_TOKEN is not set" : "unauthorized" },
    { status: v === "misconfigured" ? 503 : 401 }
  );
}

async function readEnv(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!ENV_PATH) return out;
  try {
    const txt = await readFile(ENV_PATH, "utf-8");
    for (const line of txt.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^[\"']|[\"']$/g, "");
      if ((KEYS as readonly string[]).includes(k)) out[k] = v;
    }
  } catch {}
  return out;
}

async function writeEnv(patch: Record<string, string>) {
  let lines: string[] = [];
  try { lines = (await readFile(ENV_PATH, "utf-8")).split("\n"); } catch {}
  const seen = new Set<string>();
  const next: string[] = [];
  for (const line of lines) {
    const tr = line.trim();
    if (!tr || tr.startsWith("#") || !tr.includes("=")) { next.push(line); continue; }
    const k = tr.slice(0, tr.indexOf("=")).trim();
    if ((KEYS as readonly string[]).includes(k)) {
      seen.add(k);
      if (k in patch) next.push(`${k}=${quoteEnvValue(patch[k])}`);
      else next.push(line);
    } else {
      next.push(line);
    }
  }
  for (const k of KEYS) {
    if (k in patch && !seen.has(k)) next.push(`${k}=${quoteEnvValue(patch[k])}`);
  }
  await writeFile(ENV_PATH, next.join("\n"), "utf-8");
}

async function readSchedules(): Promise<ScheduleState> {
  const defaults: ScheduleState = {
    "vectorizer-reindex-1h": { enabled: true, schedule: "0 * * * *" },
    "vectorizer-backup-daily": { enabled: true, schedule: "0 3 * * *" },
    "vectorizer-health-5m": { enabled: true, schedule: "*/5 * * * *" },
  };
  try {
    if (SCHEDULES_PATH && existsSync(SCHEDULES_PATH)) {
      const j = JSON.parse(await readFile(SCHEDULES_PATH, "utf-8"));
      const clean: ScheduleState = { ...defaults };
      for (const [job, entry] of Object.entries(j as Record<string, unknown>)) {
        if (validateScheduleEntry(job, entry) === null) {
          clean[job] = entry as { enabled: boolean; schedule: string };
        }
      }
      return clean;
    }
  } catch {}
  return defaults;
}

async function writeSchedules(s: ScheduleState) {
  if (!SCHEDULES_PATH) {
    throw new Error("settings schedules path is not configured (SETTINGS_SCHEDULES_PATH)");
  }
  await writeFile(SCHEDULES_PATH, JSON.stringify(s, null, 2), "utf-8");
}

export async function GET(req: NextRequest) {
  const denied = authFailed(req);
  if (denied) return denied;
  const env = await readEnv();
  const masked: Record<string, string> = { ...env };
  for (const k of ["ALERT_TELEGRAM_BOT_TOKEN", "SMTP_PASS"] as const) {
    if (masked[k] && masked[k].length > 8) masked[k] = masked[k].slice(0, 4) + "…" + masked[k].slice(-4);
    else if (masked[k]) masked[k] = "••••";
  }
  const schedules = await readSchedules();
  // Include live host cron status hint from env fallback (host hermes owns actual cron)
  const hint = "Cron is owned by Hermes on host (hermes cron list). Schedules here are desired state — apply via Save.";
  // D2: never return raw secrets — masked form only. Secrets are updated only
  // when the client explicitly sends a new (unmasked) value.
  return NextResponse.json({ env: masked, schedules, hint });
}

export async function POST(req: NextRequest) {
  const denied = authFailed(req);
  if (denied) return denied;
  if (!ENV_PATH) {
    return NextResponse.json(
      { error: "settings write-path is not configured (SETTINGS_ENV_PATH)" },
      { status: 501 }
    );
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, string> = {};
  for (const k of KEYS) {
    const v = body[k];
    if (typeof v !== "string") continue;
    // Masked placeholder echoed back by the UI (contains •/…) is not a new
    // secret — skip so the stored value is never overwritten with the mask.
    if (v.includes("•") || v.includes("…")) continue;
    const err = validateValue(k, v);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    patch[k] = v;
  }
  if (patch.SMTP_PORT && !/^\d+$/.test(patch.SMTP_PORT)) {
    return NextResponse.json({ error: "SMTP_PORT must be numeric" }, { status: 400 });
  }
  if (Object.keys(patch).length) await writeEnv(patch);
  // schedules if present
  if (body.schedules !== undefined) {
    let s: unknown;
    try {
      s = JSON.parse(body.schedules as string);
    } catch {
      return NextResponse.json({ error: "schedules: invalid JSON" }, { status: 400 });
    }
    if (typeof s !== "object" || s === null || Array.isArray(s)) {
      return NextResponse.json({ error: "schedules: must be an object" }, { status: 400 });
    }
    for (const [job, entry] of Object.entries(s as Record<string, unknown>)) {
      const err = validateScheduleEntry(job, entry);
      if (err) return NextResponse.json({ error: `schedules: ${err}` }, { status: 400 });
    }
    try {
      await writeSchedules({ ...(await readSchedules()), ...(s as ScheduleState) });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "schedule write failed" },
        { status: 501 }
      );
    }
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const denied = authFailed(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({})) as { action?: string; job?: string; schedule?: string };
  const job = body.job || "";
  const action = body.action || "";
  if ((action === "pause" || action === "resume" || action === "reschedule") && !KNOWN_JOBS.has(job)) {
    return NextResponse.json({ error: `unknown job: ${job}` }, { status: 400 });
  }
  const schedules = await readSchedules();
  if (action === "pause" && job && schedules[job]) {
    schedules[job].enabled = false;
    try { await writeSchedules(schedules); } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 501 });
    }
    return NextResponse.json({ ok: true, schedules });
  }
  if (action === "resume" && job && schedules[job]) {
    schedules[job].enabled = true;
    try { await writeSchedules(schedules); } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 501 });
    }
    return NextResponse.json({ ok: true, schedules });
  }
  if (action === "reschedule" && job && body.schedule) {
    if (body.schedule.length > 100 || !SCHEDULE_RE.test(body.schedule)) {
      return NextResponse.json({ error: "bad schedule" }, { status: 400 });
    }
    if (!schedules[job]) schedules[job] = { enabled: true, schedule: body.schedule };
    else schedules[job].schedule = body.schedule;
    try { await writeSchedules(schedules); } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 501 });
    }
    return NextResponse.json({ ok: true, schedules });
  }
  // run is host-only — surface hint
  if (action === "run") {
    return NextResponse.json({ ok: true, hint: "Run on host: hermes cron run " + job + " or wait for next tick. Dashboard in Docker cannot exec hermes." });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
