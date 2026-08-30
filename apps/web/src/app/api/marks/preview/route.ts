import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createMarksServerClient, MARKS_BUCKET } from '@/lib/marks/cloud';
import { hostOf, normalizeUrl } from '@/lib/marks/model';
import { extractLinkPreview, isHttpUrl, screenshotCoverUrl } from '@/lib/marks/preview';

const MAX_HTML = 1_200_000;
const FETCH_MS = 8000;

function guessExt(url: string, contentType: string): string {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  const match = url.match(/\.(png|jpe?g|webp|gif)(\?|#|$)/i);
  if (!match) return '.jpg';
  return `.${match[1]!.toLowerCase().replace('jpeg', 'jpg')}`;
}

async function cacheCover(imageUrl: string, pageUrl: string): Promise<string> {
  const hash = createHash('sha1').update(pageUrl).digest('hex').slice(0, 18);
  try {
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': 'kjarni-marks/1.0', Accept: 'image/*' },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    });
    if (!response.ok) return imageUrl;
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return imageUrl;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 32 || buffer.byteLength > 5_000_000) return imageUrl;
    const path = `covers/${hash}${guessExt(imageUrl, type)}`;
    const sb = createMarksServerClient();
    const { error } = await sb.storage.from(MARKS_BUCKET).upload(path, buffer, {
      contentType: type.split(';')[0] || 'image/jpeg',
      upsert: true,
    });
    if (error) return imageUrl;
    return sb.storage.from(MARKS_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return imageUrl;
  }
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url') ?? '';
  const url = normalizeUrl(raw);
  if (!url) {
    return NextResponse.json({ error: 'Need a URL.' }, { status: 400 });
  }
  if (url.startsWith('/')) {
    return NextResponse.json({
      title: hostOf(url) || url,
      description: '',
      coverUrl: '',
      source: 'none',
    });
  }
  if (!isHttpUrl(url)) {
    return NextResponse.json({ error: 'Only http(s) URLs can be previewed.' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; kjarni-marks/1.0; +https://github.com/aggisigurds-dev/kjarni)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    });
    const type = response.headers.get('content-type') ?? '';
    if (type.startsWith('image/')) {
      const coverUrl = await cacheCover(url, url);
      return NextResponse.json({ title: hostOf(url), description: '', coverUrl, source: 'og' });
    }
    const html = (await response.text()).slice(0, MAX_HTML);
    const meta = extractLinkPreview(html, response.url || url);
    let coverUrl = meta.image ? await cacheCover(meta.image, url) : '';
    let source: 'og' | 'twitter' | 'screenshot' | 'none' = meta.source;
    if (!coverUrl) {
      coverUrl = screenshotCoverUrl(url);
      source = coverUrl ? 'screenshot' : 'none';
    }
    return NextResponse.json({
      title: meta.title || hostOf(url),
      description: meta.description,
      coverUrl,
      source,
    });
  } catch (error) {
    return NextResponse.json({
      title: hostOf(url),
      description: '',
      coverUrl: screenshotCoverUrl(url),
      source: 'screenshot',
      error: error instanceof Error ? error.message : 'Preview failed',
    });
  }
}
