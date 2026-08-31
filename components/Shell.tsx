"use client";
import { Sidebar } from "./Sidebar";
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto pb-[72px] lg:pb-0">
        <div className="max-w-[1200px] mx-auto p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
