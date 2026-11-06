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
    return;
  }
  window.electron.receive("island-voice-state", (payload: { active?: boolean }) => {
    if (typeof payload?.active === "boolean") emit(payload.active);
  });
  window.electron.receive("island-bloom", (payload: { voiceActive?: boolean; x?: number }) => {
    if (!payload || typeof payload.voiceActive !== "boolean" || typeof payload.x === "number") return;
    emit(payload.voiceActive);
  });
}

installVoiceIpc();

export function setVoiceActive(next: boolean) {
  emit(next);
}

function publishVoiceActive(next: boolean) {
  const electron = window.electron;
  if (!electron) return;
  if (window.zenosWindowRole === "island") {
    electron.send("island-bloom", { voiceActive: next });
    return;
  }
  electron.send("island-voice", { active: next });
}

export function toggleVoiceActive() {
  const next = !active;
  emit(next);
  if (window.zenosWindowRole === "island") {
    publishVoiceActive(next);
    return;
  }
  void supportsOverlay().then((overlay) => {
    if (overlay && readDynamicIsland()) publishVoiceActive(next);
  });
}

export function stopVoiceAssistant() {
  if (!active) return;
  emit(false);
  if (window.zenosWindowRole === "island" || (overlayKnown && readDynamicIsland())) {
    publishVoiceActive(false);
  }
}
