import { normalizeUrl } from './model';
import { SQUARE_COVER_PX } from './square-cover';

export interface LinkPreviewMeta {
  title: string;
  description: string;
  image: string;
  source: 'og' | 'twitter' | 'none';
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const propertyFirst = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i'
    );
    const contentFirst = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      'i'
    );
    const match = html.match(propertyFirst) ?? html.match(contentFirst);
    if (match?.[1]) return decode(match[1]);
  }
  return '';
}

export function resolvePreviewUrl(image: string, pageUrl: string): string {
  const trimmed = image.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return '';
  try {
    return new URL(trimmed, normalizeUrl(pageUrl) || undefined).href;
  } catch {
    return normalizeUrl(trimmed);
  }
}

export function extractLinkPreview(html: string, pageUrl = ''): LinkPreviewMeta {
  const ogImage = metaContent(html, ['og:image', 'og:image:url', 'og:image:secure_url']);
  const twitterImage = metaContent(html, ['twitter:image', 'twitter:image:src']);
  const imageRaw = ogImage || twitterImage;
  const title =
    metaContent(html, ['og:title', 'twitter:title']) ||
    decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = metaContent(html, ['og:description', 'twitter:description', 'description']);
  return {
    title,
    description,
    image: resolvePreviewUrl(imageRaw, pageUrl),
    source: ogImage ? 'og' : twitterImage ? 'twitter' : 'none',
  };
}

/**
 * Page-screenshot image URL. 2026-09-02: s.wordpress.com/mshots answers 403 to
 * everything now (the old "Generating preview…" placeholder was all anyone got),
 * so this points at Microlink, which renders the page — YouTube video frames
 * included. Free tier is ~25 renders/day per caller, so callers fetch the image
 * ONCE (fetchScreenshotBlob) and store it in our own bucket instead of using
 * this URL as a permanent <img src>.
 */
export function screenshotCoverUrl(pageUrl: string): string {
  const absolute = normalizeUrl(pageUrl);
  if (!absolute || absolute.startsWith('/')) return '';
  return `https://api.microlink.io/?url=${encodeURIComponent(absolute)}&screenshot=true&meta=false&embed=screenshot.url`;
}

/** Second opinion when Microlink is rate-limited or down. */
export function screenshotFallbackUrl(pageUrl: string): string {
  const absolute = normalizeUrl(pageUrl);
  if (!absolute || absolute.startsWith('/')) return '';
  return `https://image.thum.io/get/width/${SQUARE_COVER_PX * 2}/crop/${SQUARE_COVER_PX * 2}/noanimate/${absolute}`;
}

/** Fetch a page screenshot as an image blob (Microlink first, thum.io as fallback). */
export async function fetchScreenshotBlob(pageUrl: string): Promise<Blob> {
  const primary = screenshotCoverUrl(pageUrl);
  if (!primary) throw new Error('Need a web URL for a screenshot.');
  const grab = async (url: string): Promise<Blob> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Screenshot service answered ${response.status}.`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size < 1_000) throw new Error('Screenshot service returned no image.');
    return blob;
  };
  try {
    return await grab(primary);
  } catch (error) {
    try {
      return await grab(screenshotFallbackUrl(pageUrl));
    } catch {
      throw error instanceof Error ? error : new Error('Screenshot failed.');
    }
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
