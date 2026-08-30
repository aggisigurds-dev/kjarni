/** Pick a FotoWeb rendition that TurboPaint can put on the board without
 * freezing the tab. Archive originals are often 9k-wide LZW TIF (~70 MP,
 * ~280 MB RGBA). UTIF decode is fast; allocating that canvas on a phone
 * is what "stoppar á miðri leið" looked like. Prefer the cache JPEG
 * (typically 6006 px) and only fall back to the original TIF. */

export type FotowebRendition = {
  href?: string;
  original?: boolean;
  width?: number;
  height?: number;
};

export type FotowebQuickRendition = {
  href?: string;
  size?: number;
  width?: number;
  height?: number;
};

export type FotowebAsset = {
  filename?: string;
  renditions?: FotowebRendition[];
  quickRenditions?: FotowebQuickRendition[];
};

export type FotowebCandidate = {
  href: string;
  name: string;
  kind: "jpeg" | "original";
};

/** Longest edge of the preferred cache JPEG. Below this we still try TIF. */
export const FOTOWEB_BOARD_JPEG_MIN = 2400;

export function fotowebBaseName(asset: FotowebAsset, pathname: string): string {
  const raw = asset.filename || pathname.split("/").pop() || "teikning";
  return raw.replace(/\.info$/i, "");
}

function quickLongEdge(q: FotowebQuickRendition): number {
  return Math.max(q.width ?? 0, q.height ?? 0, q.size ?? 0);
}

export function fotowebDownloadOrder(asset: FotowebAsset, pathname: string): FotowebCandidate[] {
  const baseName = fotowebBaseName(asset, pathname);
  const jpegName = baseName.replace(/\.tiff?$/i, "") + ".jpg";
  const out: FotowebCandidate[] = [];

  const jpegs = [...(asset.quickRenditions ?? [])]
    .filter((q) => q.href && quickLongEdge(q) >= FOTOWEB_BOARD_JPEG_MIN)
    .sort((a, b) => quickLongEdge(b) - quickLongEdge(a));
  for (const q of jpegs) {
    out.push({ href: q.href as string, name: jpegName, kind: "jpeg" });
  }

  const original = asset.renditions?.find((r) => r.original && r.href);
  if (original?.href) {
    out.push({ href: original.href, name: baseName, kind: "original" });
  }

  const leftover = [...(asset.quickRenditions ?? [])]
    .filter((q) => q.href && quickLongEdge(q) < FOTOWEB_BOARD_JPEG_MIN)
    .sort((a, b) => quickLongEdge(b) - quickLongEdge(a));
  for (const q of leftover) {
    out.push({ href: q.href as string, name: jpegName, kind: "jpeg" });
  }

  return out;
}
