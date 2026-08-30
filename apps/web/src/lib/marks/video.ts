/**
 * Detect YouTube / Vimeo / file video URLs and build muted hover-preview sources.
 * Pure — safe during SSR. Callers must not mount the player until hover.
 */

import { normalizeUrl } from './model';

export type VideoPreview =
  | { provider: 'youtube'; kind: 'youtube'; id: string; previewUrl: string; src: string }
  | { provider: 'vimeo'; kind: 'vimeo'; id: string; previewUrl: string; src: string }
  | { provider: 'file'; kind: 'file'; previewUrl: string; src: string };

export type HoverVideo = VideoPreview;

const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

const VIMEO_ID =
  /(?:^|\/\/)(?:(?:www|player)\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[/?#]|$)/i;

const FILE_VIDEO = /\.(mp4|webm|ogg)(?:[?#]|$)/i;

export function youtubeId(raw: string): string | null {
  const match = raw.trim().match(YOUTUBE_ID);
  return match?.[1] ?? null;
}

export function vimeoId(raw: string): string | null {
  const match = raw.trim().match(VIMEO_ID);
  return match?.[1] ?? null;
}

export function detectVideo(raw: string): VideoPreview | null {
  const url = raw.trim();
  if (!url) return null;

  const yt = youtubeId(url);
  if (yt) {
    const previewUrl = `https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&controls=0&loop=1&playlist=${yt}&modestbranding=1`;
    return { provider: 'youtube', kind: 'youtube', id: yt, previewUrl, src: previewUrl };
  }

  const vim = vimeoId(url);
  if (vim) {
    const previewUrl = `https://player.vimeo.com/video/${vim}?autoplay=1&muted=1&controls=0&loop=1&background=1`;
    return { provider: 'vimeo', kind: 'vimeo', id: vim, previewUrl, src: previewUrl };
  }

  if (FILE_VIDEO.test(url)) {
    const previewUrl = normalizeUrl(url);
    return { provider: 'file', kind: 'file', previewUrl, src: previewUrl };
  }

  return null;
}

/** Prefer an explicit videoUrl; otherwise derive from the bookmark URL. */
export function hoverVideoFor(link: { url: string; videoUrl?: string }): HoverVideo | null {
  return detectVideo(link.videoUrl || '') ?? detectVideo(link.url);
}

export const videoSourceForLink = hoverVideoFor;

/** Idle still: explicit cover, else a YouTube thumbnail when we have one. */
export function coverForLink(link: {
  url: string;
  coverUrl?: string;
  cover?: string;
  videoUrl?: string;
}): string {
  const explicit = (link.coverUrl || link.cover || '').trim();
  if (explicit) return normalizeUrl(explicit);
  const video = hoverVideoFor(link);
  if (video?.kind === 'youtube') {
    return `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
  }
  return '';
}
