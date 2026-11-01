import { Minus, Maximize, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WindowControlsProps {
  className?: string;
}

/**
 * Standart Electron pencere kontrol butonları (dashboard tasarımı).
 * Tüm pencerelerde (header + launcher) birebir aynı görünüm:
 *  - 32x32 hit alanı, çıplak ikon; hover'da ikon tonu + hafif büyüme
 *  - Renkler tema token'larından (foreground/50 → foreground), kapatmada red-500
 */
export function WindowControls({ className }: WindowControlsProps) {
  const send = (channel: string) => {
    try {
      (window as any).electron?.send(channel);
    } catch {
      // electron yoksa (tarayıcı geliştirmesi) sessizce yut
    }
  };

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      <button
        type="button"
        onClick={() => send("window-min")}
        title="Küçült"
        aria-label="Pencereyi küçült"
        className="w-8 h-8 flex items-center justify-center text-foreground hover:text-foreground group"
      >
        <Minus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => send("window-max")}
        title="Büyüt / Geri Yükle"
        aria-label="Pencereyi büyüt veya geri yükle"
        className="w-8 h-8 flex items-center justify-center text-foreground hover:text-foreground group"
      >
        <Maximize className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => send("window-close")}
        title="Kapat"
        aria-label="Pencereyi kapat"
        className="w-8 h-8 flex items-center justify-center text-foreground hover:text-red-500 group"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
