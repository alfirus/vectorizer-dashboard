"use client";
import { useEffect, useState, useCallback } from "react";
import {
  listWorkspaces, listScopes, createScope, getScopeStatus, listKeys, createKey,
  decodeJwtPayload, maskSecret, normalizeScope, type ScopeSummary,
  type ScopeStatus, type ScopeKey, type SimpleWorkspace, type JwtClaims,
} from "@/lib/scopes";
import {
  KeyRound, Plus, RefreshCw, ShieldCheck, Copy, Check, X,
  AlertTriangle, Fingerprint, Users,
} from "lucide-react";

function ClaimBadges({ claims }: { claims: JwtClaims }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {claims.w !== undefined && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] font-mono text-primary" title="workspace claim (w)">
          w:{String(claims.w)}
        </span>
      )}
      {claims.p !== undefined && claims.p !== "" && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface border border-border text-[11px] font-mono" title="peer claim (p)">
          p:{String(claims.p)}
        </span>
      )}
      {claims.ad === true && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-success/10 border border-success/20 text-[11px] font-mono text-success" title="admin claim (ad)">
          <ShieldCheck className="w-3 h-3" /> admin
        </span>
      )}
      {typeof claims.exp === "number" && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-surface border border-border text-[11px] font-mono text-muted" title="expiry (exp)">
          exp:{new Date(claims.exp * 1000).toLocaleDateString()}
        </span>
      )}
    </span>
  );
}

