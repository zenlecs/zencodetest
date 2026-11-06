type Listener = (speaking: boolean) => void;
type CueListener = (cue: string) => void;

let speaking = false;
let cue = "";
const listeners = new Set<Listener>();
const cueListeners = new Set<CueListener>();

function broadcastIslandVoice() {
  if (typeof window === "undefined") return;
  if (!window.electron || window.zenosWindowRole === "island") return;
  window.electron.send("island-voice", { speaking, cue });
}

export function setVoiceSpeaking(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  listeners.forEach((listener) => listener(next));
  if (!next) setVoiceCue("");
  broadcastIslandVoice();
}

export function subscribeVoiceSpeaking(listener: Listener) {
  listeners.add(listener);
  listener(speaking);
  return () => {
    listeners.delete(listener);
  };
}

export function setVoiceCue(next: string) {
  const trimmed = next.replace(/\s+/g, " ").trim().slice(0, 32);
  if (cue === trimmed) return;
  cue = trimmed;
  cueListeners.forEach((listener) => listener(cue));
  broadcastIslandVoice();
}

export function subscribeVoiceCue(listener: CueListener) {
  cueListeners.add(listener);
  listener(cue);
  return () => {
    cueListeners.delete(listener);
  };
}
