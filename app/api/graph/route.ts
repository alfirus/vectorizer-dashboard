import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

const GRAPH_PATH = "C:/Users/alfir/SynologyDrive/ai/maisarah/vault/00-index/GRAPH.json";

// Workspace detection from node source paths
function detectWorkspace(node: Record<string, unknown>): string {
  const rel = (node.rel as string) || "";
  const id = (node.id as string) || "";
  
  if (rel.startsWith("_shared/") || id.startsWith("_shared/")) return "family";
  if (rel.startsWith("maisarah/") || id.startsWith("maisarah/")) return "maisarah";
  if (rel.startsWith("sofia/") || id.startsWith("sofia/")) return "sofia";
  
  // Check for workspace_id in node metadata
  if (node.workspace_id) return String(node.workspace_id);
  
  return "family"; // default
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
        workspaces: ["family", "sofia", "maisarah"],
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
