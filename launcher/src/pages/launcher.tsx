import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-provider";
import LoginPage from "@/pages/login";
import LandingPage from "@/pages/landing";
import { WindowControls } from "@/components/layout/window-controls";
import { PrecisionIntro } from "@/components/launcher/precision-intro";

type LauncherState = "PRELOAD" | "LANDING" | "AUTH";

export default function Launcher() {
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<LauncherState>("PRELOAD");

  const isDark = theme === "dark";
  const reduceMotion = Boolean(useReducedMotion());

  const [darkCheckedState, setDarkCheckedState] = useState<boolean>(isDark);
  const darkCheckedPinned = darkCheckedState;

  const handleThemeToggle = useCallback((v: boolean) => {
    setDarkCheckedState(v);
  }, []);

  // Electron: auth stays in launcher — open the separate app window via IPC
  useEffect(() => {
    if (!isAuthenticated) return;
    if (window.electron) {
      window.electron.send("auth-login");
      return;
    }
    setLocation("/os");
  }, [isAuthenticated, setLocation]);

  // After logout IPC, return to AUTH surface (do not bounce into /os)
  useEffect(() => {
    if (!window.electron) return;
    const onLoggedOut = () => {
      setState("AUTH");
    };
    window.electron.receive("auth-logged-out", onLoggedOut);
    return () => {
      window.electron?.removeListener("auth-logged-out", onLoggedOut);
    };
  }, []);

  // Sync launch theme switch back to persistent storage
  useEffect(() => {
    if (typeof darkCheckedPinned === "boolean") {
      try {
        localStorage.setItem("zenos-theme-v3", String(darkCheckedPinned));
      } catch {
        /* storage unavailable */
      }
    }
  }, [darkCheckedPinned]);

  const finishIntro = useCallback(() => {
    setState((current) => current === "PRELOAD" ? "LANDING" : current);
  }, []);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-background text-foreground rounded-xl select-none">
      {state !== "PRELOAD" && (
        <div className="h-8 w-full absolute top-0 left-0 z-50 flex items-center justify-between px-4 bg-transparent pointer-events-none">
          <div className="h-full flex-1 pointer-events-none" style={{ WebkitAppRegion: "drag" } as any} />
          <div className="h-full w-[540px] shrink-0 pointer-events-none" style={{ WebkitAppRegion: "no-drag" } as any} />
          <div className="h-full flex-1 pointer-events-none" style={{ WebkitAppRegion: "drag" } as any} />
          <div className="pointer-events-auto ml-auto mt-1.5 mr-1" style={{ WebkitAppRegion: "no-drag" } as any}>
            <WindowControls />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {state === "PRELOAD" && <PrecisionIntro key="preload" isDark={isDark} onComplete={finishIntro} />}

        {state === "LANDING" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.5 }}
            className="absolute inset-0 z-40 bg-background rounded-xl overflow-hidden"
          >
            <div className="h-full w-full overflow-hidden">
              <LandingPage onLoginClick={() => setState("AUTH")} />
            </div>
          </motion.div>
        )}

        {state === "AUTH" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 z-40 bg-background rounded-xl overflow-hidden"
          >
            <div className="h-full w-full overflow-hidden">
              <LoginPage onBack={() => setState("LANDING")} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