export default function ScopesPage() {
  const [workspaces, setWorkspaces] = useState<SimpleWorkspace[]>([]);
  const [wsId, setWsId] = useState("");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [scopes, setScopes] = useState<ScopeSummary[]>([]);
  const [keys, setKeys] = useState<ScopeKey[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [scopeName, setScopeName] = useState("");
  const [scopeSessions, setScopeSessions] = useState("");
  const [mintingScope, setMintingScope] = useState(false);

  const [keyName, setKeyName] = useState("");
  const [mintingKey, setMintingKey] = useState(false);
  const [mintedOnce, setMintedOnce] = useState<{ id: string; prefix: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScopeStatus | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [inspect, setInspect] = useState("");
  const inspectClaims: JwtClaims | null = inspect.trim() ? decodeJwtPayload(inspect) : null;

  const loadAll = useCallback(async (id: string) => {
    if (!id) return;
    setRefreshing(true);
    setBanner(null);
    try {
      const [s, k] = await Promise.all([listScopes(id), listKeys(id)]);
      setScopes(s);
      setKeys(k);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Failed to load scopes");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    listWorkspaces()
      .then((list) => {
        setWorkspaces(list);
        if (list.length > 0) setWsId(list[0].id);
      })
      .catch((e) => setBanner(e instanceof Error ? e.message : "unreachable — vectorizer is down or refusing connections"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (wsId) { setDetailId(null); setDetail(null); loadAll(wsId); } }, [wsId, loadAll]);

  const handleMintScope = async () => {
    const name = scopeName.trim();
    if (!name || !wsId) return;
    setMintingScope(true);
    setBanner(null);
    try {
      const sessions = scopeSessions.split(",").map((s) => s.trim()).filter(Boolean);
      const created = await createScope(wsId, name, sessions);
      setScopeName("");
      setScopeSessions("");
      setScopes((prev) => [...prev, normalizeScope({ id: created.id, name: created.id, sessions: created.sessions })]);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Failed to mint scope");
    } finally {
      setMintingScope(false);
    }
  };

  const handleMintKey = async () => {
    if (!wsId) return;
    setMintingKey(true);
    setBanner(null);
    try {
      const k = await createKey(wsId, keyName.trim() || undefined);
      // Full secret lives in state ONLY until dismissed — never logged.
      setMintedOnce({ id: k.id, prefix: k.prefix });
      setCopied(false);
      setKeyName("");
      if (k.id) setKeys((prev) => [...prev, { ...k, id: k.prefix || maskSecret(k.id) }]);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Failed to mint key");
    } finally {
      setMintingKey(false);
    }
  };

  const copyMinted = async () => {
    if (!mintedOnce) return;
    try {
      await navigator.clipboard.writeText(mintedOnce.id);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = mintedOnce.id;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
  };

  const openDetail = async (id: string) => {
    if (detailId === id) { setDetailId(null); setDetail(null); return; }
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getScopeStatus(wsId, id));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Failed to load scope detail");
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" /> Scopes &amp; Keys
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={wsId}
            onChange={(e) => setWsId(e.target.value)}
            aria-label="Workspace"
            className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 max-w-[220px]"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name ? `${w.name} (${w.id})` : w.id}</option>
            ))}
          </select>
          <button
            onClick={() => wsId && loadAll(wsId)}
            disabled={!wsId || refreshing}
            aria-label="Refresh"
            className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center hover:border-primary/40 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-muted ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5 text-xs text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {banner}
        </div>
      )}

      {mintedOnce && (
        <div className="bg-success/10 border border-success/30 rounded-2xl p-4 shadow-card">
          <div className="text-sm font-semibold text-success flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4" /> Key minted — copy it now
          </div>
          <div className="text-[11px] text-muted mb-2">The full secret is shown exactly once and never again. List views show only the masked prefix.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono">{mintedOnce.id}</code>
            <button onClick={copyMinted} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setMintedOnce(null)} aria-label="Dismiss secret" className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!loading && !banner && workspaces.length === 0 && (
        <div className="bg-card border border-border rounded-xl px-4 py-3 text-xs text-muted">
          No workspaces on this vectorizer yet — create one from the Workspaces page, then mint scopes and keys here.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2].map((i) => <div key={i} className="h-48 bg-card border border-border rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Scopes */}
          <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <h2 className="text-sm font-bold flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary" /> Scopes</h2>
            <p className="text-[11px] text-muted mb-3">Named session groups for <span className="font-mono">{wsId || "—"}</span>. Minting a scope returns its id (no server secret).</p>
            <div className="flex gap-2 mb-3">
              <input
                value={scopeName} onChange={(e) => setScopeName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMintScope()}
                placeholder="Scope name (required)…" aria-label="Scope name"
                className="flex-1 min-w-0 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
              <button onClick={handleMintScope} disabled={mintingScope || !scopeName.trim() || !wsId}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 shrink-0">
                <Plus className="w-4 h-4" /> {mintingScope ? "…" : "Mint"}
              </button>
            </div>
            <input
              value={scopeSessions} onChange={(e) => setScopeSessions(e.target.value)}
              placeholder="Sessions (optional, comma-separated)…" aria-label="Scope sessions"
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary mb-3"
            />
            {scopes.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-6 text-center text-xs text-muted">No scopes yet — mint the first one above.</div>
            ) : (
              <ul className="space-y-2">
                {scopes.map((s) => (
                  <li key={s.id} className="rounded-xl bg-surface border border-border overflow-hidden">
                    <button onClick={() => openDetail(s.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-2.5">
                      <Fingerprint className="w-4 h-4 text-primary shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold font-mono truncate">{s.name}</span>
                        <span className="block text-[11px] text-muted font-mono truncate">
                          {s.sessions.length} session{s.sessions.length === 1 ? "" : "s"}
                          {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString()}` : ""}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted shrink-0">{detailId === s.id ? "▾" : "▸"}</span>
                    </button>
                    {detailId === s.id && (
                      <div className="px-3 pb-3 pt-1 border-t border-border/60">
                        {detailLoading ? (
                          <div className="py-2 text-xs text-muted">Loading status…</div>
                        ) : detail ? (
                          <div className="pt-2">
                            <div className="text-[11px] text-muted mb-1.5">
                              <span className="font-mono font-semibold text-foreground">{detail.session_count}</span> session{detail.session_count === 1 ? "" : "s"} in scope
                            </div>
                            {detail.sessions.length === 0 ? (
                              <div className="text-[11px] text-muted">No sessions attached.</div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {detail.sessions.map((sid) => (
                                  <span key={sid} className="px-2 py-0.5 rounded-lg bg-background border border-border text-[11px] font-mono">{sid}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Keys */}
          <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <h2 className="text-sm font-bold flex items-center gap-2 mb-1"><KeyRound className="w-4 h-4 text-primary" /> API keys</h2>
            <p className="text-[11px] text-muted mb-3">Workspace-scoped keys for <span className="font-mono">{wsId || "—"}</span>. Full secret shown once at mint; lists are masked.</p>
            <div className="flex gap-2 mb-3">
              <input
                value={keyName} onChange={(e) => setKeyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMintKey()}
                placeholder="Key label (optional)…" aria-label="Key label"
                className="flex-1 min-w-0 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
              <button onClick={handleMintKey} disabled={mintingKey || !wsId}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 shrink-0">
                <Plus className="w-4 h-4" /> {mintingKey ? "…" : "Mint"}
              </button>
            </div>
            {keys.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-6 text-center text-xs text-muted">No keys yet — mint the first one above.</div>
            ) : (
              <ul className="space-y-2">
                {keys.map((k, i) => (
                  <li key={`${k.id}-${i}`} className="rounded-xl bg-surface border border-border px-3 py-2.5 flex items-center gap-2.5">
                    <KeyRound className="w-4 h-4 text-muted shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-mono truncate">{maskSecret(k.id)}</span>
                      <span className="block text-[11px] text-muted font-mono truncate">
                        {k.workspace_id}{k.created_at ? ` · ${new Date(k.created_at).toLocaleDateString()}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Token inspector: decode w/p/ad claims, display only */}
      <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4 text-primary" /> Token inspector</h2>
        <p className="text-[11px] text-muted mb-3">Paste a JWT to view its workspace (<span className="font-mono">w</span>), peer (<span className="font-mono">p</span>) and admin (<span className="font-mono">ad</span>) claims. Decoded locally — signature is never verified, display only.</p>
        <input
          value={inspect} onChange={(e) => setInspect(e.target.value)}
          placeholder="Paste JWT (header.payload.signature)…" aria-label="JWT to inspect"
          spellCheck={false} autoComplete="off"
          className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-primary"
        />
        {inspect.trim() !== "" && (
          <div className="mt-2.5">
            {inspectClaims ? <ClaimBadges claims={inspectClaims} /> : (
              <div className="text-[11px] text-muted">Not a decodable JWT — <span className="font-mono">sk_…</span> API keys carry no embedded claims.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
