export type IslandBloom = {
  blue: number;
  red: number;
  x: number;
  y: number;
};

let bloom: IslandBloom = { blue: 0, red: 0, x: 0, y: 0 };
const listeners = new Set<() => void>();

export function readIslandBloom() {
  return bloom;
}

export function applyIslandBloom(next: IslandBloom) {
  bloom = {
    blue: Number.isFinite(next.blue) ? next.blue : 0,
    red: Number.isFinite(next.red) ? next.red : 0,
    x: Number.isFinite(next.x) ? next.x : 0,
    y: Number.isFinite(next.y) ? next.y : 0,
  };
  const root = document.documentElement;
  root.style.setProperty("--fire-active", String(bloom.blue));
  root.style.setProperty("--fire-active-red", String(bloom.red));
  listeners.forEach((listener) => listener());
}

export function subscribeIslandBloom(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
