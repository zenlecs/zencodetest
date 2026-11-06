import { useEffect, useRef } from "react";
import { readIslandBloom, subscribeIslandBloom } from "@/lib/island-bloom";

export function LiquidStroke({ radius = 16 }: { radius?: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const blueRef = useRef<HTMLDivElement>(null);
  const redRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const paint = () => {
      const root = rootRef.current;
      const blue = blueRef.current;
      const red = redRef.current;
      if (!root || !blue || !red) return;
      const rect = root.getBoundingClientRect();
      const bloom = readIslandBloom();
      const at = `${bloom.x - window.screenX - rect.left}px ${bloom.y - window.screenY - rect.top}px`;
      blue.style.opacity = bloom.blue > 0.01 ? String(bloom.blue) : "0";
      red.style.opacity = bloom.red > 0.01 ? String(bloom.red) : "0";
      blue.style.background = bloom.blue > 0.01
        ? `radial-gradient(820px 300px at ${at}, rgba(37,99,235,0.9) 0%, rgba(56,189,248,0.42) 46%, transparent 78%)`
        : "none";
      red.style.background = bloom.red > 0.01
        ? `radial-gradient(680px 260px at ${at}, rgba(220,38,38,0.9) 0%, rgba(249,115,22,0.4) 46%, transparent 78%)`
        : "none";
    };
    paint();
    const unsubscribe = subscribeIslandBloom(paint);
    window.addEventListener("scroll", paint, true);
    window.addEventListener("resize", paint);
    return () => {
      unsubscribe();
      window.removeEventListener("scroll", paint, true);
      window.removeEventListener("resize", paint);
    };
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-[-1px] z-20 overflow-hidden" style={{ borderRadius: radius }}>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: radius,
          padding: 2,
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
        }}
      >
        <div className="absolute inset-0 bg-black/5 backdrop-blur-xl dark:bg-white/10" style={{ borderRadius: radius }} />
        <div ref={blueRef} className="absolute inset-0 mix-blend-screen" style={{ opacity: 0 }} />
        <div ref={redRef} className="absolute inset-0 mix-blend-screen" style={{ opacity: 0 }} />
      </div>
    </div>
  );
}
