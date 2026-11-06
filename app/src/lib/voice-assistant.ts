import { useEffect, useState } from "react";
import { readDynamicIsland } from "@/lib/dynamic-island";

type Listener = (active: boolean) => void;

let active = false;
let installed = false;
let overlayKnown: boolean | null = null;
let overlayWait: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

function emit(next: boolean) {
  if (active === next) return;
  active = next;
  listeners.forEach((listener) => listener(active));
}

export function readVoiceActive() {
  return active;
}

export function subscribeVoiceActive(listener: Listener) {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
}

export function useVoiceActive() {
  const [value, setValue] = useState(readVoiceActive);
  useEffect(() => subscribeVoiceActive(setValue), []);
  return value;
}

function supportsOverlay(): Promise<boolean> {
  if (!window.electron || window.zenosWindowRole === "island") return Promise.resolve(false);
  if (overlayKnown !== null) return Promise.resolve(overlayKnown);
  if (!overlayWait) {
    overlayWait = window.electron.invoke("island-supported")
      .then((value) => {
        overlayKnown = value === true;
        return overlayKnown;
      })
      .catch(() => {
        overlayKnown = false;
        return false;
      });
  }
  return overlayWait;
}

function installVoiceIpc() {
  if (installed || typeof window === "undefined" || !window.electron) return;
  installed = true;
  if (window.zenosWindowRole === "island") {
    window.electron.receive("island-voice-control", (payload: { active?: boolean }) => {
      if (typeof payload?.active === "boolean") emit(payload.active);
    });
    window.electron.send("island-voice-sync");
    return;
  }
  window.electron.receive("island-voice-state", (payload: { active?: boolean }) => {
    if (typeof payload?.active === "boolean") emit(payload.active);
  });
}

installVoiceIpc();

export function toggleVoiceActive() {
  if (window.zenosWindowRole === "island") {
    window.electron?.send("island-voice-control", { toggle: true });
    return;
  }
  void supportsOverlay().then((overlay) => {
    if (overlay && readDynamicIsland()) {
      window.electron?.send("island-voice-control", { toggle: true });
      return;
    }
    emit(!active);
  });
}

export function stopVoiceAssistant() {
  if (!active) return;
  if (window.zenosWindowRole === "island" || (overlayKnown && readDynamicIsland())) {
    window.electron?.send("island-voice-control", { active: false });
    return;
  }
  emit(false);
}
