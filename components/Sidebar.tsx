"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: "🗂️" },
  { href: "/dashboard/vault", label: "Vault", icon: "📁" },
  { href: "/dashboard/search", label: "Search", icon: "🔍" },
  { href: "/dashboard/rag", label: "RAG Q&A", icon: "💬" },
  { href: "/dashboard/embeddings", label: "Embeddings", icon: "🧬" },
  { href: "/dashboard/graph", label: "Graph", icon: "🕸️" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-surface-hover active:bg-surface-hover"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-primary">Vectorizer</span>
        </div>
        <span className="text-xs text-muted font-mono">100.121.188.113</span>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 bg-surface border-r border-border flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold text-primary">Vectorizer</h1>
          <p className="text-xs text-muted mt-0.5">Semantic Memory</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
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
        <div className="p-3 border-t border-border text-xs text-muted font-mono">
          100.121.188.113:8091
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="w-64 bg-surface border-l border-border flex flex-col animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-bold text-primary">Vectorizer</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md hover:bg-surface-hover"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
              {nav.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-md text-sm",
                      active
                        ? "bg-primary/15 text-primary-hover"
                        : "text-muted active:bg-surface-hover"
                    )}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-border text-xs text-muted font-mono">
              100.121.188.113:8091
            </div>
          </div>
        </div>
      )}
    </>
  );
}
