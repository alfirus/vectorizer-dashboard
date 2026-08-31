"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface GNode {
  id: string;
  type: string;
  label: string;
}

interface GEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

interface GraphData {
  nodes: GNode[];
  edges: GEdge[];
}

interface LayoutNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_COLORS: Record<string, string> = {
  doc: "#6366f1",
  chunk: "#22d3ee",
  folder: "#22c55e",
  entity: "#f59e0b",
  unknown: "#64748b",
};

const WORKSPACE_COLORS: Record<string, string> = {
  family: "#8b5cf6",
  sofia: "#ec4899",
  maisarah: "#14b8a6",
  shiela: "#f97316",
};

const RELATION_COLORS: Record<string, string> = {
  mentions: "#334155",
  belongs_to: "#1e3a5f",
  next_chunk: "#1e3a3a",
  in_folder: "#3a1e3a",
  links_to: "#3a3a1e",
  unknown: "#2a2a2a",
};

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [workspace, setWorkspace] = useState<string>("");
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const alphaRef = useRef(1.0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const layoutRef = useRef<LayoutNode[]>([]);
  const animRef = useRef<number>(0);

  // Load graph data with workspace filter
  useEffect(() => {
    setLoading(true);
    const url = workspace ? `/api/graph?workspace=${workspace}` : "/api/graph";
    fetch(url)
      .then((r) => r.json())
      .then((data: GraphData & { workspaces?: string[] }) => {
        setGraph(data);
        if (data.workspaces) setWorkspaces(data.workspaces);
        // Initialize positions randomly
        const nodes: LayoutNode[] = data.nodes.map((n) => ({
          ...n,
          x: (Math.random() - 0.5) * 800,
          y: (Math.random() - 0.5) * 600,
          vx: 0,
          vy: 0,
        }));
        layoutRef.current = nodes;
        alphaRef.current = 1.0;
        setLayoutNodes(nodes);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load graph:", e);
        setLoading(false);
      });
  }, [workspace]);

  // Force-directed layout with cooling — self-contained animation loop
  useEffect(() => {
    if (!graph || layoutRef.current.length === 0) return;

    let alpha = 1.0;
    const g = graph;
    const nodes = layoutRef.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const repulsion = 8000;
    const attraction = 0.008;
    const damping = 0.85;

    function tick() {
      alpha *= 0.993;
      if (alpha < 0.001) {
        setLayoutNodes([...nodes]);
        return;
      }

      // Repulsion between sampled node pairs
      const sampleSize = Math.min(nodes.length, 300);
      for (let i = 0; i < sampleSize; i++) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        if (a.id === b.id) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        const force = (repulsion / distSq) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Attraction along edges
      for (const edge of g.edges) {
        const a = nodeMap.get(edge.from);
        const b = nodeMap.get(edge.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        a.vx += dx * attraction * alpha;
        a.vy += dy * attraction * alpha;
        b.vx -= dx * attraction * alpha;
        b.vy -= dy * attraction * alpha;
      }

      // Center gravity + apply velocity + damp
      for (const n of nodes) {
        n.vx -= n.x * 0.0005 * alpha;
        n.vy -= n.y * 0.0005 * alpha;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
      }

      // Update state periodically (not every frame for perf)
      if (Math.floor(alpha * 100) % 3 === 0) {
        setLayoutNodes([...nodes]);
      }

      animRef.current = requestAnimationFrame(tick);
    }

    alphaRef.current = 1.0;
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [graph]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layoutNodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);

    const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

    // Draw edges
    ctx.globalAlpha = 0.3;
    const maxEdges = Math.min(graph?.edges.length || 0, 2000);
    for (let i = 0; i < maxEdges; i++) {
      const edge = graph!.edges[i];
      const a = nodeMap.get(edge.from);
      const b = nodeMap.get(edge.to);
      if (!a || !b) continue;
      // Skip if both nodes are filtered out
      if (filter && a.type !== filter && b.type !== filter) continue;
      ctx.strokeStyle = RELATION_COLORS[edge.relation] || "#2a2a2a";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw nodes
    ctx.globalAlpha = 1;
    for (const node of layoutNodes) {
      if (filter && node.type !== filter) continue;
      // Use workspace color when viewing all, type color when filtered
      const color = workspace 
        ? (TYPE_COLORS[node.type] || "#64748b")
        : (WORKSPACE_COLORS[(node as unknown as Record<string, string>).workspace] || TYPE_COLORS[node.type] || "#64748b");
      const isHovered = hoveredNode === node.id;
      const isSelected = selectedNode === node.id;
      const r = node.type === "doc" ? 6 : node.type === "entity" ? 5 : node.type === "folder" ? 7 : 2.5;

      ctx.fillStyle = color;
      ctx.globalAlpha = isHovered || isSelected ? 1 : 0.8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, isHovered ? r * 1.5 : r, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label for larger nodes
      if ((node.type === "doc" || node.type === "folder" || node.type === "entity") && zoom > 0.5) {
        ctx.fillStyle = "#e2e8f0";
        ctx.globalAlpha = isHovered || isSelected ? 1 : 0.6;
        ctx.font = `${node.type === "doc" ? 10 : 8}px system-ui`;
        ctx.fillText(node.label.slice(0, 25), node.x + r + 3, node.y + 3);
      }
    }

    ctx.restore();
  }, [layoutNodes, zoom, pan, filter, hoveredNode, selectedNode, graph]);

  // Mouse interaction
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - canvas.width / 2 - pan.x) / zoom;
      const my = (e.clientY - rect.top - canvas.height / 2 - pan.y) / zoom;

      if (isDragging) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
        return;
      }

      // Find nearest node
      let nearest: string | null = null;
      let minDist = 20;
      for (const n of layoutNodes) {
        if (filter && n.type !== filter) continue;
        const dx = n.x - mx;
        const dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = n.id;
        }
      }
      setHoveredNode(nearest);
    },
    [layoutNodes, zoom, pan, filter, isDragging, dragStart]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // If barely moved, treat as click → select
  };

  const handleClick = () => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode === selectedNode ? null : hoveredNode);
    } else {
      setSelectedNode(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.1, Math.min(5, z * (1 - e.deltaY * 0.001))));
  };

  const selected = selectedNode
    ? layoutNodes.find((n) => n.id === selectedNode)
    : null;

  const stats = graph
    ? {
        total: graph.nodes.length,
        byType: graph.nodes.reduce(
          (acc, n) => {
            acc[n.type] = (acc[n.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        edges: graph.edges.length,
      }
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl lg:text-2xl font-bold">Knowledge Graph</h1>
      <p className="text-sm text-muted">
        Force-directed visualization of Vectorizer&apos;s GRAPH.json — {stats?.total || 0} nodes, {stats?.edges || 0} edges
      </p>

      <div className="flex items-center gap-4">
        <label className="text-sm text-muted">Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-surface border border-border rounded px-2 py-1 text-sm"
        >
          <option value="">All types</option>
          <option value="doc">Documents</option>
          <option value="chunk">Chunks</option>
          <option value="entity">Entities</option>
          <option value="folder">Folders</option>
        </select>

        <div className="flex items-center gap-2 ml-4">
          <label className="text-sm text-muted">Workspace:</label>
          <div className="flex gap-1">
            <button
              onClick={() => setWorkspace("")}
              className={`px-2 py-1 text-xs rounded ${!workspace ? "bg-primary text-white" : "bg-surface border border-border text-muted hover:text-white"}`}
            >
              All
            </button>
            {workspaces.map((ws) => (
              <button
                key={ws}
                onClick={() => setWorkspace(ws)}
                className={`px-2 py-1 text-xs rounded capitalize ${workspace === ws ? "bg-primary text-white" : "bg-surface border border-border text-muted hover:text-white"}`}
              >
                {ws}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 ml-4">
          {!workspace ? (
            // Show workspace colors when viewing all
            Object.entries(WORKSPACE_COLORS).map(([ws, color]) => (
              <div key={ws} className="flex items-center gap-1 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted capitalize">{ws}</span>
              </div>
            ))
          ) : (
            // Show type colors when filtered to workspace
            Object.entries(TYPE_COLORS).filter(([k]) => k !== "unknown").map(([type, color]) => (
              <div key={type} className="flex items-center gap-1 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted capitalize">{type}</span>
                <span className="text-muted/50">({stats?.byType?.[type] || 0})</span>
              </div>
            ))
          )}
        </div>

        <span className="text-xs text-muted ml-auto">
          Zoom: {(zoom * 100).toFixed(0)}%
        </span>
      </div>

      {loading ? (
        <div className="h-[600px] bg-surface border border-border rounded-lg animate-pulse" />
      ) : !graph ? (
        <div className="h-[600px] bg-surface border border-border rounded-lg flex items-center justify-center text-muted">
          Failed to load graph data. Ensure GRAPH.json is accessible.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden relative">
          <canvas
            ref={canvasRef}
            width={1200}
            height={600}
            className="w-full cursor-grab active:cursor-grabbing"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
            onWheel={handleWheel}
          />

          {/* Node detail panel */}
          {selected && (
            <div className="absolute top-4 right-4 bg-background/95 border border-border rounded-lg p-4 w-64 text-sm backdrop-blur">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[selected.type] }}
                />
                <span className="font-semibold">{selected.label}</span>
              </div>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted">Type</dt>
                  <dd className="capitalize">{selected.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">ID</dt>
                  <dd className="font-mono truncate max-w-[150px]">{selected.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Position</dt>
                  <dd className="font-mono">{selected.x.toFixed(0)}, {selected.y.toFixed(0)}</dd>
                </div>
              </dl>
              <button
                onClick={() => setSelectedNode(null)}
                className="mt-2 text-xs text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
