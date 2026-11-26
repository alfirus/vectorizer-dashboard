"use client";
import { useEffect, useState, useCallback } from "react";
import {
  listWorkspaces,
  getPeers,
  createPeer,
  getPeerCard,
  setPeerCard,
  getPeerSessions,
  getPeerRepresentation,
  VectorizerError,
} from "@/lib/api";
import type { Peer } from "@/lib/types";
import { VectorizerBanner } from "@/components/VectorizerBanner";
import { Users, Plus, Contact, History, ScrollText, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PeersPage() {
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [ws, setWs] = useState("");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selected, setSelected] = useState("");
  const [newId, setNewId] = useState("");
  const [creating, setCreating] = useState(false);
  const [cardText, setCardText] = useState("");
  const [cardLoaded, setCardLoaded] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [sessions, setSessions] = useState<{ id: string }[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [representation, setRepresentation] = useState("");
  const [repLoading, setRepLoading] = useState(false);
  const [loadingPeers, setLoadingPeers] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    listWorkspaces()
      .then((r) => {
        const list = r.workspaces || [];
        setWorkspaces(list);
        if (list.length > 0) setWs((cur) => cur || list[0].id);
      })
      .catch((e) => setError(e));
  }, []);

  const loadPeers = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setLoadingPeers(true); setError(null);
    try {
      const r = await getPeers(wsId);
      setPeers(r.peers);
      setSelected((cur) => (r.peers.some((p) => p.id === cur) ? cur : ""));
    } catch (e) { setError(e); setPeers([]); }
    finally { setLoadingPeers(false); }
  }, []);

  useEffect(() => { loadPeers(ws); }, [ws, loadPeers]);

  // Load card + sessions when the selected peer changes.
  useEffect(() => {
    if (!ws || !selected) { setCardText(""); setCardLoaded(false); setSessions([]); setRepresentation(""); setSessionId(""); return; }
    setCardLoaded(false); setError(null); setNotice("");
    getPeerCard(ws, selected)
      .then((c) => { setCardText((c.lines || []).join("\n")); setCardLoaded(true); })
      .catch((e) => { setError(e); setCardLoaded(true); });
    getPeerSessions(ws, selected)
      .then((s) => setSessions(s.sessions))
      .catch((e) => { setError(e); setSessions([]); });
    setRepresentation(""); setSessionId("");
  }, [ws, selected]);

  const handleCreate = async () => {
    const id = newId.trim();
    if (!ws || !id || creating) return;
    setCreating(true); setError(null); setNotice("");
    try {
      await createPeer(ws, id);
      setNewId(""); setNotice(`Peer "${id}" created.`);
      await loadPeers(ws); setSelected(id);
    } catch (e) {
      if (e instanceof VectorizerError) setError(e);
      else setNotice("Failed to create peer.");
    } finally { setCreating(false); }
  };

  const handleSaveCard = async () => {
    if (!ws || !selected || savingCard) return;
    setSavingCard(true); setError(null); setNotice("");
    const lines = cardText.split("\n").map((l) => l.trimEnd());
    // Drop a single trailing empty line; keep intentional blanks.
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    try {
      await setPeerCard(ws, selected, lines);
      setNotice("Card saved.");
    } catch (e) { setError(e); }
    finally { setSavingCard(false); }
  };

  const handleRemoveCard = async () => {
    if (!ws || !selected || savingCard) return;
    if (!confirm(`Remove the card for peer "${selected}"?`)) return;
    setSavingCard(true); setError(null); setNotice("");
    try {
      await setPeerCard(ws, selected, []);
      setCardText(""); setNotice("Card removed.");
    } catch (e) { setError(e); }
    finally { setSavingCard(false); }
  };

  const handleLoadRepresentation = async () => {
    if (!ws || !selected || repLoading) return;
    setRepLoading(true); setError(null); setNotice("");
    try {
      const r = await getPeerRepresentation(ws, selected, sessionId.trim() || undefined);
      const parts: string[] = [];
      if (r.text) parts.push(r.text);
      const concls = (r.conclusions || []).map((c, i) => {
        const body = c.document || c.content || JSON.stringify(c);
        return `[${i + 1}] ${body}`;
      });
      if (concls.length > 0) parts.push("\nConclusions:\n" + concls.join("\n\n"));
      setRepresentation(parts.join("\n") || "(empty representation)");
    } catch (e) { setError(e); setRepresentation(""); }
    finally { setRepLoading(false); }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Peers
        </h1>
        <select
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          aria-label="Workspace"
        >
          {workspaces.length === 0 && <option value="">No workspaces</option>}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name || w.id}</option>
          ))}
        </select>
      </div>

      <VectorizerBanner error={error} />
      {notice && (
        <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm">{notice}</div>
      )}

      {/* Create peer */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <div className="text-sm font-semibold mb-2">New peer</div>
        <div className="flex gap-2">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Peer id…"
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newId.trim() || !ws}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            <Plus className="w-4 h-4" /> {creating ? "…" : "Create"}
          </button>
        </div>
      </div>

      {/* Peer list */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <div className="text-sm font-semibold mb-2">Peers{peers.length > 0 && ` (${peers.length})`}</div>
        {loadingPeers ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-11 bg-background border border-border rounded-xl animate-pulse" />)}</div>
        ) : peers.length === 0 ? (
          <div className="text-sm text-muted py-4 text-center">
            {ws ? "No peers yet — create one above." : "Select a workspace first."}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {peers.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={cn(
                  "text-left rounded-xl border px-3.5 py-2.5 transition-colors",
                  selected === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/40"
                )}
              >
                <div className="text-sm font-bold font-mono truncate">{p.id}</div>
                {p.name !== p.id && <div className="text-xs text-muted truncate">{p.name}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* Card editor */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Contact className="w-4 h-4 text-primary" /> Card — <span className="font-mono">{selected}</span>
            </div>
            {!cardLoaded ? (
              <div className="h-28 bg-background border border-border rounded-xl animate-pulse" />
            ) : (
              <>
                <textarea
                  value={cardText}
                  onChange={(e) => setCardText(e.target.value)}
                  rows={6}
                  placeholder="One fact per line…"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSaveCard}
                    disabled={savingCard}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> {savingCard ? "…" : "Save card"}
                  </button>
                  <button
                    onClick={handleRemoveCard}
                    disabled={savingCard}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-semibold disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> Remove card
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Sessions + representation */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <History className="w-4 h-4 text-primary" /> Sessions
            </div>
            {sessions.length === 0 ? (
              <div className="text-sm text-muted">No sessions for this peer.</div>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSessionId(s.id)}
                    className={cn(
                      "text-xs font-mono px-3 py-1.5 rounded-full border",
                      sessionId === s.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:border-primary/40"
                    )}
                  >
                    {s.id}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="session_id (optional — pick above or type)"
                className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
              />
              <button
                onClick={handleLoadRepresentation}
                disabled={repLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 shrink-0"
              >
                <ScrollText className="w-4 h-4" /> {repLoading ? "…" : "Representation"}
              </button>
            </div>
            {representation && (
              <pre className="mt-3 whitespace-pre-wrap break-words text-xs font-mono bg-background border border-border rounded-xl p-3 max-h-80 overflow-y-auto">
                {representation}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
