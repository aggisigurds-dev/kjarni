import { normalizeUrl } from './model';

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

export function screenshotCoverUrl(pageUrl: string): string {
  const absolute = normalizeUrl(pageUrl);
  if (!absolute || absolute.startsWith('/')) return '';
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(absolute)}?w=800`;
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
