import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

const GRAPH_PATH = "C:/Users/alfir/SynologyDrive/ai/maisarah/vault/00-index/GRAPH.json";

export async function GET() {
  try {
    const data = await readFile(GRAPH_PATH, "utf-8");
    const graph = JSON.parse(data);
    return NextResponse.json(graph);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
