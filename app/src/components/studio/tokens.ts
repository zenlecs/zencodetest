/** Apple design tokens for Studio NeoGraph (appledesign.md) */
export const apple = {
  primary: "#0066cc",
  primaryFocus: "#0071e3",
  primaryOnDark: "#2997ff",
  ink: "#1d1d1f",
  bodyOnDark: "#ffffff",
  bodyMuted: "#cccccc",
  inkMuted80: "#333333",
  inkMuted48: "#7a7a7a",
  hairline: "rgba(255,255,255,0.08)",
  hairlineLight: "rgba(0,0,0,0.08)",
  canvas: "#ffffff",
  parchment: "#f5f5f7",
  pearl: "#fafafc",
  tile1: "#272729",
  tile2: "#2a2a2c",
  tile3: "#252527",
  black: "#000000",
  chip: "rgba(210,210,215,0.64)",
  // Studio dark chrome surfaces
  chrome: "rgba(29,29,31,0.78)",
  chromeSolid: "#1d1d1f",
  card: "#2a2a2c",
  cardHover: "#2f2f31",
  canvasBg: "hsl(var(--background))",
  gridDot: "rgba(148, 163, 184, 0.28)",
  edge: "rgba(41,151,255,0.55)",
  labelBg: "#1d1d1f",
  danger: "#ff453a",
  success: "#30d158",
  warning: "#f5a623",
  purple: "#bf5af2",
} as const;

export const appleFont =
  "'Google Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export const appleSpring = { type: "spring" as const, stiffness: 420, damping: 32 };
export const appleSheetSpring = { type: "spring" as const, stiffness: 340, damping: 34 };
