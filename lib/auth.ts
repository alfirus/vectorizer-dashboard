// Shared auth helpers — D1 (server gate re-enforced in privileged handlers,
// middleware.ts is the first layer) + client token plumbing for the login page.
//
// Server part reads DASHBOARD_AUTH_TOKEN. Client part reads the token the
// operator saved via /login from localStorage. This module is safe to import
// from both server and client components (browser APIs are typeof-guarded).

// ─── Server ────────────────────────────────────────────────────────────────

export function serverToken(): string {
  return process.env.DASHBOARD_AUTH_TOKEN || "";
}

export type AuthVerdict = "ok" | "unauthorized" | "misconfigured";

export function checkAuth(req: Request): AuthVerdict {
  const token = serverToken();
  if (!token) return "misconfigured";
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return "unauthorized";
  const got = auth.slice(7);
  if (got.length !== token.length) return "unauthorized";
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0 ? "ok" : "unauthorized";
}

// ─── Client ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "dashboard_token";

export function getDashboardToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setDashboardToken(token: string): void {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — caller still holds the token in memory */
  }
}

/** fetch() wrapper that attaches the saved dashboard bearer token, if any. */
export async function apiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const token = getDashboardToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
