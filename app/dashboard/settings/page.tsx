"use client";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Clock, Mail, Send, Shield, Database, Eye, EyeOff, RotateCw, Play, Pause } from "lucide-react";

type Env = Record<string, string>;
type Sched = Record<string, { enabled: boolean; schedule: string }>;
const JOBS = [
  { id: "vectorizer-reindex-1h", label: "Reindex", desc: "Vault → Vectorizer diff index" },
  { id: "vectorizer-backup-daily", label: "Backup", desc: "Chroma + GRAPH → SynologyDrive, keep 7d" },
  { id: "vectorizer-health-5m", label: "Health", desc: "Probe 8091/8100/8092/1234, auto-heal + alert" },
];

export default function SettingsPage() {
  const [env, setEnv] = useState<Env>({});
  const [raw, setRaw] = useState<Env>({});
  const [sched, setSched] = useState<Sched>({});
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/settings");
      const d = await r.json();
      setEnv(d.rawEnv || {});
      setRaw(d.rawEnv || {});
      setSched(d.schedules || {});
      setHint(d.hint || "");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { ...env, schedules: JSON.stringify(sched) };
      const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); setRaw({ ...env }); }
      else alert("Save failed");
    } finally { setSaving(false); }
  };

  const toggle = async (id: string, en: boolean) => {
    const next: Sched = { ...sched, [id]: { ...(sched[id] || { schedule: "" }), enabled: en } };
    setSched(next);
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: en ? "resume" : "pause", job: id }) });
  };

  const dirty = JSON.stringify(env) !== JSON.stringify(raw);

  if (loading) return <div className="space-y-3 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-card border border-border rounded-2xl" />)}</div>;

  return (
    <div className="space-y-5 animate-fadeIn pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-primary" /> Settings</h1>
        <button onClick={load} className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center"><RotateCw className="w-4 h-4" /></button>
      </div>

      <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-primary" /> Scheduled Jobs</h2>
        <p className="text-[11px] text-muted mb-3">{hint}</p>
        <div className="space-y-2">
          {JOBS.map((j) => {
            const en = sched[j.id]?.enabled !== false;
            return (
              <div key={j.id} className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">{j.label} <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${en ? "bg-success/15 text-success" : "bg-muted/15 text-muted"}`}>{en ? "ON" : "OFF"}</span></div>
                  <div className="text-[11px] text-muted">{j.desc}</div>
                  <div className="text-[11px] font-mono text-muted">{sched[j.id]?.schedule || "—"}</div>
                </div>
                <button onClick={() => toggle(j.id, !en)} className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${en ? "bg-primary text-white" : "bg-surface border border-border"}`}>
                  {en ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {JOBS.map((j) => (
            <label key={j.id} className="flex items-center gap-2 text-xs">
              <span className="text-muted w-24 shrink-0">{j.label} cron</span>
              <input value={sched[j.id]?.schedule || ""} onChange={(e) => setSched({ ...sched, [j.id]: { ...(sched[j.id] || { enabled: true }), schedule: e.target.value } })} placeholder="0 * * * *" className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary" />
            </label>
          ))}
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3"><Send className="w-4 h-4 text-primary" /> Telegram Alerts</h2>
        <p className="text-xs text-muted mb-3">Health alerts via Telegram DM. Stored in <code className="px-1 py-0.5 bg-surface rounded text-[11px]">C:/Users/alfir/vectorizer/.env</code> — server-only.</p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">Bot Token <span className="text-muted/60">(from @BotFather)</span></span>
            <div className="mt-1 flex gap-2">
              <input value={env.ALERT_TELEGRAM_BOT_TOKEN || ""} onChange={(e) => setEnv({ ...env, ALERT_TELEGRAM_BOT_TOKEN: e.target.value })} type={showPass ? "text" : "password"} placeholder="1234567890:AAH..." className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary" />
              <button onClick={() => setShowPass(!showPass)} className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shrink-0">{showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
          </label>
          <label className="block"><span className="text-xs font-medium text-muted">Chat ID</span><input value={env.ALERT_TELEGRAM_CHAT_ID || ""} onChange={(e) => setEnv({ ...env, ALERT_TELEGRAM_CHAT_ID: e.target.value })} placeholder="123456789" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary" /><span className="text-[11px] text-muted">Use @userinfobot or Bot getUpdates</span></label>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3"><Mail className="w-4 h-4 text-primary" /> Email Alerts</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-muted">Alert To</span><input value={env.ALERT_EMAIL_TO || ""} onChange={(e) => setEnv({ ...env, ALERT_EMAIL_TO: e.target.value })} placeholder="alfirus@gmail.com" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" /></label>
            <label className="block"><span className="text-xs font-medium text-muted">Alert From</span><input value={env.ALERT_EMAIL_FROM || ""} onChange={(e) => setEnv({ ...env, ALERT_EMAIL_FROM: e.target.value })} placeholder="vectorizer@alfirus.my" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block col-span-2"><span className="text-xs font-medium text-muted">SMTP Host</span><input value={env.SMTP_HOST || ""} onChange={(e) => setEnv({ ...env, SMTP_HOST: e.target.value })} placeholder="smtp.gmail.com" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary" /></label>
            <label className="block"><span className="text-xs font-medium text-muted">Port</span><input value={env.SMTP_PORT || ""} onChange={(e) => setEnv({ ...env, SMTP_PORT: e.target.value })} placeholder="587" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" /></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-muted">SMTP User</span><input value={env.SMTP_USER || ""} onChange={(e) => setEnv({ ...env, SMTP_USER: e.target.value })} placeholder="you@gmail.com" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" /></label>
            <label className="block"><span className="text-xs font-medium text-muted">SMTP Pass</span><input value={env.SMTP_PASS || ""} onChange={(e) => setEnv({ ...env, SMTP_PASS: e.target.value })} type={showPass ? "text" : "password"} placeholder="16-char app password" className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary" /></label>
          </div>
          <p className="text-[11px] text-muted">Gmail: Google Account → Security → App passwords → 16-char code. Stored only in <code className="px-1 py-0.5 bg-surface rounded">vectorizer/.env</code>.</p>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3"><Database className="w-4 h-4 text-primary" /> Backup</h2>
        <div className="flex items-center gap-3">
          <label className="flex-1 block"><span className="text-xs font-medium text-muted">Retention (days)</span><input value={env.BACKUP_RETENTION_DAYS || "7"} onChange={(e) => setEnv({ ...env, BACKUP_RETENTION_DAYS: e.target.value })} className="mt-1 w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" /></label>
          <div className="text-xs text-muted pt-5">Daily 03:00 → <code className="px-1 py-0.5 bg-surface rounded">SynologyDrive/ai/backups/vectorizer/</code></div>
        </div>
      </section>

      <div className="flex items-start gap-2 text-[11px] text-muted bg-surface/50 border border-border rounded-xl px-3 py-2.5">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 text-primary" /><span>Secrets live in <code className="font-mono">C:/Users/alfir/vectorizer/.env</code> on the server and are masked here. Values never leave the server except as you type. Schedules saved to <code className="font-mono">cron_schedules.json</code>.</span>
      </div>

      <button onClick={save} disabled={saving} className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all ${saving ? "bg-surface border border-border text-muted" : "bg-primary text-white shadow-glow active:scale-[0.98]"}`}>
        <Save className="w-4 h-4" /> {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
      </button>
    </div>
  );
}
