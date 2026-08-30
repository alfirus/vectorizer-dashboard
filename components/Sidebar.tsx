"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: "🗂️" },
  { href: "/dashboard/search", label: "Search", icon: "🔍" },
  { href: "/dashboard/rag", label: "RAG Q&A", icon: "💬" },
  { href: "/dashboard/embeddings", label: "Embeddings", icon: "🧬" },
  { href: "/dashboard/graph", label: "Graph", icon: "🕸️" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-primary">Vectorizer</h1>
        <p className="text-xs text-muted mt-0.5">Semantic Memory Dashboard</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {nav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary/15 text-primary-hover"
                  : "text-muted hover:text-foreground hover:bg-surface-hover"
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border text-xs text-muted">
        localhost:8091
      </div>
    </aside>
  );
}
