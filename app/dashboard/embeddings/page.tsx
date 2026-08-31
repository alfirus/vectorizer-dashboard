"use client";

import { useEffect, useState } from "react";
import { getCollections, getCollectionVectors } from "@/lib/api";
import type { ChromaCollection } from "@/lib/types";

// Simple PCA for dimensionality reduction (768d → 2d)
function pca2d(vectors: number[][]): [number, number][] {
  if (vectors.length < 2) return vectors.map(() => [0, 0]);

  const n = vectors.length;
  const d = vectors[0].length;

  // Mean center
  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j];
  for (let j = 0; j < d; j++) mean[j] /= n;

  const centered = vectors.map((v) => v.map((x, j) => x - mean[j]));

  // Power iteration for first 2 principal components
  function powerIteration(data: number[][], iterations = 50): number[] {
    let vec = Array.from({ length: d }, () => Math.random() - 0.5);
    for (let iter = 0; iter < iterations; iter++) {
      const newVec = new Array(d).fill(0);
      for (const row of data) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += row[j] * vec[j];
        for (let j = 0; j < d; j++) newVec[j] += dot * row[j];
      }
      let norm = 0;
      for (let j = 0; j < d; j++) norm += newVec[j] * newVec[j];
      norm = Math.sqrt(norm) || 1;
      vec = newVec.map((x) => x / norm);
    }
    return vec;
  }

  const pc1 = powerIteration(centered);

  // Deflate
  const projected1 = centered.map((row) => {
    let dot = 0;
    for (let j = 0; j < d; j++) dot += row[j] * pc1[j];
    return dot;
  });
  const deflated = centered.map((row, i) =>
    row.map((x, j) => x - projected1[i] * pc1[j])
  );

  const pc2 = powerIteration(deflated);

  return centered.map((row) => {
    let x = 0,
      y = 0;
    for (let j = 0; j < d; j++) {
      x += row[j] * pc1[j];
      y += row[j] * pc2[j];
    }
    return [x, y];
  });
}

interface Point {
  x: number;
  y: number;
  label: string;
  role: string;
  doc: string;
}

export default function EmbeddingsPage() {
  const [collections, setCollections] = useState<ChromaCollection[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    getCollections().then((cs) => {
      setCollections(cs);
      if (cs.length > 0) setSelected(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    getCollectionVectors(selected, 100)
      .then((data) => {
        if (!data.embeddings || data.embeddings.length === 0) {
          setPoints([]);
          return;
        }
        const coords = pca2d(data.embeddings);
        const pts: Point[] = coords.map(([x, y], i) => ({
          x,
          y,
          role: String(data.metadatas?.[i]?.role || "unknown"),
          label: String(data.ids?.[i] || "").slice(0, 12),
          doc: String(data.documents?.[i] || "").slice(0, 200),
        }));
        setPoints(pts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selected]);

  const filtered = filter
    ? points.filter((p) => p.role === filter)
    : points;

  const roleColors: Record<string, string> = {
    user: "#6366f1",
    assistant: "#22d3ee",
    system: "#64748b",
    unknown: "#f59e0b",
  };

  // Compute bounds
  const xs = filtered.map((p) => p.x);
  const ys = filtered.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const padX = (maxX - minX) * 0.1 || 1;
  const padY = (maxY - minY) * 0.1 || 1;
  const loX = minX - padX;
  const hiX = maxX + padX;
  const loY = minY - padY;
  const hiY = maxY + padY;

  const toSvg = (x: number, y: number, w: number, h: number) => ({
    sx: ((x - loX) / (hiX - loX)) * w,
    sy: ((y - loY) / (hiY - loY)) * h,
  });

  const svgW = 800;
  const svgH = 500;

  return (
    <div className="space-y-6">
      <h1 className="text-xl lg:text-2xl font-bold">Embedding Visualization</h1>
      <p className="text-sm text-muted">
        PCA projection of document embeddings to 2D. Each dot = one stored
        message.
      </p>

      <div className="flex items-center gap-4">
        <label className="text-sm text-muted">Collection:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-card border border-border rounded px-2 py-1 text-sm"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id.slice(0, 8)})
            </option>
          ))}
        </select>

        <label className="text-sm text-muted">Filter role:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-card border border-border rounded px-2 py-1 text-sm"
        >
          <option value="">All</option>
          <option value="user">User</option>
          <option value="assistant">Assistant</option>
          <option value="system">System</option>
        </select>

        <span className="text-xs text-muted ml-auto">
          {filtered.length} points
        </span>
      </div>

      {loading ? (
        <div className="h-[500px] bg-card border border-border rounded-2xl shadow-card animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="h-[500px] bg-card border border-border rounded-2xl shadow-card flex items-center justify-center text-muted">
          No embedding data in this collection.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl shadow-card p-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full"
            style={{ minWidth: 600 }}
          >
            {/* Grid lines */}
            {Array.from({ length: 5 }).map((_, i) => {
              const x = (svgW / 4) * i;
              return (
                <line
                  key={`gx${i}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={svgH}
                  stroke="#1e1e2e"
                  strokeWidth={1}
                />
              );
            })}
            {Array.from({ length: 5 }).map((_, i) => {
              const y = (svgH / 4) * i;
              return (
                <line
                  key={`gy${i}`}
                  x1={0}
                  y1={y}
                  x2={svgW}
                  y2={y}
                  stroke="#1e1e2e"
                  strokeWidth={1}
                />
              );
            })}

            {/* Points */}
            {filtered.map((p, i) => {
              const { sx, sy } = toSvg(p.x, p.y, svgW, svgH);
              const color = roleColors[p.role] || "#f59e0b";
              return (
                <g key={i}>
                  <circle cx={sx} cy={sy} r={4} fill={color} opacity={0.7}>
                    <title>{`[${p.role}] ${p.doc}`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex gap-4 mt-3 justify-center">
            {Object.entries(roleColors).map(([role, color]) => (
              <div key={role} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-muted capitalize">{role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
