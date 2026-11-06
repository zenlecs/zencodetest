import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiquidStroke } from "@/components/ui/liquid-stroke";

interface BentoCardProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  span?: "1" | "2" | "3" | "4" | "row-2" | "col-2" | "full";
  interactive?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}

const spanClasses = {
  "1": "",
  "2": "md:col-span-2",
  "3": "md:col-span-3",
  "4": "md:col-span-4",
  "row-2": "md:row-span-2",
  "col-2": "md:col-span-2",
  "full": "md:col-span-full",
};

export function BentoCard({
  title,
  icon,
  children,
  className,
  span = "1",
  interactive = false,
  onClick,
  "data-testid": testId,
}: BentoCardProps) {
  return (
    <div className={cn("relative", spanClasses[span], className)} onClick={onClick} data-testid={testId}>
      <LiquidStroke radius={12} />
      <Card
        className={cn(
          "h-full rounded-xl border border-slate-200/50 dark:border-white/5 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c] overflow-hidden transition-all duration-200 shadow-lg",
          interactive && "cursor-pointer hover-elevate active-elevate-2"
        )}
      >
      {title && (
        <CardHeader className="px-4 py-3 flex flex-row items-center gap-2 space-y-0 bg-slate-200/50 dark:bg-black/20 border-b border-slate-300/50 dark:border-white/10">
          {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
          <CardTitle className="text-sm font-semibold text-slate-800 dark:text-white/90 leading-none">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn("p-4", !title && "pt-6")}>{children}</CardContent>
      </Card>
    </div>
  );
}
