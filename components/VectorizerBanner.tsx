"use client";

import { TriangleAlert } from "lucide-react";
import { VectorizerError, vectorizerStatusMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Friendly banner for vectorizer/proxy failures. Never renders raw stacks. */
export function VectorizerBanner({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const message =
    error instanceof VectorizerError
      ? vectorizerStatusMessage(error.status)
      : error instanceof Error
        ? "Vectorizer unreachable"
        : "Vectorizer unreachable";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm",
        className
      )}
    >
      <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-danger" />
      <div>
        <div className="font-semibold text-danger">{message}</div>
        <div className="text-xs text-muted mt-0.5">
          The page stays usable — retry once the backend is back.
        </div>
      </div>
    </div>
  );
}
