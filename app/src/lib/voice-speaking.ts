type Listener = (speaking: boolean) => void;

let speaking = false;
const listeners = new Set<Listener>();

export function setVoiceSpeaking(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribeVoiceSpeaking(listener: Listener) {
  listeners.add(listener);
  listener(speaking);
  return () => {
    listeners.delete(listener);
  };
}
