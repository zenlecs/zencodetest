import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { animate, AnimatePresence, motion, useMotionValue, useSpring, useTransform, useVelocity } from "motion/react";
import { Bell, MessageCircle, Mic, Settings, Sparkles, X } from "lucide-react";
import { StudioContextMenu } from "@/components/studio/StudioContextMenu";
import type { MenuItem } from "@/components/studio/contextMenuModel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { VoiceSession } from "@/components/chat/voice-session";
import { stopVoiceAssistant, toggleVoiceActive, useVoiceActive } from "@/lib/voice-assistant";
import { subscribeVoiceSpectrum, type VoiceSpectrum } from "@/lib/voice-spectrum";
import { subscribeVoiceCue, subscribeVoiceSpeaking } from "@/lib/voice-speaking";
import { readIslandOffset, writeIslandOffset } from "@/lib/dynamic-island";
import { type IslandHost } from "@/lib/island-bridge";
import { applyIslandBloom } from "@/lib/island-bloom";

const SHELL_SPRING = { stiffness: 480, damping: 34, mass: 0.72 };
const DIGIT_SPRING = { type: "spring" as const, stiffness: 500, damping: 36, mass: 0.5 };

const COMPACT_W = 204;
const SEARCH_W = 292;
const NOTICE_W = 228;
const COMPACT_H = 46;
const NOTICE_H = 166;
const SEARCH_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.75 };
const SLOT_BASE = 120;
const SLOT_WIDE = 240;
const SEARCH_CHAR_STEP = 15;
const SEARCH_CHAR_BOX = 30;
const DOCK_IN = 24;
const DOCK_OUT = 72;
const DOCK_GAP = 12;

type Dock = "free" | "left" | "right";

type Mode = "compact" | "search" | "notices";

const ISLAND_SETTINGS: MenuItem = { type: "action", id: "settings", label: "Ayarlar", icon: Settings };
const ISLAND_CLOSE: MenuItem = { type: "action", id: "close", label: "Kapat", icon: X };

type IslandNotification = {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
};

export function DynamicIsland() {
  return <Island />;
}

