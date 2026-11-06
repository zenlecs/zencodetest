import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { motion, AnimatePresence } from "motion/react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { PreferencesProvider } from "@/lib/preferences-provider";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { FloatingNav } from "@/components/layout/floating-nav";
import { LiveChatToggle } from "@/components/layout/live-chat-toggle";
import { Logo } from "@/components/layout/logo";
import { Header } from "@/components/layout/header";
import { DynamicIsland } from "@/components/layout/dynamic-island";
import { bindIslandNotifications } from "@/lib/island-bridge";
import { applyIslandBloom, type IslandBloom } from "@/lib/island-bloom";
import { readDynamicIsland, useDynamicIsland } from "@/lib/dynamic-island";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import WalletPage from "@/pages/wallet";
import PresentationsPage from "@/pages/presentations";
import CommunicationsPage from "@/pages/communications";
import AccountingPage from "@/pages/accounting";
import ProfilePage from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import BrowserPage from "@/pages/browser";
import StudioPage from "@/pages/studio";
import AIChatPage from "@/pages/chat";
import { WebSocketProvider } from "@/lib/contexts/websocket-context";
import { CallProvider } from "@/lib/contexts/call-context";
import { GlobalCallOverlay } from "@/components/layout/global-call-overlay";

const isElectron = !!window.electron;
const isIslandWindow = window.location.hash.includes("/standalone/island");

function useIslandOverlay() {
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!window.electron) return;
    let alive = true;
    window.electron.invoke("island-supported")
      .then((supported) => {
        if (alive) setOverlay(supported === true);
      })
      .catch(() => {
        if (alive) setOverlay(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return overlay;
}

function IslandHostBridge({ overlay }: { overlay: boolean }) {
  const [, setLocation] = useLocation();
  const enabled = useDynamicIsland();

  useEffect(() => {
    if (!overlay || window.zenosWindowRole === "island") return;
    window.electron?.send("island-visibility", readDynamicIsland());
  }, [enabled, overlay]);

  useEffect(() => {
    if (!isElectron || window.zenosWindowRole === "island") return;
    const onNav = (path: string) => {
      if (typeof path === "string" && path.startsWith("/")) setLocation(path);
    };
    window.electron?.receive("island-navigate", onNav);
    return () => window.electron?.removeListener("island-navigate", onNav);
  }, [setLocation]);

  useEffect(() => {
    if (!isElectron || window.zenosWindowRole === "island") return;
    return bindIslandNotifications();
  }, []);

  return null;
}

function IslandBloomBridge() {
  useEffect(() => {
    if (!window.electron || window.zenosWindowRole === "island") return;
    const onBloom = (payload: IslandBloom) => {
      if (!payload || typeof payload.x !== "number") return;
      applyIslandBloom(payload);
    };
    window.electron.receive("island-bloom", onBloom);
    return () => window.electron?.removeListener("island-bloom", onBloom);
  }, []);
  return null;
}

function IslandSurface() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) root.style.overflow = "visible";
    return bindIslandNotifications();
  }, []);

  return (
    <WouterRouter hook={useHashLocation}>
      <div className="relative h-screen w-screen overflow-visible bg-transparent">
        <DynamicIsland />
      </div>
    </WouterRouter>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const islandOverlay = useIslandOverlay();

  return (
    <div className="relative h-screen w-full bg-background flex flex-col rounded-xl overflow-hidden border border-border/30 shadow-2xl transition-[padding,margin,border-radius,background-color] duration-500 ease-out">
      <Logo />
      <FloatingNav />
      <LiveChatToggle />
      <div className="pl-20 flex-1 min-h-0 min-w-0 flex flex-col transition-all duration-500 ease-out">
        <Header />
        <main className="flex-1 min-h-0 min-w-0 flex flex-col relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="h-full w-full min-h-0 min-w-0 overflow-hidden"
            >
              <WouterRouter hook={() => [location, navigate] as any}>
                {children}
              </WouterRouter>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {(!isElectron || !islandOverlay) && <DynamicIsland />}
      <IslandHostBridge overlay={islandOverlay} />
      <GlobalCallOverlay />
    </div>
  );
}

function ProtectedRoutes() {
  return (
    <RequireAuth>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full h-full"
      >
        <AppLayout>
          <Switch>
            <Route path="/os" component={Dashboard} />
            <Route path="/os/studio" component={StudioPage} />
            <Route path="/os/cases" component={StudioPage} />
            <Route path="/os/wallet" component={WalletPage} />
            <Route path="/os/presentations" component={PresentationsPage} />
            <Route path="/os/communications" component={CommunicationsPage} />
            <Route path="/os/accounting" component={AccountingPage} />
            <Route path="/os/profile" component={ProfilePage} />
            <Route path="/os/settings" component={SettingsPage} />
            <Route path="/os/browser" component={BrowserPage} />
            <Route path="/os/chat" component={AIChatPage} />
            <Route path="/os/ai" component={AIChatPage} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </motion.div>
    </RequireAuth>
  );
}

function StandaloneRoutes() {
  return (
    <RequireAuth>
      <div className="h-screen w-screen overflow-hidden bg-transparent p-0 m-0" style={{ clipPath: "inset(0 round 24px)" }}>
        <Switch>
          <Route path="/standalone/communications" component={CommunicationsPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </RequireAuth>
  );
}

function RootRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/os");
  }, [setLocation]);

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      Yönlendiriliyor...
    </div>
  );
}

function Router() {
  return (
    <WouterRouter hook={isElectron ? useHashLocation : undefined}>
      <Switch>
        <Route path="/" component={RootRedirect} />
        <Route path="/os">
          <ProtectedRoutes />
        </Route>
        <Route path="/os/:rest*">
          <ProtectedRoutes />
        </Route>
        <Route path="/standalone/:rest*">
          <StandaloneRoutes />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  if (isIslandWindow) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <IslandSurface />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PreferencesProvider>
          <TooltipProvider delayDuration={0}>
            <AuthProvider>
              <WebSocketProvider>
                <CallProvider>
                  <Router />
                  <IslandBloomBridge />
                  <Toaster />
                </CallProvider>
              </WebSocketProvider>
            </AuthProvider>
          </TooltipProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
