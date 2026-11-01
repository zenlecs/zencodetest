import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  className?: string;
  "data-testid"?: string;
}

export function StatTile({
  label,
  value,
  icon,
  trend,
  className,
  "data-testid": testId,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-4 rounded-xl bg-muted/30",
        className
      )}
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-price tracking-tight">{value}</span>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium pb-0.5",
              trend.direction === "up" ? "text-status-online" : "text-destructive"
            )}
          >
            {trend.direction === "up" ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend.value}%
          </span>
        )}
      </div>
    </div>
  );
}
