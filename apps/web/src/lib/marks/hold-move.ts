'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export const HOLD_MS = 400;
export const CANCEL_MOVE_PX = 14;
export const DROP_FOLDER_ATTR = 'data-drop-folder';

export function overKeyForFolder(folderId: string | null): string {
  return folderId == null || folderId === '' ? '__unfiled__' : folderId;
}

/** `undefined` = no folder under the point; `null` = Unfiled. */
export function resolveDropFolder(node: Element | null): string | null | undefined {
  const host = node?.closest(`[${DROP_FOLDER_ATTR}]`);
  if (!host) return undefined;
  const raw = host.getAttribute(DROP_FOLDER_ATTR);
  if (raw === null) return undefined;
  return raw === '' ? null : raw;
}

export function dropFolderFromPoint(x: number, y: number): string | null | undefined {
  if (typeof document === 'undefined') return undefined;
  const el = document.elementFromPoint(x, y);
  return el instanceof Element ? resolveDropFolder(el) : undefined;
}

export type HoldGhost = { x: number; y: number; title: string };

export function useHoldToMoveLink(opts: {
  title: string;
  onOver: (overKey: string) => void;
  onClearOver: () => void;
  onDrop: (folderId: string | null) => void;
}) {
  const [html5Drag, setHtml5Drag] = useState(false);
  const [ghost, setGhost] = useState<HoldGhost | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const gesture = useRef({
    timer: 0,
    startX: 0,
    startY: 0,
    pointerId: -1,
    armed: false,
    suppressClick: false,
  });

  const clearTimer = () => {
    if (gesture.current.timer) {
      window.clearTimeout(gesture.current.timer);
      gesture.current.timer = 0;
    }
  };

  const finish = useCallback((dropped: boolean, x?: number, y?: number) => {
    clearTimer();
    const wasArmed = gesture.current.armed;
    gesture.current.armed = false;
    gesture.current.pointerId = -1;
    setGhost(null);
    optsRef.current.onClearOver();
    if (dropped && wasArmed && x != null && y != null) {
      const folder = dropFolderFromPoint(x, y);
      if (folder !== undefined) optsRef.current.onDrop(folder);
    }
  }, []);

  useEffect(() => {
    setHtml5Drag(!window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (gesture.current.pointerId === -1 || event.pointerId !== gesture.current.pointerId) return;
      const dx = event.clientX - gesture.current.startX;
      const dy = event.clientY - gesture.current.startY;
      if (!gesture.current.armed) {
        if (Math.hypot(dx, dy) > CANCEL_MOVE_PX) {
          clearTimer();
          gesture.current.pointerId = -1;
        }
        return;
      }
      event.preventDefault();
      setGhost({ x: event.clientX, y: event.clientY, title: optsRef.current.title });
      const folder = dropFolderFromPoint(event.clientX, event.clientY);
      optsRef.current.onOver(folder === undefined ? '' : overKeyForFolder(folder));
      const edge = 64;
      if (event.clientY < edge) window.scrollBy(0, -18);
      else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 18);
    };
    const up = (event: PointerEvent) => {
      if (gesture.current.pointerId === -1 || event.pointerId !== gesture.current.pointerId) return;
      finish(gesture.current.armed, event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      clearTimer();
    };
  }, [finish]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.button !== 0 && event.button !== -1) return;
    gesture.current.suppressClick = false;
    gesture.current.startX = event.clientX;
    gesture.current.startY = event.clientY;
    gesture.current.pointerId = event.pointerId;
    clearTimer();
    gesture.current.timer = window.setTimeout(() => {
      gesture.current.armed = true;
      gesture.current.suppressClick = true;
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
      setGhost({ x: gesture.current.startX, y: gesture.current.startY, title: optsRef.current.title });
    }, HOLD_MS);
  };

  const guardClick = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!gesture.current.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current.suppressClick = false;
  };

  const onContextMenu = (event: { preventDefault: () => void }) => {
    if (!html5Drag) event.preventDefault();
  };

  return { html5Drag, ghost, moving: Boolean(ghost), onPointerDown, guardClick, onContextMenu };
}
