/**
 * Liquid Glass — physically-inspired backdrop displacement map.
 *
 * The map encodes a lensing vector field in the R (x) and G (y) channels of a
 * PNG, which `feDisplacementMap` reads to bend the backdrop near the glass rim.
 * Neutral grey (128) means "no displacement"; values around it push pixels in
 * or out along the rounded-rectangle normal.
 *
 * The bezel profile follows a squircle (the shape Apple uses for continuous
 * corners), so the transition from the rim into the flat center stays smooth
 * even on tall panels.
 */

export interface DisplacementOptions {
  /** Corner radius of the surface, in CSS px. */
  radius?: number;
  /** Width of the refractive rim, in CSS px. */
  bezel?: number;
  /** 0–1, how strongly the rim bends the backdrop. */
  strength?: number;
}

const MAX_MAP_EDGE = 480;

function roundedRectDistance(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const halfW = width / 2;
  const halfH = height / 2;
  const qx = Math.abs(x - halfW) - (halfW - radius);
  const qy = Math.abs(y - halfH) - (halfH - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

export function createDisplacementMap(
  width: number,
  height: number,
  { radius = 28, bezel = 34, strength = 1 }: DisplacementOptions = {},
): string | null {
  if (typeof document === "undefined" || width < 2 || height < 2) return null;

  // Keep the field cheap to generate; the browser stretches it to the surface.
  const scale = Math.min(1, MAX_MAP_EDGE / Math.max(width, height));
  const mapWidth = Math.max(2, Math.round(width * scale));
  const mapHeight = Math.max(2, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = mapWidth;
  canvas.height = mapHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const image = ctx.createImageData(mapWidth, mapHeight);
  const data = image.data;

  const mapRadius = Math.min(radius * scale, mapWidth / 2, mapHeight / 2);
  const mapBezel = Math.max(
    2,
    Math.min(bezel * scale, Math.min(mapWidth, mapHeight) / 2),
  );

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const index = (y * mapWidth + x) * 4;

      const distance = roundedRectDistance(
        x + 0.5,
        y + 0.5,
        mapWidth,
        mapHeight,
        mapRadius,
      );
      const depth = -distance;

      let magnitude = 0;
      if (depth > 0 && depth < mapBezel) {
        const t = depth / mapBezel;
        // Smooth squircle-ish lens profile: zero at the outer edge, zero at
        // the flat interior, maximum pressure halfway through the bezel.
        const profile = Math.sin(Math.PI * t);
        magnitude = Math.pow(profile, 1.25) * strength;
      }

      if (magnitude > 0.0001) {
        const dx =
          roundedRectDistance(x + 1.5, y + 0.5, mapWidth, mapHeight, mapRadius) -
          roundedRectDistance(x - 0.5, y + 0.5, mapWidth, mapHeight, mapRadius);
        const dy =
          roundedRectDistance(x + 0.5, y + 1.5, mapWidth, mapHeight, mapRadius) -
          roundedRectDistance(x + 0.5, y - 0.5, mapWidth, mapHeight, mapRadius);
        const length = Math.hypot(dx, dy) || 1;

        // SDF points outward; light entering glass is displaced inward.
        const nx = -dx / length;
        const ny = -dy / length;

        data[index] = Math.round(128 + nx * 127 * magnitude);
        data[index + 1] = Math.round(128 + ny * 127 * magnitude);
      } else {
        data[index] = 128;
        data[index + 1] = 128;
      }

      data[index + 2] = 128;
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
