import React, {
  CSSProperties,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createDisplacementMap } from "./liquidGlass";

type DivProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children">;

export interface LiquidGlassWindowProps extends DivProps {
  children: ReactNode;
  /** Corner radius in px. */
  radius?: number;
  /** Backdrop frost in px. */
  blur?: number;
  /** Strength of the rim lensing, in px of displacement. */
  refraction?: number;
  /** Width of the refractive rim, in px. */
  bezel?: number;
  /** Ambient tint that bleeds into the glass, usually the node colour. */
  ambient?: string;
  /** Extra classes for the window shell. */
  className?: string;
  /** Styles for the window shell. */
  style?: CSSProperties;
}

/**
 * A Liquid Glass surface: frosted backdrop, edge refraction, dispersion at the
 * rim and a microscopic grain layer. Intended for Chromium/Electron;
 * Safari/Firefox keep the frosted fallback.
 */
export function LiquidGlassWindow({
  children,
  radius = 20,
  blur = 34,
  refraction = 18,
  bezel = 36,
  ambient = "#2997ff",
  className = "",
  style,
  ...rest
}: LiquidGlassWindowProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [canRefract, setCanRefract] = useState(false);

  const rawId = useId();
  const filterId = useMemo(
    () => `liquid-glass-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawId],
  );

  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.supports) return;
    setCanRefract(
      CSS.supports("backdrop-filter", "url(#liquid-glass)") ||
        CSS.supports("-webkit-backdrop-filter", "url(#liquid-glass)"),
    );
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const width = Math.round(host.offsetWidth);
      const height = Math.round(host.offsetHeight);
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const displacementMap = useMemo(() => {
    if (!canRefract || size.width === 0 || size.height === 0) return null;
    return createDisplacementMap(size.width, size.height, {
      radius,
      bezel,
      strength: 1,
    });
  }, [canRefract, size.width, size.height, radius, bezel]);

  return (
    <div
      {...rest}
      ref={hostRef}
      className={`liquid-window ${className}`}
      style={
        {
          "--liquid-radius": `${radius}px`,
          "--liquid-blur": `${blur}px`,
          "--liquid-ambient": ambient,
          ...style,
        } as CSSProperties
      }
    >
      <div className="liquid-frost" aria-hidden="true" />
      {displacementMap && (
        <div
          className="liquid-refraction"
          aria-hidden="true"
          style={{
            backdropFilter: `url(#${filterId})`,
            WebkitBackdropFilter: `url(#${filterId})`,
          }}
        />
      )}
      <div className="liquid-tint" aria-hidden="true" />
      <div className="liquid-grain" aria-hidden="true" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {children}
      </div>

      {displacementMap && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          className="pointer-events-none absolute"
          style={{ position: "absolute" }}
        >
          <defs>
            <filter
              id={filterId}
              filterUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={size.width}
              height={size.height}
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={displacementMap}
                x="0"
                y="0"
                width={size.width}
                height={size.height}
                preserveAspectRatio="none"
                result="liquid-map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="liquid-map"
                scale={refraction}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}
    </div>
  );
}