function Island() {
  const [, setLocation] = useLocation();
  const overlay = window.zenosWindowRole === "island";
  const rootRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<IslandHost | null>(null);
  const [hostBox, setHostBox] = useState<IslandHost | null>(null);
  const inferredDock = useRef(false);
  const dockAfterAttach = useRef(false);
  const savedAttached = useRef(readIslandOffset());
  const movedWhileAway = useRef(false);
  const hitRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, known: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const attachedRef = useRef<HTMLDivElement>(null);
  const cueMeasureRef = useRef<HTMLSpanElement>(null);
  const dragged = useRef(false);
  const publishBloomRef = useRef<() => void>(() => {});
  const draggingNow = useRef(false);
  const [mode, setMode] = useState<Mode>("compact");
  const [query, setQuery] = useState("");
  const [cue, setCue] = useState("");
  const [shownCue, setShownCue] = useState("");
  const [cueWidth, setCueWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [noticeFire, setNoticeFire] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voiceOn = useVoiceActive();
  const [dock, setDock] = useState<Dock>("free");
  const dockRef = useRef<Dock>("free");
  dockRef.current = dock;
  const vertical = dock !== "free";
  const verticalRef = useRef(false);
  verticalRef.current = vertical;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const prevUnread = useRef(0);
  const blueGlow = useMotionValue(0);
  const redGlow = useMotionValue(0);
  const [constraints, setConstraints] = useState({ left: -200, right: 200, top: -120, bottom: 120 });
  const offset = readIslandOffset();
  const x = useMotionValue(offset.x);
  const y = useMotionValue(offset.y);

  const { data } = useQuery<{ notifications: IslandNotification[]; unreadCount: number }>({
    queryKey: ["/api/notifications"],
    refetchInterval: overlay ? 8000 : 30000,
  });
  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const horizontalSearch = mode === "search" && !vertical;
  const searchWide = query.length > SEARCH_CHAR_STEP;
  const searchOverflow = horizontalSearch && query.length >= SEARCH_CHAR_BOX;
  const sideSearch = vertical && mode === "search";
  const slotTarget = horizontalSearch ? (searchWide ? SLOT_WIDE : SLOT_BASE) : 0;
  const slotTargetMv = useMotionValue(slotTarget);
  const slotSpring = useSpring(slotTargetMv, { stiffness: 420, damping: 34, mass: 0.75 });
  const shellWidth = vertical
    ? (mode === "notices" ? NOTICE_W : COMPACT_H)
    : (mode === "search" ? COMPACT_W + (searchWide ? SLOT_WIDE : SLOT_BASE) : mode === "notices" ? NOTICE_W : COMPACT_W) + (mode === "search" ? 0 : cueWidth);
  const shellHeight = vertical
    ? COMPACT_W + (mode === "search" ? 0 : cueWidth)
    : (mode === "notices" ? NOTICE_H : COMPACT_H);
  const widthTarget = useMotionValue(shellWidth);
  const heightTarget = useMotionValue(shellHeight);
  const widthSpring = useSpring(widthTarget, SHELL_SPRING);
  const heightSpring = useSpring(heightTarget, SHELL_SPRING);
  const radius = useTransform(heightSpring, (height) => Math.min(height / 2, 20));
  const innerRadius = useTransform(radius, (value) => Math.max(0, value - 1));
  const renderedWidth = useTransform([widthSpring, slotSpring], () => {
    const slot = slotSpring.get();
    if ((modeRef.current === "search" || slot > 1) && !verticalRef.current) return COMPACT_W + slot;
    return widthSpring.get();
  });
  const bloomScaleX = useTransform(renderedWidth, (width) => Math.min(Math.max(Number(width) / COMPACT_W, 0.35), 1.8));
  const bloomScaleY = useTransform(heightSpring, (height) => Math.min(Math.max(Number(height) / COMPACT_H, 0.35), 1.8));
  const widthVelocity = useVelocity(widthSpring);
  const scaleX = useTransform(widthVelocity, (velocity) => {
    const stretch = Math.max(-0.04, Math.min(0.06, velocity / 4000));
    return 1 + stretch;
  });
  const [holdSearch, setHoldSearch] = useState(false);
  const holdSearchRef = useRef(false);
  holdSearchRef.current = holdSearch;
  const holdMv = useMotionValue(holdSearch ? 1 : 0);
  const middleWidth = useTransform([widthSpring, heightSpring, holdMv], () => {
    const current = modeRef.current;
    const along = verticalRef.current ? heightSpring.get() : widthSpring.get();
    if (current === "search" || holdSearchRef.current) {
      return Math.max(0, Math.min(SEARCH_W - COMPACT_W, along - COMPACT_W));
    }
    if (current === "notices") {
      const base = verticalRef.current ? COMPACT_W : NOTICE_W;
      return Math.max(0, along - base);
    }
    return Math.max(0, along - COMPACT_W);
  });

  useEffect(() => {
    slotTargetMv.set(slotTarget);
  }, [slotTarget, slotTargetMv]);

  useEffect(() => {
    heightTarget.set(shellHeight);
    if (mode === "search" && !vertical) {
      widthTarget.set(COMPACT_W + slotTarget);
      return;
    }
    widthTarget.set(shellWidth);
  }, [heightTarget, mode, shellHeight, shellWidth, slotTarget, vertical, widthTarget]);

  useEffect(() => {
    if (mode === "search") setHoldSearch(true);
    else if (mode === "notices") setHoldSearch(false);
  }, [mode]);

  useEffect(() => {
    holdMv.set(holdSearch ? 1 : 0);
  }, [holdMv, holdSearch]);

  useEffect(() => {
    const clear = () => {
      if (modeRef.current === "search") return;
      const along = verticalRef.current ? heightSpring.get() : widthSpring.get();
      if (along <= COMPACT_W + 1) setHoldSearch(false);
    };
    const stopWidth = widthSpring.on("change", clear);
    const stopHeight = heightSpring.on("change", clear);
    return () => {
      stopWidth();
      stopHeight();
    };
  }, [heightSpring, widthSpring]);

  const searchOpen = mode === "search" || holdSearch;
  const assistantLive = voiceOn || speaking;

  const openPath = (path: string) => {
    if (overlay) window.electron?.send("island-navigate", path);
    else setLocation(path);
  };

  const syncDock = (offsetX: number) => {
    const { left, rightGap } = place(offsetX, COMPACT_W);
    const slimGap = place(offsetX, COMPACT_H).rightGap;
    if (left <= DOCK_IN) setDock("left");
    else if (rightGap <= DOCK_IN || slimGap <= DOCK_IN) setDock("right");
    else setDock("free");
  };

  const placeHost = (next: IslandHost) => {
    const prev = hostRef.current;
    if (prev && prev.attached !== next.attached && !draggingNow.current) {
      const anchorX = prev.x + prev.width / 2 + x.get();
      const anchorY = prev.y + prev.height / 2 + y.get();
      const nextX = anchorX - (next.x + next.width / 2);
      const nextY = anchorY - (next.y + next.height / 2);
      if (!next.attached) {
        savedAttached.current = { x: x.get(), y: y.get() };
        movedWhileAway.current = false;
        x.set(nextX);
        y.set(nextY);
      } else if (!movedWhileAway.current) {
        x.set(nextX);
        y.set(nextY);
        const saved = savedAttached.current;
        animate(x, saved.x, { type: "spring", ...SHELL_SPRING });
        animate(y, saved.y, { type: "spring", ...SHELL_SPRING });
      } else {
        x.set(nextX);
        y.set(nextY);
        savedAttached.current = { x: nextX, y: nextY };
        writeIslandOffset(savedAttached.current);
        movedWhileAway.current = false;
        dockAfterAttach.current = true;
      }
    }
    hostRef.current = next;
    setHostBox((current) => {
      if (
        current
        && current.attached === next.attached
        && current.x === next.x
        && current.y === next.y
        && current.width === next.width
        && current.height === next.height
        && current.originX === next.originX
        && current.originY === next.originY
        && !dockAfterAttach.current
      ) return current;
      return next;
    });
  };

  useEffect(() => {
    if (!overlay) return;
    const onHost = (host: IslandHost) => {
      if (!host || typeof host.x !== "number" || typeof host.width !== "number") return;
      placeHost(host);
    };
    window.electron?.receive("island-host", onHost);
    window.electron?.send("island-sync");
    return () => window.electron?.removeListener("island-host", onHost);
  }, [overlay]);

  useEffect(() => {
    if (!overlay) return;
    window.electron?.send("island-focus", mode === "search" || menu !== null);
  }, [menu, mode, overlay]);

  useEffect(() => {
    if (!overlay) return;
    const hold = dragging || mode !== "compact" || menu !== null;
    const sync = (clientX: number, clientY: number) => {
      pointerRef.current = { x: clientX, y: clientY, known: true };
      const el = document.elementFromPoint(clientX, clientY);
      const over = hold || (!!el && !!rootRef.current?.contains(el));
      if (over === hitRef.current) return;
      hitRef.current = over;
      window.electron?.send("island-hit", over);
    };
    if (hold) sync(pointerRef.current.x, pointerRef.current.y);
    else if (pointerRef.current.known) sync(pointerRef.current.x, pointerRef.current.y);
    const onMove = (event: MouseEvent) => sync(event.clientX, event.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [dragging, menu, mode, overlay]);

  useEffect(() => {
    if (!overlay) return;
    return () => {
      hitRef.current = false;
      window.electron?.send("island-hit", false);
    };
  }, [overlay]);

  useEffect(() => {
    return () => stopVoiceAssistant();
  }, []);

  useEffect(() => {
    const stopSpeaking = subscribeVoiceSpeaking(setSpeaking);
    if (!overlay) return stopSpeaking;
    const onVoice = (payload: { speaking?: boolean; cue?: string }) => {
      setSpeaking(!!payload?.speaking);
      const next = typeof payload?.cue === "string" ? payload.cue : "";
      setCue(next);
      if (next) setShownCue(next);
    };
    window.electron?.receive("island-voice", onVoice);
    return () => {
      stopSpeaking();
      window.electron?.removeListener("island-voice", onVoice);
    };
  }, [overlay]);

  useEffect(() => {
    if (unreadCount > prevUnread.current) setNoticeFire(true);
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    if (!noticeFire) return;
    const timer = window.setTimeout(() => setNoticeFire(false), 3000);
    return () => window.clearTimeout(timer);
  }, [noticeFire]);

  useEffect(() => {
    const controls = searchOpen || assistantLive
      ? animate(blueGlow, 0.9, { duration: 0.8, delay: 0.1, ease: "easeOut" })
      : animate(blueGlow, 0, { duration: 0.5, ease: "easeInOut" });
    return () => controls.stop();
  }, [assistantLive, blueGlow, searchOpen]);

  useEffect(() => {
    const controls = noticeFire
      ? animate(redGlow, 1, { duration: 0.8, delay: 0.2, ease: "easeOut" })
      : animate(redGlow, 0, { duration: 1, delay: 0.1, ease: "easeIn" });
    return () => controls.stop();
  }, [noticeFire, redGlow]);

  useEffect(() => {
    let raf = 0;
    const publish = () => {
      raf = 0;
      const shell = rootRef.current?.getBoundingClientRect();
      const point = shell && shell.width > 2 && shell.height > 2
        ? {
            x: window.screenX + shell.left + shell.width / 2,
            y: window.screenY + shell.top + shell.height / 2,
          }
        : null;
      if (!point) return;
      const payload = {
        blue: searchOpen || assistantLive ? Math.max(blueGlow.get(), 0.9) : blueGlow.get(),
        red: noticeFire ? Math.max(redGlow.get(), 1) : redGlow.get(),
        x: point.x,
        y: point.y,
      };
      if (overlay) window.electron?.send("island-bloom", payload);
      else applyIslandBloom(payload);
    };
    publishBloomRef.current = publish;
    const kick = () => {
      publish();
    };
    const stopX = x.on("change", kick);
    const stopY = y.on("change", kick);
    const stopW = widthSpring.on("change", kick);
    const stopH = heightSpring.on("change", kick);
    const stopBlue = blueGlow.on("change", kick);
    const stopRed = redGlow.on("change", kick);
    let follow = 0;
    let alive = true;
    const followBloom = () => {
      if (!alive) return;
      publish();
      if (searchOpen || assistantLive || noticeFire || blueGlow.get() > 0.01 || redGlow.get() > 0.01) {
        follow = window.requestAnimationFrame(followBloom);
      }
    };
    follow = window.requestAnimationFrame(followBloom);
    return () => {
      alive = false;
      stopX();
      stopY();
      stopW();
      stopH();
      stopBlue();
      stopRed();
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(follow);
    };
  }, [assistantLive, blueGlow, heightSpring, noticeFire, overlay, redGlow, searchOpen, widthSpring, x, y]);

  useEffect(() => {
    return subscribeVoiceCue((next) => {
      setCue(next);
      if (next) setShownCue(next);
    });
  }, []);

  useLayoutEffect(() => {
    if (!cue) {
      setCueWidth(0);
      return;
    }
    const measured = cueMeasureRef.current?.scrollWidth ?? 0;
    setCueWidth(Math.min(measured + 10, 148));
  }, [cue, shownCue]);

  useEffect(() => {
    if (mode !== "search") return;
    const id = window.requestAnimationFrame(() => {
      if (sideSearch || searchOverflow) {
        const field = boxRef.current;
        if (!field) return;
        field.focus();
        const end = field.value.length;
        field.setSelectionRange(end, end);
        return;
      }
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [mode, searchOverflow, sideSearch]);

  useEffect(() => {
    if (mode === "compact") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !attachedRef.current?.contains(target)) setMode("compact");
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [mode]);

  useEffect(() => {
    const bounds = boundsRef.current;
    if (!bounds) return;
    const measure = () => {
      const rect = bounds.getBoundingClientRect();
      const pad = 28;
      setConstraints({
        left: -(rect.width / 2 - pad),
        right: rect.width / 2 - pad,
        top: -(rect.height / 2 - pad),
        bottom: rect.height / 2 - pad,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bounds);
    return () => observer.disconnect();
  }, []);

  const place = (offsetX: number, width: number) => {
    const parent = boundsRef.current?.clientWidth ?? 0;
    const left = parent / 2 - COMPACT_W / 2 + offsetX;
    return { parent, left, rightGap: parent - (left + width) };
  };

  useEffect(() => {
    if (overlay) return;
    const { left, rightGap } = place(x.get(), COMPACT_W);
    const slimGap = place(x.get(), COMPACT_H).rightGap;
    if (left <= DOCK_IN) setDock("left");
    else if (rightGap <= DOCK_IN || slimGap <= DOCK_IN) setDock("right");
  }, [overlay, x]);

  useLayoutEffect(() => {
    if (!overlay || !hostBox?.attached) return;
    if (inferredDock.current && !dockAfterAttach.current) return;
    inferredDock.current = true;
    dockAfterAttach.current = false;
    syncDock(x.get());
  }, [hostBox, overlay, x]);

  const considerDock = (offsetX: number, width: number) => {
    const { left, rightGap } = place(offsetX, width);
    const current = dockRef.current;
    if (current === "left") {
      if (left > DOCK_OUT) setDock("free");
      return;
    }
    if (current === "right") {
      if (rightGap > DOCK_OUT) setDock("free");
      return;
    }
    if (left <= DOCK_IN) setDock("left");
    else if (rightGap <= DOCK_IN) setDock("right");
  };

  const dockTarget = (side: Dock, destWidth: number) => {
    const parent = boundsRef.current?.clientWidth ?? 0;
    if (side === "left") return DOCK_GAP - parent / 2 + COMPACT_W / 2;
    return parent / 2 - DOCK_GAP - destWidth + COMPACT_W / 2;
  };

  const submitSearch = () => {
    const q = query.trim();
    openPath(q ? `/os/chat?q=${encodeURIComponent(q)}` : "/os/chat");
    setQuery("");
    setMode("compact");
  };

  const rememberOffset = (point: { x: number; y: number }) => {
    const away = overlay && hostRef.current && !hostRef.current.attached;
    if (away) {
      movedWhileAway.current = true;
      return;
    }
    savedAttached.current = point;
    writeIslandOffset(point);
  };

  return (
    <div
      ref={boundsRef}
      className={overlay ? "pointer-events-none absolute z-50 overflow-visible" : "pointer-events-none absolute inset-0 z-50 overflow-visible"}
      style={overlay ? (hostBox ? {
        left: hostBox.x - hostBox.originX,
        top: hostBox.y - hostBox.originY,
        width: hostBox.width,
        height: hostBox.height,
      } : { left: 0, top: 0, width: 0, height: 0, visibility: "hidden" }) : undefined}
    >
      <VoiceSession active={voiceOn} />
      <span
        ref={cueMeasureRef}
        className="pointer-events-none absolute whitespace-nowrap text-[11px] font-medium"
        style={{ visibility: "hidden", height: 0, overflow: "hidden" }}
      >
        {shownCue}
      </span>
      <motion.div
        className="pointer-events-none absolute z-0"
        style={{
          x,
          y,
          scaleX,
          width: renderedWidth,
          height: heightSpring,
          left: "50%",
          top: "50%",
          transformOrigin: "left center",
        }}
        transformTemplate={({ x: dx, y: dy, scaleX: sx }) =>
          `translate(${-COMPACT_W / 2}px, ${-COMPACT_H / 2}px) translate(${dx}, ${dy}) scaleX(${sx || 1})`
        }
      >
          <motion.div
            className="absolute left-1/2 top-1/2"
            style={{
              scaleX: bloomScaleX,
              scaleY: bloomScaleY,
              opacity: 0.9,
              transformOrigin: "center center",
            }}
          >
            <div className="relative h-0 w-0">
              <AnimatePresence>
                {(searchOpen || assistantLive) && <BlueBloom />}
              </AnimatePresence>
              <AnimatePresence>
                {noticeFire && <RedBloom />}
              </AnimatePresence>
            </div>
          </motion.div>
      </motion.div>
      <motion.div
        ref={rootRef}
        drag
        dragMomentum={false}
        dragElastic={0.04}
        dragConstraints={constraints}
        initial={false}
        style={{
          x,
          y,
          scaleX,
          width: renderedWidth,
          height: heightSpring,
          borderRadius: radius,
          left: "50%",
          top: "50%",
          transformOrigin: "left center",
          WebkitAppRegion: "no-drag",
          background: "transparent",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.38), 0 10px 28px rgba(0,0,0,0.28)",
        } as any}
        transformTemplate={({ x: dx, y: dy, scaleX: sx }) =>
          `translate(${-COMPACT_W / 2}px, ${-COMPACT_H / 2}px) translate(${dx}, ${dy}) scaleX(${sx || 1})`
        }
        onPointerDownCapture={(event) => {
          if (event.button === 2) event.stopPropagation();
        }}
        onPointerDown={() => {
          dragged.current = false;
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({
            x: Math.min(event.clientX, window.innerWidth - 260),
            y: Math.min(event.clientY, window.innerHeight - 120),
          });
        }}
        onDragStart={() => {
          dragged.current = true;
          draggingNow.current = true;
          setDragging(true);
          setMenu(null);
        }}
        onDrag={() => {
          considerDock(x.get(), widthSpring.get());
          requestAnimationFrame(() => publishBloomRef.current());
        }}
        onDragEnd={() => {
          draggingNow.current = false;
          setDragging(false);
          if (overlay && hostRef.current && !hostRef.current.attached) movedWhileAway.current = true;
          considerDock(x.get(), widthSpring.get());
          const side = dockRef.current;
          if (side === "free") {
            rememberOffset({ x: x.get(), y: y.get() });
            return;
          }
          const destWidth = mode === "notices" ? NOTICE_W : COMPACT_H;
          animate(x, dockTarget(side, destWidth), { type: "spring", ...SHELL_SPRING }).then(() => {
            rememberOffset({ x: x.get(), y: y.get() });
          });
        }}
        className="pointer-events-auto absolute z-[1] cursor-grab p-px text-white active:cursor-grabbing"
        data-testid="dynamic-island"
      >
        <motion.div
          className="pointer-events-none absolute inset-[-2px] z-[1] overflow-hidden"
          style={{
            borderRadius: radius,
            WebkitMaskImage: "radial-gradient(ellipse at center, transparent 58%, black 82%)",
            maskImage: "radial-gradient(ellipse at center, transparent 58%, black 82%)",
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              opacity: blueGlow,
              mixBlendMode: "screen",
              background: "radial-gradient(120% 90% at 50% 40%, rgba(37,99,235,0.85) 0%, rgba(56,189,248,0.35) 46%, transparent 78%)",
            }}
          />
          <motion.div
            className="absolute inset-0"
            style={{
              opacity: redGlow,
              mixBlendMode: "screen",
              background: "radial-gradient(110% 90% at 50% 42%, rgba(220,38,38,0.8) 0%, rgba(249,115,22,0.34) 48%, transparent 78%)",
            }}
          />
        </motion.div>
        <motion.div
          className="relative z-[2] flex h-full w-full flex-col overflow-hidden"
          style={{ background: "#000", borderRadius: innerRadius }}
        >
        <div className={`flex h-full w-full ${vertical ? (dock === "right" ? "flex-row-reverse" : "flex-row") : "flex-col"}`}>
        <div className={vertical ? "flex h-full min-h-0 w-11 shrink-0 flex-col items-center gap-3.5 py-3.5" : "flex h-11 w-full shrink-0 items-center gap-3.5 px-3.5"}>
          <button
            type="button"
            title={overlay && hostBox && !hostBox.attached ? "Pencereyi aç" : undefined}
            onClick={() => {
              if (dragged.current) return;
              if (overlay && hostRef.current && !hostRef.current.attached) openPath("/os");
            }}
            className="flex shrink-0 items-center bg-transparent p-0"
          >
            <Clock />
          </button>
          <Glyph
            title="Bildirimler"
            testId="button-island-notices"
            onClick={() => setMode((current) => current === "notices" ? "compact" : "notices")}
          >
            <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute right-0 top-0 h-1 w-1 rounded-full bg-white" />
            )}
          </Glyph>
          <Glyph
            title="Connect"
            testId="button-island-connect"
            onClick={() => {
              openPath("/os/communications");
              setMode("compact");
            }}
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Glyph>
          <motion.div
            style={vertical ? { height: middleWidth, width: 28 } : { width: horizontalSearch || holdSearch ? slotSpring : middleWidth }}
            className="flex h-11 shrink-0 items-center overflow-hidden"
          >
            {(horizontalSearch || (holdSearch && !vertical)) ? (
              <form
                className="flex h-full min-w-0 flex-1 items-center overflow-hidden"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  value={query.length >= SEARCH_CHAR_BOX ? query.slice(0, SEARCH_CHAR_BOX) : query}
                  readOnly={query.length >= SEARCH_CHAR_BOX}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next.length <= SEARCH_CHAR_BOX) setQuery(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setMode("compact");
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearch();
                      return;
                    }
                    const atEnd = event.currentTarget.selectionStart === query.length
                      && event.currentTarget.selectionEnd === query.length;
                    if (
                      atEnd
                      && query.length >= SEARCH_CHAR_BOX
                      && event.key.length === 1
                      && !event.metaKey
                      && !event.ctrlKey
                      && !event.altKey
                    ) {
                      event.preventDefault();
                      setQuery((current) => current + event.key);
                    }
                  }}
                  placeholder="Sor..."
                  className="w-full min-w-0 overflow-hidden whitespace-nowrap bg-transparent text-[12px] text-white outline-none placeholder:text-white/40"
                  data-testid="input-island-search"
                />
              </form>
            ) : (
              <span className="block whitespace-nowrap pl-1 text-[11px] font-medium tracking-[-0.01em] text-white">
                {shownCue}
              </span>
            )}
          </motion.div>
          <Glyph
            title={voiceOn ? "Sesli konuşmayı kapat" : "Sesli konuş"}
            testId="button-island-voice"
            onClick={() => {
              toggleVoiceActive();
              if (overlay && modeRef.current !== "search") window.electron?.send("island-focus", false);
            }}
          >
            <Mic className={`h-3.5 w-3.5 ${voiceOn ? "text-[#2997ff]" : ""}`} strokeWidth={1.5} />
          </Glyph>
          <Glyph
            title="Zenlecs+"
            testId="button-island-search"
            onClick={() => setMode((current) => current === "search" ? "compact" : "search")}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Glyph>
        </div>
        {mode === "notices" && (
        <div className={vertical ? "min-w-0 flex-1 overflow-hidden px-2 py-3" : "h-[120px] px-3.5 pb-3 pt-1"}>
          <div className="h-[78px] overflow-hidden">
            {notifications.length === 0 ? (
              <p className="px-1 pt-1 text-[11px] text-white/55">Bildirim yok</p>
            ) : (
              notifications.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.isRead) markRead.mutate(item.id);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="block w-full truncate rounded-lg px-1 py-0.5 text-left text-[11px] text-white/85"
                >
                  {item.title}
                </button>
              ))
            )}
          </div>
        </div>
        )}
        </div>
        </motion.div>
      </motion.div>
      <AttachedSearch
        open={searchOverflow || sideSearch}
        side={sideSearch ? (dock === "right" ? "left" : "right") : "below"}
        text={sideSearch ? query : query.slice(SEARCH_CHAR_BOX)}
        wide={searchWide}
        x={x}
        y={y}
        shellWidth={renderedWidth}
        shellHeight={heightSpring}
        boxRef={boxRef}
        anchorRef={attachedRef}
        onChange={(next) => {
          if (sideSearch) setQuery(next);
          else setQuery((current) => current.slice(0, SEARCH_CHAR_BOX) + next);
        }}
        onBackspaceEdge={() => setQuery((current) => current.slice(0, -1))}
        onSubmit={submitSearch}
        onEscape={() => setMode("compact")}
      />
      {menu && (
        <StudioContextMenu
          x={menu.x}
          y={menu.y}
          items={overlay && hostBox && !hostBox.attached ? [ISLAND_SETTINGS, ISLAND_CLOSE] : [ISLAND_SETTINGS]}
          onClose={() => setMenu(null)}
          onRun={(id) => {
            if (id === "settings") openPath("/os/settings");
            if (id === "close") {
              stopVoiceAssistant();
              window.electron?.send("island-dismiss");
            }
          }}
        />
      )}
    </div>
  );
}

