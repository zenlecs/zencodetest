import { useEffect, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

/** The camera arrival: a near-critical spring, so the mark lands with weight instead of easing in. */
const ZOOM_SPRING = { type: "spring" as const, stiffness: 18, damping: 7.8, mass: 1.2 };
/** The final settle, in place. */
const REST_SPRING = { type: "spring" as const, stiffness: 84, damping: 15, mass: 0.95 };
const EASE = [0.22, 1, 0.36, 1] as const;

/** Hands off to the launcher just before the mark finishes settling into its resting size. */
const INTRO_DURATION_MS = 2000;
const INTRO_DURATION_REDUCED_MS = 520;

/** Resting size after the zoom lands. */
const REST_SCALE = 0.7;

/** One full trip through both tones. Short enough that the wave completes before the intro ends. */
const COLOR_CYCLE_S = 1.8;

interface PrecisionIntroProps {
  isDark: boolean;
  onComplete: () => void;
}

interface Palette {
  /** Must equal the system surface, so the intro never reads as a separate screen. */
  bg: string;
  /** The two tones the paths travel between; the wave runs through them in path order. */
  shades: [string, string];
  text: string;
  glow: string;
}

const PALETTE: Record<"dark" | "light", Palette> = {
  dark: {
    bg: "#202228",
    shades: ["#2f323b", "#202228"],
    text: "#8a909c",
    glow: "rgba(168,180,199,0.10)",
  },
  light: {
    bg: "#fafafa",
    shades: ["#b4bac2", "#e2e4e8"],
    text: "#7f858e",
    glow: "rgba(120,128,140,0.10)",
  },
};

/** Frame 13/14 geometry. Each path carries its own draw time and place in the color wave. */
const MARK = {
  blade: { d: "M158 42.983H206L113 137.983H63L158 42.983Z", draw: 0.78, wave: 0.6 },
  diagonal: { d: "M193.686 2.532L11.312 184.906", width: 7.16272, draw: 0.16, wave: 0.08 },
  topBar: { d: "M206 39.483H0", width: 7, draw: 0.34, wave: 0.34 },
  bottomBar: { d: "M0 141.483H206", width: 7, draw: 0.46, wave: 0.86 },
};

export function PrecisionIntro({ isDark, onComplete }: PrecisionIntroProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const palette = isDark ? PALETTE.dark : PALETTE.light;
  const [lightShade, deepShade] = palette.shades;

  useEffect(() => {
    const timer = window.setTimeout(
      onComplete,
      reduceMotion ? INTRO_DURATION_REDUCED_MS : INTRO_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [onComplete, reduceMotion]);

  /** Color travel for one path, offset so brightness sweeps through the mark. */
  const wave = (delay: number) =>
    reduceMotion
      ? {}
      : {
          duration: COLOR_CYCLE_S,
          delay,
          ease: "easeInOut" as const,
        };

  const waveTarget = [lightShade, deepShade, lightShade];

  return (
    <motion.div
      data-testid="launcher-intro"
      role="img"
      aria-label="Zenlecs desktop"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.5 }}
      className="absolute inset-0 z-50 isolate overflow-hidden rounded-xl"
      style={{
        backgroundColor: palette.bg,
        WebkitAppRegion: "drag",
      } as CSSProperties}
    >
      {/* Studio light: painted once, only a slow parallax scale. No animated filters. */}
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { scale: 1.14 }}
        animate={{ scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 2.2, ease: EASE }}
        className="absolute inset-0"
        style={{
          background: isDark
            ? `radial-gradient(ellipse 40% 54% at 50% 47%, ${palette.glow}, transparent 100%), radial-gradient(ellipse 72% 64% at 50% 0%, rgba(166,177,194,0.04), transparent 92%)`
            : `radial-gradient(ellipse 40% 54% at 50% 47%, rgba(255,255,255,0.9), transparent 100%), radial-gradient(ellipse 72% 64% at 50% 0%, ${palette.glow}, transparent 92%)`,
        }}
      />

      {/* Depth without animated blur. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 78% 84% at 50% 50%, transparent 40%, rgba(0,0,0,0.34) 100%)"
            : "radial-gradient(ellipse 78% 84% at 50% 50%, transparent 40%, rgba(74,69,58,0.10) 100%)",
        }}
      />

      {/* Registration marks: a desktop instrument, not a splash advert. */}
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 1.2, delay: reduceMotion ? 0 : 0.6, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0"
      >
        <span className={`absolute left-9 top-9 h-[9px] w-px ${isDark ? "bg-white/15" : "bg-slate-900/15"}`} />
        <span className={`absolute left-9 top-9 h-px w-[9px] ${isDark ? "bg-white/15" : "bg-slate-900/15"}`} />
        <span className={`absolute bottom-9 right-9 h-[9px] w-px ${isDark ? "bg-white/10" : "bg-slate-900/10"}`} />
        <span className={`absolute bottom-9 right-9 h-px w-[9px] ${isDark ? "bg-white/10" : "bg-slate-900/10"}`} />
      </motion.div>

      {/* Optical centre: the mark arrives from depth, lands on centre, then settles to rest. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 2.34, y: 22, rotate: -1.2 }}
          animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
          transition={{
            opacity: { duration: reduceMotion ? 0 : 0.34, ease: "easeOut" },
            scale: { ...ZOOM_SPRING, delay: reduceMotion ? 0 : 0.08 },
            y: { ...ZOOM_SPRING, delay: reduceMotion ? 0 : 0.08 },
            rotate: { ...ZOOM_SPRING, delay: reduceMotion ? 0 : 0.08 },
          }}
          className="relative w-[236px] max-w-[56vw] origin-center will-change-transform sm:w-[272px]"
          style={{ aspectRatio: "206 / 188" }}
          aria-hidden="true"
        >
          <motion.div
            initial={reduceMotion ? false : { scale: 1 }}
            animate={{ scale: REST_SCALE }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { ...REST_SPRING, delay: 1.62 }
            }
            className="absolute inset-0 origin-center will-change-transform"
          >
            <svg viewBox="0 0 206 188" fill="none" className="absolute inset-0 h-full w-full" focusable="false">
              {/* Solid tones instead of metal: each path rides the wave on its own beat. */}
              <motion.path
                d={MARK.blade.d}
                fill={lightShade}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, fill: waveTarget }}
                transition={{
                  opacity: { duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : MARK.blade.draw, ease: EASE },
                  fill: wave(MARK.blade.wave),
                }}
              />

              {[MARK.diagonal, MARK.topBar, MARK.bottomBar].map((path) => (
                <motion.path
                  key={path.d}
                  d={path.d}
                  fill="none"
                  stroke={lightShade}
                  strokeWidth={path.width}
                  strokeLinecap="butt"
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={reduceMotion ? { pathLength: 1 } : { pathLength: 1, stroke: waveTarget }}
                  transition={{
                    pathLength: {
                      duration: reduceMotion ? 0 : 0.98,
                      delay: reduceMotion ? 0 : path.draw,
                      ease: EASE,
                    },
                    stroke: wave(path.wave),
                  }}
                />
              ))}
            </svg>

            <span className="absolute bottom-[9%] right-0 block overflow-hidden pb-0.5">
              <motion.span
                initial={reduceMotion ? false : { x: "102%", opacity: 0 }}
                animate={{ x: "0%", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : 1.2, ease: EASE }}
                className="block font-plus-jakarta text-[12px] font-medium leading-none tracking-[0.24em] sm:text-[14px]"
                style={{ color: palette.text }}
              >
                desktop
              </motion.span>
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* Fog bank in the surface colour: dense at the frame edge, clear at the emblem. */}
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : 0.05, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 58% 68% at 50% 47%, ${palette.bg}2e 0%, ${palette.bg}80 44%, ${palette.bg}dd 76%, ${palette.bg} 100%)`,
        }}
      />
    </motion.div>
  );
}
