export const DYNAMIC_ISLAND_KEY = "zenlecs.dynamicIsland";
export const DYNAMIC_ISLAND_OFFSET_KEY = "zenlecs.dynamicIsland.offset";

try {
  localStorage.removeItem(DYNAMIC_ISLAND_KEY);
  localStorage.removeItem("zenlecs.dynamicIsland.restored");
} catch {
  // private mode
}

export function readDynamicIsland(): boolean {
  return true;
}

export function useDynamicIsland() {
  return true;
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
