import { cn } from "@/lib/utils";

/** spin1. Geometry, color, and timing are fixed. */
export function Spin1({ className }: { className?: string }) {
  return (
    <div className={cn("h-5 w-5 animate-spin [animation-duration:0.8s]", className)} aria-hidden>
      <svg viewBox="0 0 20 20" className="h-full w-full">
        <circle
          cx="10"
          cy="10"
          r="7.25"
          fill="none"
          stroke="#c8c8d0"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeDasharray="11 35"
        />
      </svg>
    </div>
  );
}
