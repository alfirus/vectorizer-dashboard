// Vectorizer API types

export interface HealthResponse {
  chromadb: string;
  embedding_model: string;
  llm_enabled: boolean;
  name: string;
  status: string;
  version: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export interface WorkspaceStats {
  workspace_id: string;
  document_count: number;
}

export interface Message {
  id?: string;
  workspace_id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface SearchResult {
  id: string;
  score: number;
  distance?: number;
  document: string;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  count: number;
  results: SearchResult[] | null;
}

export interface BrainResponse {
  answer: string;
  sources?: { content: string; score: number }[];
}

// ChromaDB types

export interface ChromaCollection {
  id: string;
  name: string;
  metadata: Record<string, unknown> | null;
  dimension: number | null;
  tenant: string;
  database: string;
  document_count?: number;
  log_position?: number;
  version?: number;
}

export interface ChromaGetResponse {
  ids: string[];
  documents: string[];
  embeddings: number[][];
  metadatas: Record<string, unknown>[];
}
