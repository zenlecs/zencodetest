import { cn } from "@/lib/utils";

export type Status = "online" | "offline" | "away" | "busy" | "active" | "pending" | "closed" | "archived";

interface StatusBadgeProps {
  status: Status;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const statusConfig: Record<Status, { color: string; label: string }> = {
  online: { color: "bg-status-online", label: "Çevrimiçi" },
  offline: { color: "bg-status-offline", label: "Çevrimdışı" },
  away: { color: "bg-status-away", label: "Uzakta" },
  busy: { color: "bg-status-busy", label: "Meşgul" },
  active: { color: "bg-status-online", label: "Aktif" },
  pending: { color: "bg-status-away", label: "Beklemede" },
  closed: { color: "bg-status-offline", label: "Kapandı" },
  archived: { color: "bg-muted-foreground", label: "Arşivlendi" },
};

export function StatusBadge({
  status,
  showLabel = false,
  size = "md",
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const dotSize = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className={cn("rounded-full", dotSize, config.color)} />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{config.label}</span>
      )}
    </div>
  );
}
