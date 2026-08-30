'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { MarkWhiteboard, WhiteboardItem } from '@/lib/marks/model';
import {
  applyItemMove,
  applyItemResize,
  filesFromDataTransfer,
  imageUrlFromDataTransfer,
  imageUrlFromText,
} from '@/lib/marks/whiteboards';
import type { ResizeEdge } from '@/lib/marks/windows';
import { ACTION_TINY } from './ui';

const ITEM_HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-ne-resize' },
  { edge: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nw-resize' },
  { edge: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
];

type ItemGesture =
  | { type: 'move'; id: string; pointerId: number; startX: number; startY: number; origin: WhiteboardItem }
  | {
      type: 'resize';
      id: string;
      pointerId: number;
      edge: ResizeEdge;
      startX: number;
      startY: number;
      origin: WhiteboardItem;
    };

function boundsOf(el: HTMLElement | null): { w: number; h: number } {
  if (!el) return { w: 360, h: 240 };
  return { w: Math.max(64, el.clientWidth), h: Math.max(64, el.clientHeight) };
}

export function WhiteboardCanvas({
  board,
  active,
  onActive,
  onAddFiles,
  onAddUrl,
  onMoveItem,
  onRemoveItem,
  onSelectItem,
}: {
  board: MarkWhiteboard;
  active?: boolean;
  onActive?: (id: string) => void;
  onAddFiles: (files: File[], at?: { x: number; y: number }) => void;
  onAddUrl: (src: string, at?: { x: number; y: number }) => void;
  onMoveItem: (itemId: string, rect: Pick<WhiteboardItem, 'x' | 'y' | 'w' | 'h' | 'z'>) => void;
  onRemoveItem?: (itemId: string) => void;
  onSelectItem?: (itemId: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 24, y: 24 });
  const gestureRef = useRef<ItemGesture | null>(null);
  const [gesture, setGesture] = useState<ItemGesture | null>(null);
  const [preview, setPreview] = useState<WhiteboardItem | null>(null);
  const [selected, setSelected] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  gestureRef.current = gesture;

  const items = board.items.map((item) => (preview?.id === item.id ? preview : item));

  const markPointer = (event: { clientX: number; clientY: number }) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    pointerRef.current = { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const placeAt = () => ({ x: pointerRef.current.x - 40, y: pointerRef.current.y - 40 });

  const begin = (next: ItemGesture) => {
    gestureRef.current = next;
    setGesture(next);
    setPreview(next.origin);
    setSelected(next.id);
    onSelectItem?.(next.id);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    markPointer(event);
    const current = gestureRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const bounds = boundsOf(canvasRef.current);
    const next =
      current.type === 'move'
        ? applyItemMove(current.origin, dx, dy, bounds)
        : applyItemResize(current.origin, current.edge, dx, dy, bounds);
    setPreview({ ...current.origin, ...next });
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const bounds = boundsOf(canvasRef.current);
    const next =
      current.type === 'move'
        ? applyItemMove(current.origin, dx, dy, bounds)
        : applyItemResize(current.origin, current.edge, dx, dy, bounds);
    gestureRef.current = null;
    setGesture(null);
    setPreview(null);
    onMoveItem(current.id, { ...next, z: (current.origin.z ?? 1) + 1 });
  };

  useEffect(() => {
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const files = filesFromDataTransfer(event.clipboardData);
      const url = imageUrlFromDataTransfer(event.clipboardData) || imageUrlFromText(event.clipboardData?.getData('text/plain') ?? '');
      if (!files.length && !url) return;
      event.preventDefault();
      if (files.length) onAddFiles(files, placeAt());
      else if (url) onAddUrl(url, placeAt());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [active, onAddFiles, onAddUrl]);

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((row) => row.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `paste.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (files.length) {
        onAddFiles(files, placeAt());
        return;
      }
      const text = await navigator.clipboard.readText();
      const url = imageUrlFromText(text);
      if (url) onAddUrl(url, placeAt());
    } catch {
      /* clipboard may be empty or blocked */
    }
  };

  return (
    <div
      className={`flex h-full min-h-[10rem] flex-col ${active ? 'ring-1 ring-inset ring-emerald-400/70' : ''}`}
      data-marks-whiteboard={board.id}
      onPointerEnter={() => {
        onActive?.(board.id);
      }}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-stone-100 bg-white/80 px-2 py-1">
        <button type="button" className={ACTION_TINY} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-3 w-3" />
          Add image
        </button>
        <button type="button" className={ACTION_TINY} onClick={() => void pasteFromClipboard()}>
          Paste
        </button>
        {selected && onRemoveItem ? (
          <button type="button" className={`${ACTION_TINY} text-rose-600`} onClick={() => onRemoveItem(selected)}>
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        ) : null}
        <span className="ml-auto text-[0.6rem] text-stone-400">
          {over ? 'Drop image' : 'Ctrl/⌘+V · drop files'}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) onAddFiles(files, placeAt());
          }}
        />
      </div>
      <div
        ref={canvasRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-[#f4f1ea] ${over ? 'outline outline-2 outline-emerald-500 outline-offset-[-2px]' : ''}`}
        data-whiteboard-canvas={board.id}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerDown={(event) => {
          onActive?.(board.id);
          if (event.target === event.currentTarget) setSelected('');
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          markPointer(event);
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          markPointer(event);
          setOver(false);
          const files = filesFromDataTransfer(event.dataTransfer);
          const url = imageUrlFromDataTransfer(event.dataTransfer);
          if (files.length) onAddFiles(files, placeAt());
          else if (url) onAddUrl(url, placeAt());
        }}
      >
        {items.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[0.75rem] text-stone-400">
            Paste or drop images and icons. Drag to move, corners to resize.
          </p>
        ) : null}
        {items
          .slice()
          .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
          .map((item) => {
            const isSelected = selected === item.id;
            return (
              <div
                key={item.id}
                data-whiteboard-item={item.id}
                className={`absolute ${isSelected ? 'ring-2 ring-emerald-600' : 'ring-1 ring-black/10'}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  zIndex: item.z ?? 1,
                  touchAction: 'none',
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  if ((event.target as HTMLElement).closest('[data-item-resize]')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onActive?.(board.id);
                  begin({
                    type: 'move',
                    id: item.id,
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    origin: item,
                  });
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt="" draggable={false} className="h-full w-full object-contain" />
                {isSelected
                  ? ITEM_HANDLES.map((handle) => (
                      <div
                        key={handle.edge}
                        data-item-resize={handle.edge}
                        className={`absolute z-10 bg-emerald-600 ${handle.className}`}
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
                            origin: item,
                          });
                        }}
                      />
                    ))
                  : (
                    <div
                      data-item-resize="se"
                      className="absolute bottom-0 right-0 z-10 h-2.5 w-2.5 cursor-se-resize bg-stone-400/80"
                      style={{ touchAction: 'none' }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        begin({
                          type: 'resize',
                          id: item.id,
                          edge: 'se',
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          origin: item,
                        });
                      }}
                    />
                  )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
