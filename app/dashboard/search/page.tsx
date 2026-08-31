"use client";

import { useState } from "react";
import { searchMessages } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Hit {
  id: string;
  score: number;
  document: string;
  metadata: Record<string, unknown>;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("family");
  const [nResults, setNResults] = useState(10);
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchMessages(query, workspace, nResults);
      setResults(res.results || []);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Semantic Search</h1>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search your memory..."
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-muted">
            Workspace:
            <input
              type="text"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:border-primary"
            />
          </label>
          <label className="flex items-center gap-2 text-muted">
            Results:
            <input
              type="range"
              min={1}
              max={50}
              value={nResults}
              onChange={(e) => setNResults(Number(e.target.value))}
              className="w-24"
            />
            <span className="w-6 text-center">{nResults}</span>
          </label>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-muted text-center py-8">No results found.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div
              key={r.id || i}
              className="bg-surface border border-border rounded-lg p-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    r.score > 0.8
                      ? "bg-success/15 text-success"
                      : r.score > 0.5
                      ? "bg-warning/15 text-warning"
                      : "bg-muted/15 text-muted"
                  )}
                >
                  {(r.score * 100).toFixed(1)}%
                </span>
                {r.source && (
                  <span className="text-xs text-muted px-2 py-0.5 bg-surface-hover rounded">
                    {r.source}
                  </span>
                )}
                <span className="text-xs text-muted font-mono">
                  {String(r.metadata?.session_id || r.id).slice(0, 30)}
                </span>
                {r.metadata?.role ? (
                  <span className="text-xs text-muted px-2 py-0.5 bg-surface-hover rounded">
                    {String(r.metadata.role)}
                  </span>
                ) : null}
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {r.document?.slice(0, 600)}
                {(r.document?.length || 0) > 600 && "…"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
