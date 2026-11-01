import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_INTENSITY = 0.42;
const DEFAULT_BLUR_PX = 36;
const DEFAULT_SAMPLE_RATE_FPS = 14;
const DEFAULT_SCALE = 1.22;
const DEFAULT_SATURATION = 1.9;
const DEFAULT_GAIN = 1.6;
const GLOW_BRIGHTNESS = 1.15;
const BLOOM_BRIGHTNESS = 1.22;
const DEFAULT_ROUNDED_PX = 28;

/**
 * Tiny canvas sample size. The glow is an ambient light field, not an image.
 * For portrait 9:16 videos, we sample 14 wide by 24 high to match vertical aspect ratio.
 */
const SAMPLE_WIDTH_PORTRAIT = 14;
const SAMPLE_HEIGHT_PORTRAIT = 24;

const SAMPLE_WIDTH_LANDSCAPE = 24;
const SAMPLE_HEIGHT_LANDSCAPE = 14;

/** Outer bloom factor: wider spread, softer blur, boosted saturation */
const BLOOM_SCALE_FACTOR = 1.55;
const BLOOM_BLUR_FACTOR = 1.95;
const BLOOM_SATURATION_FACTOR = 1.2;
const BLOOM_OPACITY_FACTOR = 0.55;

const MS_PER_SECOND = 1000;
const MIN_SAMPLE_RATE = 1;
const MAX_SAMPLE_RATE = 60;
const GLOW_FADE_MS = 450;
const HAVE_CURRENT_DATA = 2;

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type VideoAmbientProps = {
  src: string;
  alt?: string;
  autoPlay?: boolean;
  blur?: number;
  className?: string;
  controls?: boolean;
  gain?: number;
  glow?: boolean;
  intensity?: number;
  loop?: boolean;
  muted?: boolean;
  poster?: string;
  rounded?: number;
  sampleRate?: number;
  saturation?: number;
  scale?: number;
  /** Aspect ratio of video container: '9:16' for vertical, '16:9' for horizontal */
  aspectRatio?: "9:16" | "16:9" | "auto";
  /** Whether to render the standard hardware-inspired glass bevel overlay */
  showOverlay?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function VideoAmbient({
  src,
  alt = "Video player with ambient light",
  autoPlay = true,
  blur = DEFAULT_BLUR_PX,
  className,
  controls = false,
  gain = DEFAULT_GAIN,
  glow = true,
  intensity = DEFAULT_INTENSITY,
  loop = true,
  muted = true,
  poster,
  rounded = DEFAULT_ROUNDED_PX,
  sampleRate = DEFAULT_SAMPLE_RATE_FPS,
  saturation = DEFAULT_SATURATION,
  scale = DEFAULT_SCALE,
  aspectRatio = "9:16",
  showOverlay = true,
}: VideoAmbientProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const innerCanvasRef = useRef<HTMLCanvasElement>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement>(null);
  const hasFrameRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isOnScreen, setIsOnScreen] = useState(true);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);

  const isPortrait = aspectRatio === "9:16";
  const sampleW = isPortrait ? SAMPLE_WIDTH_PORTRAIT : SAMPLE_WIDTH_LANDSCAPE;
  const sampleH = isPortrait ? SAMPLE_HEIGHT_PORTRAIT : SAMPLE_HEIGHT_LANDSCAPE;

  const effectiveAutoPlay = autoPlay && !shouldReduceMotion;
  const showSampledGlow = glow && hasFrame && !isBlocked;

  const sampleFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < HAVE_CURRENT_DATA) {
      return;
    }
    const extraGain = Math.max(0, gain - 1);
    const canvases = [innerCanvasRef.current, bloomCanvasRef.current];

    for (const canvas of canvases) {
      const ctx = canvas?.getContext("2d", { willReadFrequently: false });
      if (!(canvas && ctx)) continue;

      try {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (extraGain > 0) {
          // 'lighter' composite emits luminous light rather than applying flat paint
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = extraGain;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
      } catch {
        setIsBlocked(true);
        return;
      }
    }

    if (!hasFrameRef.current) {
      hasFrameRef.current = true;
      setHasFrame(true);
    }
  }, [gain]);

  // Sync playback status from video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => setIsPlaying(!(video.paused || video.ended));
    sync();

    const events = ["play", "playing", "pause", "ended", "loadeddata"];
    for (const event of events) {
      video.addEventListener(event, sync);
    }
    return () => {
      for (const event of events) {
        video.removeEventListener(event, sync);
      }
    };
  }, []);

  // Ensure autoplay triggers properly even in restrictive browser environments
  useEffect(() => {
    const video = videoRef.current;
    if (!(video && effectiveAutoPlay)) return;

    const attempt = () => {
      video.play().catch(() => {});
    };

    if (video.readyState >= HAVE_CURRENT_DATA) {
      attempt();
      return;
    }

    video.addEventListener("loadeddata", attempt, { once: true });
    return () => video.removeEventListener("loadeddata", attempt);
  }, [effectiveAutoPlay]);

  // Viewport intersection observer: pause sampling when off-screen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(([entry]) =>
      setIsOnScreen(entry.isIntersecting)
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Document visibility listener: pause sampling when tab is hidden
  useEffect(() => {
    const handleVisibility = () => setIsTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Sample once if reduced-motion is requested
  useEffect(() => {
    if (!(glow && shouldReduceMotion)) return;
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState >= HAVE_CURRENT_DATA) {
      sampleFrame();
      return;
    }
    video.addEventListener("loadeddata", sampleFrame, { once: true });
    return () => video.removeEventListener("loadeddata", sampleFrame);
  }, [glow, sampleFrame, shouldReduceMotion]);

  // Main sampling loop: driven by requestAnimationFrame and throttled to sampleRate
  useEffect(() => {
    const isWorthSampling =
      glow &&
      !(isBlocked || shouldReduceMotion) &&
      isPlaying &&
      isOnScreen &&
      isTabVisible;

    if (!isWorthSampling) return;

    const minDelta =
      MS_PER_SECOND /
      Math.min(MAX_SAMPLE_RATE, Math.max(MIN_SAMPLE_RATE, sampleRate));

    let frameId = 0;
    let lastSampleAt = 0;

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (now - lastSampleAt < minDelta) return;
      lastSampleAt = now;
      sampleFrame();
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    glow,
    isBlocked,
    isOnScreen,
    isPlaying,
    isTabVisible,
    sampleFrame,
    sampleRate,
    shouldReduceMotion,
  ]);

  const glowTransition = `opacity ${GLOW_FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s ease-out`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      className={cn("relative select-none", className)}
      ref={containerRef}
    >
      {/* Dynamic Ambient Glow Backing Layer */}
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 will-change-transform"
        >
          {/* Pass 1: Outer Bloom - Wide, deeply saturated, soft dispersion */}
          <canvas
            className="absolute inset-0 size-full"
            height={sampleH}
            ref={bloomCanvasRef}
            style={{
              filter: `blur(${blur * BLOOM_BLUR_FACTOR}px) saturate(${saturation * BLOOM_SATURATION_FACTOR}) brightness(${BLOOM_BRIGHTNESS})`,
              opacity: showSampledGlow ? intensity * BLOOM_OPACITY_FACTOR : 0,
              transform: `scale(${scale * BLOOM_SCALE_FACTOR})`,
              transition: glowTransition,
              borderRadius: rounded * 1.5,
            }}
            width={sampleW}
          />

          {/* Pass 2: Inner Glow - Closer hugging, vibrant high-energy field */}
          <canvas
            className="absolute inset-0 size-full"
            height={sampleH}
            ref={innerCanvasRef}
            style={{
              filter: `blur(${blur}px) saturate(${saturation}) brightness(${GLOW_BRIGHTNESS})`,
              opacity: showSampledGlow ? intensity : 0,
              transform: `scale(${scale})`,
              transition: glowTransition,
              borderRadius: rounded,
            }}
            width={sampleW}
          />
        </div>
      ) : null}

      {/* Hardware-styled Outer Frame Container */}
      <div
        className="relative z-10 p-[2px] bg-gradient-to-b from-black/[0.12] to-black/[0.04] dark:from-white/25 dark:to-white/5 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.18),0_6px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
        style={{ borderRadius: rounded + 2 }}
      >
        {/* Inner Video Viewport with Clipping */}
        <div
          className="relative w-full h-full overflow-hidden bg-black/95"
          style={{ borderRadius: rounded }}
        >
          <video
            aria-label={alt}
            autoPlay={effectiveAutoPlay}
            className="relative z-10 block size-full object-cover select-none pointer-events-none"
            controls={controls}
            loop={loop}
            muted={muted}
            playsInline
            poster={poster}
            ref={videoRef}
            src={src}
          />

          {/* Standard Rounded Glass / Bezel Overlay */}
          {showOverlay ? (
            <div
              className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-black/15 dark:ring-white/20 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.35)]"
              style={{ borderRadius: rounded }}
            />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export default VideoAmbient;
