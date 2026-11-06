export type VoiceSpectrum = {
  level: number;
  low: number;
  mid: number;
  high: number;
  centroid: number;
};

type Listener = (spectrum: VoiceSpectrum) => void;

const REST: VoiceSpectrum = { level: 0, low: 0, mid: 0, high: 0, centroid: 0.5 };
let frame: VoiceSpectrum = { ...REST };
const listeners = new Set<Listener>();

function damp(prev: number, next: number, rise: number, fall: number) {
  const rate = next > prev ? rise : fall;
  return prev + (next - prev) * rate;
}

function emit(next: VoiceSpectrum) {
  frame = next;
  listeners.forEach((listener) => listener(frame));
}

export function subscribeVoiceSpectrum(listener: Listener) {
  listeners.add(listener);
  listener(frame);
  return () => {
    listeners.delete(listener);
  };
}

export function clearVoiceSpectrum() {
  emit({ ...REST });
}

function average(bins: Uint8Array, from: number, to: number) {
  const start = Math.max(0, Math.floor(from));
  const end = Math.max(start + 1, Math.min(bins.length, Math.floor(to)));
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += bins[i];
  return sum / (end - start) / 255;
}

export function sampleAssistantOutput(bins: Uint8Array, volume: number) {
  const count = bins.length;
  if (!count) {
    clearVoiceSpectrum();
    return;
  }
  const low = average(bins, 0, count * 0.22);
  const mid = average(bins, count * 0.22, count * 0.58);
  const high = average(bins, count * 0.58, count);
  let energy = 0;
  let weighted = 0;
  const step = Math.max(1, Math.floor(count / 48));
  for (let i = 0; i < count; i += step) {
    const value = bins[i];
    energy += value;
    weighted += (i / count) * value;
  }
  const level = Math.min(1, Math.max(0, volume, low * 0.55 + mid * 0.35 + high * 0.2));
  const audible = level >= 0.02;
  const centroid = !audible || energy < 8 ? 0.5 : Math.min(1, Math.max(0, weighted / energy));
  emit({
    level: audible ? damp(frame.level, level, 0.42, 0.14) : damp(frame.level, 0, 0.14, 0.14),
    low: audible ? damp(frame.low, low, 0.34, 0.12) : damp(frame.low, 0, 0.12, 0.12),
    mid: audible ? damp(frame.mid, mid, 0.36, 0.12) : damp(frame.mid, 0, 0.12, 0.12),
    high: audible ? damp(frame.high, high, 0.4, 0.14) : damp(frame.high, 0, 0.14, 0.14),
    centroid: damp(frame.centroid, centroid, 0.16, 0.1),
  });
}
