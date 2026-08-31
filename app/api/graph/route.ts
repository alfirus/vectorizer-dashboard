import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

const GRAPH_PATH = process.env.GRAPH_PATH || "/data/ai/maisarah/vault/00-index/GRAPH.json";

// Workspace detection from node source paths — prefer workspace_id, else path prefix
function detectWorkspace(node: Record<string, unknown>): string {
  if (node.workspace_id) return String(node.workspace_id);
  const rel = (node.rel as string) || (node.source_path as string) || "";
  const id = (node.id as string) || "";
  const hay = `${rel} ${id}`;
  if (hay.includes("shiela")) return "shiela";
  if (rel.startsWith("maisarah/") || id.startsWith("maisarah/") || hay.includes("maisarah")) return "maisarah";
  if (rel.startsWith("sofia/") || id.startsWith("sofia/") || hay.includes("sofia")) return "sofia";
  if (rel.startsWith("_shared/") || id.startsWith("_shared/")) return "family";
  return "family";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspace = searchParams.get("workspace");
    
    const data = await readFile(GRAPH_PATH, "utf-8");
    const graph = JSON.parse(data);
    
    if (!workspace) {
      // Return full graph with workspace annotations
      const annotatedNodes = graph.nodes.map((n: Record<string, unknown>) => ({
        ...n,
        workspace: detectWorkspace(n),
      }));
      return NextResponse.json({
        ...graph,
        nodes: annotatedNodes,
        workspaces: ["family", "sofia", "maisarah", "shiela"],
      });
    }
    
    // Filter by workspace
    const filteredNodes = graph.nodes.filter((n: Record<string, unknown>) => {
      const ws = detectWorkspace(n);
      return ws === workspace;
    });
    
    const nodeIds = new Set(filteredNodes.map((n: Record<string, unknown>) => n.id));
    
    // Only include edges where both endpoints are in filtered nodes
    const filteredEdges = graph.edges.filter((e: Record<string, unknown>) => {
      return nodeIds.has(e.from) && nodeIds.has(e.to);
    });
    
    return NextResponse.json({
      nodes: filteredNodes.map((n: Record<string, unknown>) => ({ ...n, workspace })),
      edges: filteredEdges,
      workspace,
      total_nodes: filteredNodes.length,
      total_edges: filteredEdges.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
