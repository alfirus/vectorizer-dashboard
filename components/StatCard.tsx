import { cn } from "@/lib/utils";
interface StatCardProps { label: string; value: string | number; icon: string; accent?: string; sub?: string; }
export function StatCard({ label, value, icon, accent, sub }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted">{label}</span>
        <span className="w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center text-sm">{icon}</span>
      </div>
      <p className={cn("text-2xl font-bold tracking-tight", accent || "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}
