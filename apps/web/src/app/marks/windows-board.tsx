'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { childCategories, type MarksDoc } from '@/lib/marks/model';
import {
  UNFILED_WINDOW_ID,
  applyMove,
  applyResize,
  boardExtent,
  folderWindowRect,
  snapWindowRect,
  unfiledWindowRect,
  type MarksWindowRect,
  type ResizeEdge,
} from '@/lib/marks/windows';
import { PANEL, WINDOW_BOARD } from './ui';

type Gesture =
  | { type: 'move'; id: string; pointerId: number; startX: number; startY: number; origin: MarksWindowRect }
  | {
      type: 'resize';
      id: string;
      pointerId: number;
      edge: ResizeEdge;
      startX: number;
      startY: number;
      origin: MarksWindowRect;
    };

const RESIZE_HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: 'n', className: 'left-2 right-2 top-0 h-1.5 cursor-n-resize' },
  { edge: 's', className: 'bottom-0 left-2 right-2 h-1.5 cursor-s-resize' },
  { edge: 'e', className: 'top-2 bottom-2 right-0 w-1.5 cursor-e-resize' },
  { edge: 'w', className: 'top-2 bottom-2 left-0 w-1.5 cursor-w-resize' },
  { edge: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-ne-resize' },
  { edge: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nw-resize' },
  { edge: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
];

function isChromeInteractive(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, button, select, textarea, a, [data-no-drag]'));
}

export function MarksWindowDesk({
  doc,
  onLayout,
  renderWindow,
}: {
  doc: MarksDoc;
  onLayout?: (id: string, rect: MarksWindowRect) => void;
  renderWindow: (id: string) => ReactNode;
}) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  gestureRef.current = gesture;
  const [preview, setPreview] = useState<{ id: string; rect: MarksWindowRect } | null>(null);
  const [stack, setStack] = useState<string[]>([]);

  const roots = childCategories(doc, null);
  const unfiledOrigin = unfiledWindowRect(doc, roots.length);

  const items = useMemo(() => {
    const rows = roots.map((folder, index) => {
      const origin = folderWindowRect(folder, index);
      return {
        id: folder.id,
        name: folder.name,
        origin,
        rect: preview?.id === folder.id ? preview.rect : origin,
      };
    });
    rows.push({
      id: UNFILED_WINDOW_ID,
      name: 'Unfiled',
      origin: unfiledOrigin,
      rect: preview?.id === UNFILED_WINDOW_ID ? preview.rect : unfiledOrigin,
    });
    return rows;
  }, [preview, roots, unfiledOrigin]);

  const extent = boardExtent(items.map((item) => item.rect));
  const raise = (id: string) => setStack((current) => [...current.filter((row) => row !== id), id]);
  const zOf = (id: string) => {
    const order = stack.indexOf(id);
    return order === -1 ? 1 : 10 + order;
  };

  const begin = (next: Gesture) => {
    gestureRef.current = next;
    setGesture(next);
    setPreview({ id: next.id, rect: next.origin });
    raise(next.id);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    setPreview({
      id: current.id,
      rect: current.type === 'move' ? applyMove(current.origin, dx, dy) : applyResize(current.origin, current.edge, dx, dy),
    });
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const rect =
      current.type === 'move' ? applyMove(current.origin, dx, dy) : applyResize(current.origin, current.edge, dx, dy);
    gestureRef.current = null;
    setGesture(null);
    setPreview(null);
    if (current.type === 'resize' || Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      onLayout?.(current.id, snapWindowRect(rect));
    }
  };

  return (
    <div
      className={`hidden md:block ${WINDOW_BOARD} ${gesture ? 'cursor-grabbing select-none' : ''}`}
      data-marks-layout="windows"
      style={{ minWidth: extent.width, minHeight: Math.max(extent.height, 640), height: Math.max(extent.height, 640) }}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {items.map((item) => (
        <section
          key={item.id}
          data-marks-window={item.id}
          className={`${PANEL} absolute flex flex-col overflow-hidden`}
          style={{ left: item.rect.x, top: item.rect.y, width: item.rect.w, height: item.rect.h, zIndex: zOf(item.id) }}
          onPointerDown={() => raise(item.id)}
        >
          <div
            data-marks-titlebar={item.id}
            className={`flex shrink-0 items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-2 py-1.5 ${
              gesture?.id === item.id && gesture.type === 'move' ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ touchAction: 'none' }}
            onPointerDown={(event) => {
              if (event.button !== 0 || isChromeInteractive(event.target)) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              begin({
                type: 'move',
                id: item.id,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                origin: item.origin,
              });
            }}
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{item.name}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{renderWindow(item.id)}</div>
          {RESIZE_HANDLES.map((handle) => (
            <div
              key={handle.edge}
              data-resize={handle.edge}
              className={`absolute z-20 ${handle.className}`}
              style={{ touchAction: 'none' }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                begin({
                  type: 'resize',
                  id: item.id,
                  edge: handle.edge,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  origin: item.origin,
                });
              }}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
