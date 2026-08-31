"use client";

import { Sidebar } from "./Sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6 pb-8">{children}</main>
    </div>
  );
}
