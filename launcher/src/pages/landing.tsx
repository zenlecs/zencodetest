import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { Button } from "@/components/ui/button";
import { 
  Key,
  X,
  Moon, 
  Sun
} from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";
import { VideoAmbient } from "@/components/ui/video-ambient";



const barContentVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.24 } },
};

const barItemVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

function LandingHeader({ onLoginClick, onLogoClick }: { onLoginClick?: () => void; onLogoClick?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // Ultra-realistic iOS-style multi-layered transparent floating shadows
  // Soft, airy Gaussian falloff with low opacity - completely free of harsh dark smudges
  const iosShadow = isDark
    ? "0 2px 5px 0 rgba(0, 0, 0, 0.12), 0 6px 16px -2px rgba(0, 0, 0, 0.16), 0 16px 32px -4px rgba(0, 0, 0, 0.18), 0 28px 56px -8px rgba(0, 0, 0, 0.12)"
    : "0 1px 3px 0 rgba(0, 0, 0, 0.015), 0 4px 12px -1px rgba(0, 0, 0, 0.025), 0 12px 24px -2px rgba(0, 0, 0, 0.03), 0 22px 44px -6px rgba(0, 0, 0, 0.02)";

  const iosHoverShadow = isDark
    ? "0 3px 8px 0 rgba(0, 0, 0, 0.14), 0 10px 22px -2px rgba(0, 0, 0, 0.20), 0 22px 42px -4px rgba(0, 0, 0, 0.22), 0 36px 68px -8px rgba(0, 0, 0, 0.14)"
    : "0 2px 6px 0 rgba(0, 0, 0, 0.02), 0 8px 18px -1px rgba(0, 0, 0, 0.035), 0 18px 34px -2px rgba(0, 0, 0, 0.04), 0 30px 58px -6px rgba(0, 0, 0, 0.025)";

  // Motion animation variants with dynamic transparent shadow
  const barVariants: Variants = {
    hidden: { 
      opacity: 0, 
      y: -24, 
      scale: 0.9, 
      filter: "blur(10px)",
      boxShadow: "0 0 0 0 rgba(0, 0, 0, 0)",
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      boxShadow: iosShadow,
      transition: {
        y: { type: "spring", stiffness: 280, damping: 24, mass: 0.9 },
        scale: { type: "spring", stiffness: 300, damping: 22, mass: 0.9 },
        boxShadow: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
        filter: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
        opacity: { duration: 0.35, ease: "easeOut" },
      },
    },
  };

  const navItems = [
    { label: "About Us", href: "#" },
    { label: "Our Technology", href: "#" },
    { label: "Licensing", href: "#" },
  ];

  return (
    <header className="absolute top-0 left-0 right-0 z-50 bg-transparent">
      <div className="relative max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onLogoClick} style={{ WebkitAppRegion: "no-drag" } as any}>
          <img 
            src="./Frame%2013.svg" 
            alt="Zenlecs Logo Dark" 
            className="h-10 w-auto hidden dark:block"
          />
          <img 
            src="./Frame%2014.svg" 
            alt="Zenlecs Logo Light" 
            className="h-10 w-auto block dark:hidden"
          />
        </div>
        
        {/* Liquid Glass Bar */}
        <div 
          className="lg-bar absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 hidden md:flex items-center pointer-events-auto"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <motion.div
            className="lg-shell relative rounded-full p-[2.1px] overflow-hidden will-change-transform"
            variants={barVariants}
            initial="hidden"
            animate="visible"
            whileHover={{}}
          >
            <motion.div
              className="lg-body relative flex items-center rounded-full overflow-hidden"
              style={{ padding: "5px 8px 5px 12px" }}
              variants={barContentVariants}
            >
              {navItems.map((item) => {
                return (
                  <motion.button
                    key={item.label}
                    variants={barItemVariants}
                    onClick={(e) => { e.preventDefault(); }}
                    className="group/nav relative px-[14px] py-[8px] rounded-full font-kanit-local text-[14px] leading-none tracking-[0.01em] lg-text-muted hover:lg-text"
                  >
                    <span className="lg-pill pointer-events-none absolute inset-0 rounded-full opacity-0 group-hover/nav:opacity-100 transition-opacity duration-200 ease-out" />
                    <span className="relative z-10">{item.label}</span>
                  </motion.button>
                );
              })}

              {/* Login */}
              <motion.button
                variants={barItemVariants}
                onClick={onLoginClick}
                className="relative ml-1 flex items-center gap-2 rounded-full font-kanit-local text-[14px] leading-none tracking-[0.01em] text-white outline-none cursor-pointer"
              >
                <span className="relative z-10 flex items-center gap-2 px-3 py-1.5">
                  <Key className="w-3.5 h-3.5 text-white/80" />
                  <span>Login</span>
                </span>
              </motion.button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </header>
  );
}

// Footer Component
function FooterSection() {
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | 'contact' | null>(null);
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <footer className="py-4 bg-transparent flex items-center w-full">
        <div className="max-w-7xl mx-auto px-6 w-full">
          <div className="flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-5">
              <img src="./jlcologo.svg" alt="J&L Co." className="h-5 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity [filter:brightness(0)] dark:[filter:none]" />
              <p className="text-xs text-slate-500 dark:text-muted-foreground hidden md:block">
                © 2026 Zenlecs Limited. All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-muted-foreground">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme} 
                className="h-8 w-8 text-slate-600 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </Button>
              <button onClick={() => setActiveModal('privacy')}
              >Privacy</button>
              <button onClick={() => setActiveModal('terms')}
              >Terms of Use</button>
              <button onClick={() => setActiveModal('contact')}
              >Contact</button>
            </div>
          </div>
        </div>
      </footer>

      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setActiveModal(null)}>
          <div className="relative bg-background border border-border rounded-lg max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setActiveModal(null)} 
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            {activeModal === 'privacy' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Privacy Policy</h3>
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>At ZenOS, we value the privacy of our users.</p>
                  <p>Your personal data is protected with end-to-end encryption. Your data is never shared with third parties under any circumstances.</p>
                  <p>All communications and documents are stored encrypted. When you delete your account, all your data is permanently deleted.</p>
                </div>
              </div>
            )}
            {activeModal === 'terms' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Terms of Use</h3>
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>By using the ZenOS platform, you agree to the following terms:</p>
                  <p>The platform must only be used for lawful purposes. You are responsible for the security of your account information.</p>
                  <p>The Zenlecs+ AI is for informational purposes only and does not constitute legal advice. Please consult a lawyer for professional legal advice.</p>
                </div>
              </div>
            )}
            {activeModal === 'contact' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Contact</h3>
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>To get in touch with us:</p>
                  <p>Email: info@zenlecs.ae</p>
                  <p>Phone: +971 4 555 0000</p>
                  <p>Address: Dubai Internet City, Dubai, UAE</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}




