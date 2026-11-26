// Scopes + keys manager API helpers (P2 scopes page).
//
// All calls go through the Next.js proxy (`/api/vectorizer/*`) so the
// API key stays server-side. Shapes below match
// `internal/handlers/scopes.go` and `internal/handlers/keys.go` exactly:
//   Create scope: POST /workspaces/:id/scopes  {name[, id][, sessions[]]}
//               -> 201 {id, sessions}
//   List scopes:  GET  /workspaces/:id/scopes  -> {scopes: [...]}
//   Scope detail: GET  .../scopes/:sid          -> scope doc
//   Scope status: GET  .../scopes/:sid/status   -> {scope, session_count, sessions}
//   Scope sess:   GET  .../scopes/:sid/sessions -> {sessions: [...]}
//   Keys:         GET|POST /workspaces/:id/keys -> {keys:[...]} / 201 key
//   Key create body: {workspace_id?, name?} (both optional; workspace_id
//   falls back to the :id path param, then "default").
//   Key create returns {id, workspace_id, prefix, created_at} where `id`
//   is the FULL secret (`sk_<hex>`) shown exactly once at mint time.

const PROXY = "/api/vectorizer";

const jsonHeaders = { "Content-Type": "application/json" };

export interface ScopeSummary {
  id: string;
  name: string;
  sessions: string[];
  sessionCount: number | null;
  createdAt: string | null;
}

export interface ScopeStatus {
  scope: string;
  session_count: number;
  sessions: string[];
}

export interface ScopeKey {
  id: string;
  workspace_id: string;
  prefix: string;
  created_at: string;
}

export interface MintedKey extends ScopeKey {}

/** Display-only JWT claims (security.Claims: w/p/ad). No verification. */
export interface JwtClaims {
  w?: string;
  p?: string;
  ad?: boolean;
  exp?: number;
  [k: string]: unknown;
}

/**
 * Decode a JWT payload client-side (base64url middle segment only).
 * Display only — NEVER used for auth decisions. Returns null when the
 * value is not JWT-shaped (e.g. `sk_...` API keys).
 */
export function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const claims = JSON.parse(json) as JwtClaims;
    if (typeof claims !== "object" || claims === null) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Mask a secret for list views: `sk_abc123…` (prefix only). */
export function maskSecret(secret: string): string {
  if (!secret) return "—";
  return secret.length <= 10 ? secret.slice(0, 4) + "…" : secret.slice(0, 10) + "…";
}

