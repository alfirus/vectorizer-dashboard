import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

export const runtime = "nodejs";

const ENV_PATH = "C:/Users/alfir/vectorizer/.env";
const SCHEDULES_PATH = "C:/Users/alfir/vectorizer/cron_schedules.json"; // also mounted as /data/ai sync optional
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

type ScheduleState = Record<string, { enabled: boolean; schedule: string; lastRun?: string }>;

async function readEnv(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const txt = await readFile(ENV_PATH, "utf-8");
    for (const line of txt.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
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
      if (k in patch) next.push(`${k}=${patch[k]}`);
      else next.push(line);
    } else {
      next.push(line);
    }
  }
  for (const k of KEYS) {
    if (k in patch && !seen.has(k)) next.push(`${k}=${patch[k]}`);
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
    if (existsSync(SCHEDULES_PATH)) {
      const j = JSON.parse(await readFile(SCHEDULES_PATH, "utf-8"));
      return { ...defaults, ...j };
    }
  } catch {}
  return defaults;
}

async function writeSchedules(s: ScheduleState) {
  await writeFile(SCHEDULES_PATH, JSON.stringify(s, null, 2), "utf-8");
}

export async function GET() {
  const env = await readEnv();
  const masked: Record<string, string> = { ...env };
  for (const k of ["ALERT_TELEGRAM_BOT_TOKEN", "SMTP_PASS"] as const) {
    if (masked[k] && masked[k].length > 8) masked[k] = masked[k].slice(0, 4) + "…" + masked[k].slice(-4);
    else if (masked[k]) masked[k] = "••••";
  }
  const schedules = await readSchedules();
  // Include live host cron status hint from env fallback (host hermes owns actual cron)
  const hint = "Cron is owned by Hermes on host (hermes cron list). Schedules here are desired state — apply via Save.";
  return NextResponse.json({ env: masked, rawEnv: env, schedules, hint });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const patch: Record<string, string> = {};
  for (const k of KEYS) {
    if (typeof body[k] === "string") {
      if (body[k].includes("•") || body[k].includes("…")) continue;
      patch[k] = body[k];
    }
  }
  if (patch.SMTP_PORT && !/^\d+$/.test(patch.SMTP_PORT)) {
    return NextResponse.json({ error: "SMTP_PORT must be numeric" }, { status: 400 });
  }
  if (Object.keys(patch).length) await writeEnv(patch);
  // schedules if present
  if (body.schedules) {
    try {
      const s = JSON.parse(body.schedules) as ScheduleState;
      await writeSchedules(s);
    } catch {}
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { action?: string; job?: string; schedule?: string };
  const job = body.job || "";
  const action = body.action || "";
  const schedules = await readSchedules();
  if (action === "pause" && job && schedules[job]) {
    schedules[job].enabled = false;
    await writeSchedules(schedules);
    return NextResponse.json({ ok: true, schedules });
  }
  if (action === "resume" && job && schedules[job]) {
    schedules[job].enabled = true;
    await writeSchedules(schedules);
    return NextResponse.json({ ok: true, schedules });
  }
  if (action === "reschedule" && job && body.schedule) {
    if (!schedules[job]) schedules[job] = { enabled: true, schedule: body.schedule };
    else schedules[job].schedule = body.schedule;
    await writeSchedules(schedules);
    return NextResponse.json({ ok: true, schedules });
  }
  // run is host-only — surface hint
  if (action === "run") {
    return NextResponse.json({ ok: true, hint: "Run on host: hermes cron run " + job + " or wait for next tick. Dashboard in Docker cannot exec hermes." });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
