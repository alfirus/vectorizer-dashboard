"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FolderKanban, Database, Search, MessageCircle,
  Boxes, Share2, BarChart3, Menu, X, Zap
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: FolderKanban },
  { href: "/dashboard/vault", label: "Vault", icon: Database },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/rag", label: "RAG", icon: MessageCircle },
  { href: "/dashboard/embeddings", label: "Embeddings", icon: Boxes },
  { href: "/dashboard/graph", label: "Graph", icon: Share2 },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
];

function Brand({ sm = false }: { sm?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("rounded-xl bg-primary flex items-center justify-center shrink-0", sm ? "w-7 h-7" : "w-8 h-8")}>
        <Zap className={cn("text-white", sm ? "w-3.5 h-3.5" : "w-[18px] h-[18px]")} />
      </div>
      <div className="leading-none">
        <div className={cn("font-bold tracking-tight", sm ? "text-sm" : "text-[15px]")}>Vectorizer</div>
        {!sm && <div className="text-[11px] text-muted tracking-wide">SEMANTIC MEMORY</div>}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-[56px] bg-card/80 backdrop-blur-xl border-b border-border">
        <Brand sm />
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Open menu"
        >
          <Menu className="w-[18px] h-[18px] text-muted-2" />
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[240px] shrink-0 bg-card border-r border-border flex-col sticky top-0 h-screen">
        <div className="px-4 pt-5 pb-4 border-b border-border">
          <Brand />
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-muted">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            100.121.188.113:8091
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const isActive = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-white shadow-glow"
                    : "text-muted hover:text-foreground hover:bg-surface"
                )}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="rounded-xl bg-surface border border-border p-3">
            <div className="text-xs font-semibold">68 files · 1201 chunks</div>
            <div className="text-[11px] text-muted mt-0.5">Vault indexed</div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-xl border-t border-border flex justify-around px-1 py-1.5 safe-bottom">
        {nav.slice(0, 5).map((item) => {
          const isActive = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-medium min-w-[56px]",
                isActive ? "text-primary" : "text-muted"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-medium text-muted min-w-[56px]"
        >
          <Menu className="w-5 h-5" />
          <span className="leading-none">More</span>
        </button>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[50] flex justify-end">
          <button className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="w-[300px] bg-card border-l border-border flex flex-col animate-slideIn">
            <div className="flex items-center justify-between px-4 h-[56px] border-b border-border shrink-0">
              <Brand sm />
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {nav.map((item) => {
                const isActive = active(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium",
                      isActive ? "bg-primary text-white" : "text-muted active:bg-surface"
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-border text-xs space-y-2">
              <div className="font-mono text-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success" /> 100.121.188.113:8091
              </div>
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3">
                <div className="text-xs font-semibold text-primary">Vault · 68 files</div>
                <div className="text-[11px] text-muted">1201 chunks · 1419 nodes</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