/** Normalize one raw scope entry from List/Get into ScopeSummary. */
export function normalizeScope(raw: unknown): ScopeSummary {
  const r = (raw || {}) as Record<string, unknown>;
  const meta = (r.metadata || {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const id = str(r.id) || str(meta.scope_name) || str(r.document) || str(r.name) || "—";
  const name = str(meta.scope_name) || str(r.name) || id;
  const sessRaw = meta.sessions;
  const sessions: string[] =
    typeof sessRaw === "string"
      ? sessRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : Array.isArray(sessRaw)
        ? sessRaw.filter((s): s is string => typeof s === "string")
        : Array.isArray(r.sessions)
          ? (r.sessions as unknown[]).filter((s): s is string => typeof s === "string")
          : [];
  const createdAt = str(meta.created_at) || str(r.created_at) || null;
  return { id, name, sessions, sessionCount: null, createdAt };
}

/** Map HTTP/proxy failures to the shared banner wording convention. */
export function bannerFor(status: number | null, detail?: string): string {
  if (status === 401) return "unauthorized — check the dashboard API key";
  if (status === 403) return "forbidden — this key may not access that workspace";
  if (status === 502 || status === null)
    return "unreachable — vectorizer is down or refusing connections";
  if (status === 404) return "not found — the workspace, scope, or route does not exist";
  return detail || `request failed (HTTP ${status})`;
}

async function parseOrThrow(res: Response, what: string): Promise<{ status: number; data: Record<string, unknown> }> {
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = new Error(bannerFor(res.status, typeof data.error === "string" ? data.error : undefined));
    (err as { status?: number }).status = res.status;
    throw err;
  }
  void what;
  return { status: res.status, data };
}

export interface SimpleWorkspace {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Workspace list that surfaces proxy failures as banner errors.
 * (lib/api's getWorkspaces swallows non-OK into an empty list for the
 * activity feed — here we need the down-state banner instead.)
 */
export async function listWorkspaces(): Promise<SimpleWorkspace[]> {
  let res: Response;
  try {
    res = await fetch(`${PROXY}/workspaces`, { headers: jsonHeaders });
  } catch {
    throw new Error(bannerFor(null));
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new Error(bannerFor(res.status, typeof data.error === "string" ? data.error : undefined));
  }
  const raw = Array.isArray(data.workspaces) ? data.workspaces : [];
  return (raw as Record<string, unknown>[]).map((w) => ({
    id: typeof w.id === "string" ? w.id : "",
    name: typeof w.name === "string" ? w.name : "",
    created_at: typeof w.created_at === "string" ? w.created_at : "",
  })).filter((w) => w.id);
}

export async function listScopes(workspaceId: string): Promise<ScopeSummary[]> {
  let res: Response;
  try {
    res = await fetch(`${PROXY}/workspaces/${encodeURIComponent(workspaceId)}/scopes`, { headers: jsonHeaders });
  } catch {
    throw new Error(bannerFor(null));
  }
  const { data } = await parseOrThrow(res, "list scopes");
  const raw = Array.isArray(data.scopes) ? data.scopes : [];
  return (raw as unknown[]).map(normalizeScope);
}

export async function createScope(
  workspaceId: string,
  name: string,
  sessions: string[] = []
): Promise<{ id: string; sessions: string[] }> {
  let res: Response;
  try {
    res = await fetch(`${PROXY}/workspaces/${encodeURIComponent(workspaceId)}/scopes`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(sessions.length > 0 ? { name, sessions } : { name }),
    });
  } catch {
    throw new Error(bannerFor(null));
  }
  const { data } = await parseOrThrow(res, "create scope");
  const id = typeof data.id === "string" ? data.id : name;
  const sess = Array.isArray(data.sessions)
    ? (data.sessions as unknown[]).filter((s): s is string => typeof s === "string")
    : sessions;
  return { id, sessions: sess };
}

export async function getScopeStatus(workspaceId: string, scopeId: string): Promise<ScopeStatus> {
  let res: Response;
  try {
    res = await fetch(
      `${PROXY}/workspaces/${encodeURIComponent(workspaceId)}/scopes/${encodeURIComponent(scopeId)}/status`,
      { headers: jsonHeaders }
    );
  } catch {
    throw new Error(bannerFor(null));
  }
  const { data } = await parseOrThrow(res, "scope status");
  const sessions = Array.isArray(data.sessions)
    ? (data.sessions as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  return {
    scope: typeof data.scope === "string" ? data.scope : scopeId,
    session_count: typeof data.session_count === "number" ? data.session_count : sessions.length,
    sessions,
  };
}

export async function listKeys(workspaceId: string): Promise<ScopeKey[]> {
  let res: Response;
  try {
    res = await fetch(`${PROXY}/workspaces/${encodeURIComponent(workspaceId)}/keys`, { headers: jsonHeaders });
  } catch {
    throw new Error(bannerFor(null));
  }
  const { data } = await parseOrThrow(res, "list keys");
  const raw = Array.isArray(data.keys) ? data.keys : [];
  return (raw as Record<string, unknown>[]).map((k) => ({
    id: typeof k.id === "string" ? k.id : "",
    workspace_id: typeof k.workspace_id === "string" ? k.workspace_id : workspaceId,
    prefix: typeof k.prefix === "string" ? k.prefix : maskSecret(typeof k.id === "string" ? k.id : ""),
    created_at: typeof k.created_at === "string" ? k.created_at : "",
  }));
}

export async function createKey(workspaceId: string, name?: string): Promise<MintedKey> {
  let res: Response;
  try {
    res = await fetch(`${PROXY}/workspaces/${encodeURIComponent(workspaceId)}/keys`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(name ? { workspace_id: workspaceId, name } : { workspace_id: workspaceId }),
    });
  } catch {
    throw new Error(bannerFor(null));
  }
  const { data } = await parseOrThrow(res, "create key");
  return {
    id: typeof data.id === "string" ? data.id : "",
    workspace_id: typeof data.workspace_id === "string" ? data.workspace_id : workspaceId,
    prefix: typeof data.prefix === "string" ? data.prefix : "",
    created_at: typeof data.created_at === "string" ? data.created_at : "",
  };
}
