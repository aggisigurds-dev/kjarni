/**
 * Geometry + clipboard helpers for images/icons inside a Marks whiteboard.
 * Window chrome lives in windows.ts; the entity itself lives on MarksDoc.
 */

import type { ResizeEdge } from './windows';
import type { WhiteboardItem } from './model';

export const MIN_WHITEBOARD_ITEM_W = 32;
export const MIN_WHITEBOARD_ITEM_H = 32;

export const WHITEBOARD_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export type ItemBounds = { w: number; h: number };

export function isWhiteboardImageType(type: string): boolean {
  if (!type) return false;
  return WHITEBOARD_IMAGE_TYPES.has(type) || type.startsWith('image/');
}

export function clampItemRect(
  rect: { x: number; y: number; w: number; h: number },
  bounds: ItemBounds,
  minW = MIN_WHITEBOARD_ITEM_W,
  minH = MIN_WHITEBOARD_ITEM_H
): { x: number; y: number; w: number; h: number } {
  const maxW = Math.max(minW, Math.round(bounds.w));
  const maxH = Math.max(minH, Math.round(bounds.h));
  const w = Math.max(minW, Math.min(Math.round(rect.w), maxW));
  const h = Math.max(minH, Math.min(Math.round(rect.h), maxH));
  const x = Math.max(0, Math.min(Math.round(rect.x), Math.max(0, maxW - w)));
  const y = Math.max(0, Math.min(Math.round(rect.y), Math.max(0, maxH - h)));
  return { x, y, w, h };
}

export function applyItemMove(
  orig: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  bounds: ItemBounds
): { x: number; y: number; w: number; h: number } {
  return clampItemRect({ ...orig, x: orig.x + dx, y: orig.y + dy }, bounds);
}

export function applyItemResize(
  orig: { x: number; y: number; w: number; h: number },
  edge: ResizeEdge,
  dx: number,
  dy: number,
  bounds: ItemBounds
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = orig;
  if (edge.includes('e')) w = orig.w + dx;
  if (edge.includes('w')) {
    w = orig.w - dx;
    x = orig.x + dx;
  }
  if (edge.includes('s')) h = orig.h + dy;
  if (edge.includes('n')) {
    h = orig.h - dy;
    y = orig.y + dy;
  }
  if (w < MIN_WHITEBOARD_ITEM_W) {
    if (edge.includes('w')) x = orig.x + orig.w - MIN_WHITEBOARD_ITEM_W;
    w = MIN_WHITEBOARD_ITEM_W;
  }
  if (h < MIN_WHITEBOARD_ITEM_H) {
    if (edge.includes('n')) y = orig.y + orig.h - MIN_WHITEBOARD_ITEM_H;
    h = MIN_WHITEBOARD_ITEM_H;
  }
  return clampItemRect({ x, y, w, h }, bounds);
}

export function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const seen = new Set<string>();
  const files: File[] = [];
  const add = (file: File | null) => {
    if (!file || !isWhiteboardImageType(file.type)) return;
    const key = `${file.name}:${file.size}:${file.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  for (const file of Array.from(data.files ?? [])) add(file);
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file') add(item.getAsFile());
  }
  return files;
}

const IMAGE_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i;

export function imageUrlFromText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return '';
  if (IMAGE_URL_RE.test(trimmed)) return trimmed;
  return '';
}

export function imageUrlFromDataTransfer(data: DataTransfer | null): string {
  if (!data) return '';
  const uri = data.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'));
  if (uri && imageUrlFromText(uri)) return uri.trim();
  return imageUrlFromText(data.getData('text/plain'));
}

export function itemAtPoint(
  items: WhiteboardItem[],
  point: { x: number; y: number }
): WhiteboardItem | undefined {
  const hit = [...items]
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
    .reverse()
    .find(
      (item) =>
        point.x >= item.x &&
        point.x <= item.x + item.w &&
        point.y >= item.y &&
        point.y <= item.y + item.h
    );
  return hit;
}
