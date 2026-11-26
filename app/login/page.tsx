"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { setDashboardToken } from "@/lib/auth";

// Minimal unlock screen for the single-operator dashboard (D1).
// The operator pastes the DASHBOARD_AUTH_TOKEN value; it is verified against
// GET /api/settings and stored in localStorage so lib/api.ts (apiFetch) and
// the dashboard pages can attach it as `Authorization: Bearer …`.
export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (r.status === 503) {
        setError("Server misconfigured: DASHBOARD_AUTH_TOKEN is not set.");
        return;
      }
      if (!r.ok) {
        setError("Invalid token.");
        return;
      }
      setDashboardToken(token.trim());
      window.location.href = "/";
    } catch {
      setError("Request failed — is the dashboard running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-card space-y-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" /> Dashboard unlock
        </h1>
        <p className="text-xs text-muted">
          Enter the dashboard auth token (server env <span className="font-mono">DASHBOARD_AUTH_TOKEN</span>).
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
          placeholder="Bearer token"
          className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm font-mono"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          onClick={unlock}
          disabled={busy || !token.trim()}
          className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}
