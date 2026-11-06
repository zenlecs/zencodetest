import { useEffect, useState } from "react";

export const DYNAMIC_ISLAND_KEY = "zenlecs.dynamicIsland";
export const DYNAMIC_ISLAND_OFFSET_KEY = "zenlecs.dynamicIsland.offset";

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

const DYNAMIC_ISLAND_RESTORED = "zenlecs.dynamicIsland.restored";

function restoreIslandOnce() {
  try {
    if (localStorage.getItem(DYNAMIC_ISLAND_RESTORED) === "1") return;
    localStorage.removeItem(DYNAMIC_ISLAND_KEY);
    localStorage.setItem(DYNAMIC_ISLAND_RESTORED, "1");
  } catch {
    // private mode
  }
}

restoreIslandOnce();

export function readDynamicIsland(): boolean {
  try {
    return localStorage.getItem(DYNAMIC_ISLAND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setDynamicIslandEnabled(enabled: boolean) {
  try {
    localStorage.setItem(DYNAMIC_ISLAND_KEY, enabled ? "1" : "0");
  } catch {
    // private mode
  }
  listeners.forEach((listener) => listener(enabled));
  window.electron?.send("island-visibility", enabled);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== DYNAMIC_ISLAND_KEY) return;
    listeners.forEach((listener) => listener(event.newValue !== "0"));
  });
}

export function subscribeDynamicIsland(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDynamicIsland() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setEnabled(readDynamicIsland());
    const unsubscribe = subscribeDynamicIsland(setEnabled);
    if (!window.electron) return unsubscribe;
    const onVisible = (visible: boolean) => setEnabled(Boolean(visible));
    window.electron.receive("island-visibility", onVisible);
    return () => {
      unsubscribe();
      window.electron?.removeListener("island-visibility", onVisible);
    };
  }, []);
  return enabled;
}

export function readIslandOffset(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(DYNAMIC_ISLAND_OFFSET_KEY);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = typeof parsed.x === "number" && Number.isFinite(parsed.x) ? parsed.x : 0;
    const y = typeof parsed.y === "number" && Number.isFinite(parsed.y) ? parsed.y : 0;
    return { x, y };
  } catch {
    return { x: 0, y: 0 };
  }
}

export function writeIslandOffset(offset: { x: number; y: number }) {
  try {
    localStorage.setItem(DYNAMIC_ISLAND_OFFSET_KEY, JSON.stringify(offset));
  } catch {
    // private mode
  }
}