const isElectron = !!window.electron;

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : "none";
}

function InstallHero({ onBack }: { onBack: () => void }) {
  const [message, setMessage] = useState("Checking the version...");
  const [percent, setPercent] = useState(0);
  const [speed, setSpeed] = useState("");
  const [localSha, setLocalSha] = useState<string | null>(null);
  const [remoteSha, setRemoteSha] = useState<string | null>(null);
  const [upToDate, setUpToDate] = useState(false);
  const [installing, setInstalling] = useState(false);

  const applyPayload = useCallback((data: {
    status?: string;
    message?: string;
    percent?: number;
    bytesPerSecond?: number;
    localSha?: string | null;
    remoteSha?: string | null;
    upToDate?: boolean;
  }) => {
    if (data.message) setMessage(data.message);
    if (typeof data.percent === "number") setPercent(data.percent);
    if (typeof data.bytesPerSecond === "number" && data.bytesPerSecond > 0) {
      setSpeed(`${(data.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`);
    } else if (data.status !== "downloading") {
      setSpeed("");
    }
    if ("localSha" in data) setLocalSha(data.localSha ?? null);
    if ("remoteSha" in data) setRemoteSha(data.remoteSha ?? null);
    if (typeof data.upToDate === "boolean") setUpToDate(data.upToDate);
    if (data.status === "error" || data.status === "ready") setInstalling(false);
  }, []);

  useEffect(() => {
    if (!isElectron) {
      setMessage("Installation runs inside the desktop launcher.");
      return;
    }
    const onProgress = (data: any) => applyPayload(data);
    window.electron?.receive("payload-progress", onProgress);
    window.electron?.invoke("payload-status").then(applyPayload);
    return () => {
      window.electron?.removeListener("payload-progress", onProgress);
    };
  }, [applyPayload]);

  const startInstall = useCallback(async () => {
    if (!window.electron || installing) return;
    setInstalling(true);
    setPercent(0);
    setSpeed("");
    const result = await window.electron.invoke("payload-install");
    applyPayload(result);
  }, [applyPayload, installing]);

  const actionLabel = upToDate ? "Up to date" : localSha ? "Update" : "Install";
  const busy = installing || message === "Checking the version..." || message === "Downloading files..." || message === "Extracting the installation...";

  return (
    <div className="w-full max-w-xl flex flex-col gap-8" style={{ WebkitAppRegion: "no-drag" } as any}>
      <div className="flex flex-col gap-3">
        <p className="font-kanit-local text-[12px] tracking-[0.18em] uppercase text-slate-500 dark:text-white/50">
          Install & Update
        </p>
        <h1 className="font-kanit-local text-[40px] leading-none tracking-[-0.03em] text-slate-900 dark:text-white">
          {upToDate ? "You're up to date" : localSha ? "Update Zenlecs" : "Install Zenlecs"}
        </h1>
        <p className="font-kanit-local text-[15px] text-slate-600 dark:text-white/70">{message}</p>
      </div>

      <div className="h-[3px] w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        {percent > 0 && (
          <div
            className="h-full rounded-full bg-slate-900 dark:bg-white transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-[12px] text-slate-500 dark:text-white/50">
        <span>Installed {shortSha(localSha)}</span>
        <span>{speed || `Remote ${shortSha(remoteSha)}`}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || upToDate || !isElectron}
          onClick={startInstall}
          className="rounded-full bg-slate-900 px-6 py-2.5 font-kanit-local text-[14px] text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {actionLabel}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full px-5 py-2.5 font-kanit-local text-[14px] text-slate-600 dark:text-white/70"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// MAIN LANDING PAGE COMPONENT (SINGLE SECTION)
export default function LandingPage({ onLoginClick }: { onLoginClick?: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [hero, setHero] = useState<"home" | "install">("home");

  useEffect(() => {
    document.title = "ZenOS - Hukuk İşletim Sistemi | Zenlecs";
  }, []);

  return (
    <div className="h-full w-full text-foreground overflow-hidden relative rounded-xl select-none bg-[#F5F5F7] dark:bg-[#212329] transition-colors duration-500">
      
      {/* Top Header Navbar */}
      <LandingHeader onLoginClick={onLoginClick} onLogoClick={() => setHero("home")} />

      {/* Liquid Glassmorphic Perimeter Frame & Inner Shadow Layer (Stage 2) */}
      <div 
        className="pointer-events-none absolute inset-0 z-20 rounded-xl overflow-hidden transition-all duration-500"
        style={{
          WebkitMaskImage: "radial-gradient(ellipse at center, transparent 58%, black 92%)",
          maskImage: "radial-gradient(ellipse at center, transparent 58%, black 92%)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          background: isDark
            ? "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 30%, rgba(0,0,0,0.15) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.2) 30%, rgba(0,0,0,0.03) 100%)",
          boxShadow: isDark
            ? "inset 0 1px 1.5px 0 rgba(255,255,255,0.20), inset 0 -1px 2px 0 rgba(0,0,0,0.5), inset 0 0 65px 15px #212329, inset 0 0 130px 35px rgba(33, 35, 41, 0.7)"
            : "inset 0 1.5px 2px 0 rgba(255,255,255,0.9), inset 0 -1px 2px 0 rgba(0,0,0,0.08), inset 0 0 65px 15px #F5F5F7, inset 0 0 130px 35px rgba(245, 245, 247, 0.7)",
        }}
      >
        {/* Subtle Liquid Glass Specular Light Reflection */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-60 dark:opacity-40"
          style={{
            background: isDark
              ? "radial-gradient(ellipse at 15% 15%, rgba(255,255,255,0.14) 0%, transparent 60%)"
              : "radial-gradient(ellipse at 15% 15%, rgba(255,255,255,0.7) 0%, transparent 60%)",
          }}
        />
      </div>

      {/* Main Single Section Content: Center-Left Video Display with Ambient Glow */}
      <main className="h-full w-full relative z-10">
        <AnimatePresence mode="wait" initial={false}>
          {hero === "install" ? (
            <motion.div
              key="install"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex items-center px-8 sm:px-14 md:px-20 lg:px-28"
            >
              <div className="w-full max-w-7xl mx-auto flex items-center">
                <InstallHero onBack={() => setHero("home")} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex items-center px-8 sm:px-14 md:px-20 lg:px-28"
            >
              <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-12">
                <VideoAmbient
                  src="/videoplayback.mp4"
                  className="aspect-[9/16] h-[64vh] max-h-[620px] min-h-[380px]"
                  rounded={28}
                  glow={true}
                  blur={38}
                  intensity={0.44}
                  gain={1.65}
                  saturation={1.9}
                  aspectRatio="9:16"
                  showOverlay={true}
                />
                <div className="flex flex-col items-stretch gap-3 min-w-[200px]" style={{ WebkitAppRegion: "no-drag" } as any}>
                  <button
                    type="button"
                    onClick={() => setHero("install")}
                    className="rounded-full bg-slate-900 px-8 py-3 font-kanit-local text-[15px] text-white dark:bg-white dark:text-slate-900"
                  >
                    Install
                  </button>
                  <button
                    type="button"
                    onClick={() => setHero("install")}
                    className="rounded-full border border-black/10 bg-white/70 px-8 py-3 font-kanit-local text-[15px] text-slate-900 dark:border-white/15 dark:bg-white/10 dark:text-white"
                  >
                    Update
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Absolute Overlay Footer */}
      <div className="absolute bottom-0 left-0 w-full z-40 pb-safe pointer-events-auto">
        <FooterSection />
      </div>
    </div>
  );
}
