import { Settings, HelpCircle, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export function Footer() {
  const [location, setLocation] = useLocation();

  return (
    <footer className="h-8 border-t border-border/50 bg-background/80 backdrop-blur-sm flex items-center justify-between pl-0 pr-4 text-[10px] text-muted-foreground sticky bottom-0 z-30">
      <div className="flex items-center">
        <button
          onClick={() => setLocation("/os/settings")}
          className={cn(
            "w-8 h-8 flex items-center justify-center transition-colors",
            location === "/os/settings" 
              ? "text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
          data-testid="nav-ayarlar"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={() => setLocation("/os/help")}
          className={cn(
            "w-8 h-8 flex items-center justify-center transition-colors",
            location === "/os/help" 
              ? "text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
          data-testid="nav-yardım"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          <span>Son güncelleme: Şimdi</span>
        </div>
        <span className="text-muted-foreground/60">ZenOS v1.0.0</span>
      </div>
    </footer>
  );
}