function AttachedSearch({
  open,
  side,
  text,
  wide,
  x,
  y,
  shellWidth,
  shellHeight,
  boxRef,
  anchorRef,
  onChange,
  onBackspaceEdge,
  onSubmit,
  onEscape,
}: {
  open: boolean;
  side: "below" | "left" | "right";
  text: string;
  wide: boolean;
  x: { get: () => number };
  y: { get: () => number };
  shellWidth: { get: () => number };
  shellHeight: { get: () => number };
  boxRef: { current: HTMLTextAreaElement | null };
  anchorRef: { current: HTMLDivElement | null };
  onChange: (value: string) => void;
  onBackspaceEdge: () => void;
  onSubmit: () => void;
  onEscape: () => void;
}) {
  const heightTarget = useMotionValue(open ? 46 : 0);
  const heightSpring = useSpring(heightTarget, { stiffness: 420, damping: 34, mass: 0.75 });
  const widthTarget = useMotionValue(wide ? SLOT_WIDE : SLOT_BASE);
  const widthSpring = useSpring(widthTarget, { stiffness: 420, damping: 34, mass: 0.75 });

  useEffect(() => {
    widthTarget.set(wide ? SLOT_WIDE : SLOT_BASE);
  }, [wide, widthTarget]);

  const placedCaret = useRef(false);
  useLayoutEffect(() => {
    const perLine = side === "below" ? 36 : wide ? 28 : 16;
    const lines = Math.max(1, Math.ceil(Math.max(text.length, 1) / perLine));
    heightTarget.set(open ? Math.min(180, 46 + Math.max(0, lines - 1) * 22) : 0);
    if (!open) {
      placedCaret.current = false;
      return;
    }
    const field = boxRef.current;
    if (!field || placedCaret.current) return;
    placedCaret.current = true;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, [boxRef, heightTarget, open, side, text, wide]);

  if (!open && heightSpring.get() < 1) return null;

  return (
    <motion.div
      ref={anchorRef}
      className="absolute z-[3] overflow-hidden bg-black text-white"
      style={{
        x: x as never,
        y: y as never,
        height: heightSpring,
        width: side === "below" ? shellWidth as never : widthSpring,
        left: "50%",
        top: "50%",
        borderRadius: 20,
      }}
      transformTemplate={({ x: dx, y: dy }) => {
        const shellW = Number(shellWidth.get());
        const shellH = Number(shellHeight.get());
        const boxW = side === "below" ? shellW : widthSpring.get();
        const shiftX = side === "right" ? shellW + 8 : side === "left" ? -(boxW + 8) : 0;
        const shiftY = side === "below" ? shellH + 8 : 0;
        return `translate(${-COMPACT_W / 2 + shiftX}px, ${-COMPACT_H / 2 + shiftY}px) translate(${dx}, ${dy})`;
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={boxRef}
        value={text}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onEscape();
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
          if (
            side === "below"
            && event.key === "Backspace"
            && event.currentTarget.selectionStart === 0
            && event.currentTarget.selectionEnd === 0
          ) {
            event.preventDefault();
            onBackspaceEdge();
          }
        }}
        placeholder="Sor..."
        className="block h-full w-full resize-none bg-transparent px-3.5 py-3 text-[12px] text-white outline-none placeholder:text-white/40"
      />
    </motion.div>
  );
}

type VoiceBand = "low" | "mid" | "high";

const VOICE_FLAME_SPRING = {
  low: { stiffness: 28, damping: 20, mass: 1.5 },
  mid: { stiffness: 32, damping: 20, mass: 1.2 },
  high: { stiffness: 40, damping: 18, mass: 0.95 },
} as const;

function useVoiceFlameMotion(band: VoiceBand) {
  const level = useMotionValue(0);
  const low = useMotionValue(0);
  const mid = useMotionValue(0);
  const high = useMotionValue(0);
  const centroid = useMotionValue(0.5);
  useEffect(() => subscribeVoiceSpectrum((spectrum: VoiceSpectrum) => {
    level.set(spectrum.level);
    low.set(spectrum.low);
    mid.set(spectrum.mid);
    high.set(spectrum.high);
    centroid.set(spectrum.centroid);
  }), [centroid, high, level, low, mid]);

  const spring = VOICE_FLAME_SPRING[band];
  const scaleX = useSpring(useTransform([level, low, mid, high], () => {
    const lv = level.get();
    if (band === "low") return 1 + lv * 0.05 + low.get() * 0.09;
    if (band === "mid") return 1 + lv * 0.04 + mid.get() * 0.07;
    return 1 + high.get() * 0.045;
  }), spring);
  const scaleY = useSpring(useTransform([level, low, mid, high], () => {
    const lv = level.get();
    if (band === "low") return 1 + lv * 0.03 + low.get() * 0.05;
    if (band === "mid") return 1 + lv * 0.07 + mid.get() * 0.06;
    return 1 + lv * 0.04 + high.get() * 0.12;
  }), spring);
  const x = useSpring(useTransform([low, mid, high], () => {
    if (band === "low") return (low.get() - high.get()) * 7;
    if (band === "mid") return (mid.get() - (low.get() + high.get()) * 0.5) * 6;
    return (high.get() - low.get()) * 6;
  }), spring);
  const y = useSpring(useTransform([level, high, centroid], () => {
    const shift = centroid.get() - 0.5;
    if (band === "low") return -shift * 4 * level.get();
    if (band === "mid") return shift * 3;
    return shift * 8 * (0.35 + high.get());
  }), spring);
  return { scaleX, scaleY, x, y };
}

function BlueBloom() {
  return (
    <>
      <BlueFlame
        band="low"
        width={500}
        height={60}
        blur={40}
        color="bg-blue-600/65 dark:bg-blue-600/75"
        enter={0.4}
        exit={0.3}
        drift={{
          scaleX: [1, 1.06, 0.95, 1.03, 1],
          scaleY: [1, 0.94, 1.05, 0.97, 1],
          x: [0, 4, -3, 2, 0],
          opacity: [0.72, 0.95, 0.62, 0.88, 0.74],
        }}
        times={[0, 0.28, 0.52, 0.78, 1]}
        duration={9.5}
        repeat={Infinity}
      />
      <BlueFlame
        band="mid"
        width={380}
        height={120}
        blur={60}
        color="bg-gradient-to-b from-blue-600/55 to-sky-400/32 dark:from-blue-600/65 dark:to-sky-400/40"
        enter={0.5}
        exit={0.4}
        delay={0.6}
        drift={{
          scaleX: [1, 0.96, 1.07, 0.98, 1],
          scaleY: [1, 1.05, 0.94, 1.03, 1],
          x: [0, -5, 3, -2, 0],
          y: [0, 3, -2, 2, 0],
          opacity: [0.66, 0.9, 0.58, 0.84, 0.7],
        }}
        times={[0, 0.22, 0.47, 0.73, 1]}
        duration={12.4}
        repeat={Infinity}
      />
      <BlueFlame
        band="high"
        width={250}
        height={180}
        blur={80}
        color="bg-gradient-to-b from-sky-400/34 to-cyan-200/18 dark:from-sky-400/42 dark:to-cyan-200/26"
        enter={0.6}
        exit={0.5}
        delay={1.1}
        drift={{
          scaleX: [1, 1.05, 0.96, 1.04, 1],
          scaleY: [1, 0.95, 1.06, 0.98, 1],
          x: [0, 3, -4, 2, 0],
          opacity: [0.6, 0.86, 0.54, 0.8, 0.64],
        }}
        times={[0, 0.31, 0.56, 0.8, 1]}
        duration={8.2}
        repeat={Infinity}
      />
    </>
  );
}

function BlueFlame({ band, ...props }: { band: VoiceBand } & Omit<Parameters<typeof Flame>[0], "audio">) {
  const audio = useVoiceFlameMotion(band);
  return <Flame {...props} audio={audio} />;
}

function RedBloom() {
  return (
    <>
      <Flame
        width={270}
        height={45}
        blur={25}
        color="bg-red-600/82 dark:bg-red-600/90"
        enter={0.8}
        exit={0.8}
        drift={{
          scaleX: [1, 1.05, 0.97, 1.03, 1],
          scaleY: [1, 0.96, 1.04, 0.98, 1],
          x: [0, 3, -2, 2, 0],
          opacity: [0.62, 0.92, 0.7, 0.86, 0.64],
        }}
        times={[0, 0.3, 0.55, 0.8, 1]}
        duration={3}
        repeat={0}
      />
      <Flame
        width={180}
        height={85}
        blur={35}
        color="bg-gradient-to-b from-red-600/72 to-orange-500/50 dark:from-red-600/82 dark:to-orange-500/58"
        enter={0.9}
        exit={0.9}
        delay={0.1}
        drift={{
          scaleX: [1, 0.97, 1.04, 0.98, 1],
          scaleY: [1, 1.04, 0.96, 1.02, 1],
          x: [0, -3, 2, -1, 0],
          y: [0, 2, -1, 1, 0],
          opacity: [0.66, 0.88, 0.72, 0.84, 0.68],
        }}
        times={[0, 0.26, 0.5, 0.76, 1]}
        duration={3}
        repeat={0}
      />
      <Flame
        width={120}
        height={120}
        blur={45}
        color="bg-gradient-to-b from-orange-500/52 to-amber-400/38 dark:from-orange-500/60 dark:to-amber-400/46"
        enter={1}
        exit={1}
        delay={0.2}
        drift={{
          scaleX: [1, 1.04, 0.97, 1.02, 1],
          scaleY: [1, 0.96, 1.05, 0.98, 1],
          x: [0, 2, -3, 1, 0],
          y: [0, -2, 2, -1, 0],
          opacity: [0.6, 0.86, 0.68, 0.8, 0.62],
        }}
        times={[0, 0.34, 0.58, 0.82, 1]}
        duration={3}
        repeat={0}
      />
    </>
  );
}

function Flame({
  width,
  height,
  blur,
  color,
  enter,
  exit,
  delay = 0,
  drift,
  times,
  duration,
  repeat,
  audio,
}: {
  width: number | string;
  height: number | string;
  blur: number;
  color: string;
  enter: number;
  exit: number;
  delay?: number;
  drift: Record<string, number[]>;
  times?: number[];
  duration: number;
  repeat: number;
  audio?: { scaleX: ReturnType<typeof useSpring>; scaleY: ReturnType<typeof useSpring>; x: ReturnType<typeof useSpring>; y: ReturnType<typeof useSpring> };
}) {
  const shape = <div className={`h-full w-full ${color}`} style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />;
  return (
    <motion.div
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1, transition: { duration: enter, delay, ease: "easeOut" } }}
      exit={{ opacity: 0, scaleY: 0, transition: { duration: exit, ease: "easeIn" } }}
      className="absolute left-1/2 top-1/2 origin-center"
      style={{ x: "-50%", y: "-50%", width, height }}
    >
      <motion.div
        animate={drift}
        transition={{ repeat, duration, ease: [0.65, 0, 0.35, 1] as const, times }}
        className="h-full w-full"
        style={{ filter: `blur(${blur}px)` }}
      >
        {audio ? (
          <motion.div className="h-full w-full" style={audio}>
            {shape}
          </motion.div>
        ) : shape}
      </motion.div>
    </motion.div>
  );
}

function Glyph({
  title,
  testId,
  onClick,
  children,
}: {
  title: string;
  testId: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="relative flex shrink-0 items-center justify-center bg-transparent p-0 text-white"
    >
      {children}
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatClock(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="flex h-3.5 items-center font-medium leading-none tabular-nums text-[11px] tracking-[-0.03em] text-white/90">
      {now.split("").map((char, index) => (
        <RollChar key={`${index}-${char === ":" ? "sep" : "d"}`} char={char} />
      ))}
    </span>
  );
}

function RollChar({ char }: { char: string }) {
  return (
    <span
      className="relative inline-flex h-3.5 items-center justify-center overflow-hidden"
      style={{ width: char === ":" ? "0.35em" : "0.62em" }}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={char}
          initial={{ y: "110%", opacity: 1 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-110%", opacity: 1 }}
          transition={DIGIT_SPRING}
          className="absolute inset-x-0 top-0 block text-center leading-[14px]"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function formatClock(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
