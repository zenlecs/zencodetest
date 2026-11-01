/**
 * ZenOS Unified Asset URL Resolver
 * Routes asset URLs through zenos-asset://app/ in Electron and / in standard web.
 */
export function getAssetUrl(assetPath: string): string {
  if (!assetPath) return "";
  const cleanPath = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  if (typeof window !== "undefined" && (window as any).electron) {
    return `zenos-asset://app/${cleanPath}`;
  }
  return `/${cleanPath}`;
}
