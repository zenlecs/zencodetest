import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface AppTileProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  href: string;
  stats?: { label: string; value: string | number }[];
  color?: string;
  size?: "small" | "medium" | "large";
  "data-testid"?: string;
}

const sizeClasses = {
  small: "p-4",
  medium: "p-5 md:col-span-2",
  large: "p-6 md:col-span-2 md:row-span-2",
};

export function AppTile({
  title,
  description,
  icon,
  href,
  stats,
  color = "bg-primary",
  size = "small",
  "data-testid": testId,
}: AppTileProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    setLocation(href);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative rounded-xl border border-slate-200/50 dark:border-white/5 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c] shadow-lg cursor-pointer transition-all duration-300 flex flex-col gap-3 h-full overflow-hidden",
        sizeClasses[size]
      )}
      data-testid={testId}
    >
            <div className="flex items-start justify-between relative z-10">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            color
          )}
        >
          <span className="text-white">{icon}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end gap-1 relative z-10">
        <h3 className="font-semibold text-base">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border relative z-10">
          {stats.map((stat) => {
            const isPrice = typeof stat.value === 'string' && (stat.value.includes('₺') || stat.value.includes('$') || stat.value.includes('€'));
            return (
              <div key={stat.label} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <span className={`text-sm ${isPrice ? 'font-price' : 'font-semibold'}`}>{stat.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
