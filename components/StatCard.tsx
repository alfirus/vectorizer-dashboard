import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
}

export function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-muted text-sm mb-2">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", accent || "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
