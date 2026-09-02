'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DEFAULT_MARKS_DISPLAY, childCategories, type MarksDoc } from '@/lib/marks/model';
import {
  MIN_TABLE_H,
  MIN_TABLE_W,
  SNAP_GRID,
  UNFILED_WINDOW_ID,
  applyMove,
  applyResize,
  boardExtent,
  folderWindowRect,
  snapWindowRect,
  tableWindowRect,
  unfiledWindowRect,
  whiteboardWindowRect,
  type MarksWindowRect,
  type ResizeEdge,
} from '@/lib/marks/windows';
import { PANEL, WINDOW_BOARD } from './ui';

export type DeskWindowKind = 'folder' | 'unfiled' | 'whiteboard' | 'table';

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

function windowDotClass(kind: DeskWindowKind) {
  if (kind === 'table') return 'bg-sky-600';
  if (kind === 'whiteboard') return 'bg-stone-500';
  return 'bg-emerald-600';
}

export function MarksWindowDesk({
  doc,
  showHidden = false,
  onLayout,
  renderWindow,
  renderTitle,
  renderTitleExtra,
}: {
  doc: MarksDoc;
  /** Hidden windows leave the desk unless this is on (Show → Hidden chip). */
  showHidden?: boolean;
  onLayout?: (id: string, rect: MarksWindowRect, kind: DeskWindowKind) => void;
  renderWindow: (id: string, kind: DeskWindowKind) => ReactNode;
  renderTitle?: (id: string, name: string, kind: DeskWindowKind) => ReactNode;
  renderTitleExtra?: (id: string, kind: DeskWindowKind) => ReactNode;
}) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  gestureRef.current = gesture;
  const [preview, setPreview] = useState<{ id: string; rect: MarksWindowRect } | null>(null);
  const [stack, setStack] = useState<string[]>([]);

  const visible = <T extends { hidden?: boolean }>(rows: T[]) => rows.filter((row) => showHidden || !row.hidden);
  const roots = visible(childCategories(doc, null));
  const unfiledOrigin = unfiledWindowRect(doc, roots.length);
  const tables = visible(doc.tables ?? []);
  const boards = visible(doc.whiteboards ?? []);

  const items = useMemo(() => {
    type DeskItem = {
      id: string;
      name: string;
      kind: DeskWindowKind;
      origin: MarksWindowRect;
      rect: MarksWindowRect;
      minW?: number;
      minH?: number;
      hidden?: boolean;
      /** Collapsed folder: the whole window shrinks to its header (2026-09-02). */
      collapsed?: boolean;
    };
    const rows: DeskItem[] = roots.map((folder, index) => {
      const origin = folderWindowRect(folder, index);
      return {
        id: folder.id,
        name: folder.name,
        kind: 'folder',
        origin,
        rect: preview?.id === folder.id ? preview.rect : origin,
        hidden: folder.hidden,
        collapsed: folder.collapsed,
      };
    });
    rows.push({
      id: UNFILED_WINDOW_ID,
      name: 'Unfiled',
      kind: 'unfiled',
      origin: unfiledOrigin,
      rect: preview?.id === UNFILED_WINDOW_ID ? preview.rect : unfiledOrigin,
      collapsed: Boolean(doc.unfiledCollapsed),
    });
    tables.forEach((table, index) => {
      const origin = tableWindowRect(table, roots.length + 1 + index);
      rows.push({
        id: table.id,
        name: table.title,
        kind: 'table',
        origin,
        rect: preview?.id === table.id ? preview.rect : origin,
        minW: MIN_TABLE_W,
        minH: MIN_TABLE_H,
        hidden: table.hidden,
      });
    });
    boards.forEach((board, index) => {
      const origin = whiteboardWindowRect(board, roots.length + 1 + tables.length + index);
      rows.push({
        id: board.id,
        name: board.title,
        kind: 'whiteboard',
        origin,
        rect: preview?.id === board.id ? preview.rect : origin,
        hidden: board.hidden,
      });
    });
    return rows;
  }, [boards, preview, roots, tables, unfiledOrigin]);

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
    const mins = items.find((item) => item.id === current.id);
    // Magnet to the dot grid WHILE dragging (not only on release) so the window
    // visibly lands on the grid as it moves.
    const raw =
      current.type === 'move'
        ? applyMove(current.origin, dx, dy)
        : applyResize(current.origin, current.edge, dx, dy, { w: mins?.minW, h: mins?.minH });
    setPreview({ id: current.id, rect: snapWindowRect(raw, SNAP_GRID, { w: mins?.minW, h: mins?.minH }) });
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const mins = items.find((item) => item.id === current.id);
    const rect =
      current.type === 'move'
        ? applyMove(current.origin, dx, dy)
        : applyResize(current.origin, current.edge, dx, dy, { w: mins?.minW, h: mins?.minH });
    gestureRef.current = null;
    setGesture(null);
    setPreview(null);
    if (current.type === 'resize' || Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      const kind = items.find((row) => row.id === current.id)?.kind ?? 'folder';
      onLayout?.(current.id, snapWindowRect(rect, undefined, { w: mins?.minW, h: mins?.minH }), kind);
    }
  };

  // Column layout (2026-09-02): windows flow into N CSS columns (desk order,
  // top-to-bottom then next column). Columns balance themselves so they fill
  // up evenly, and a collapsed window lets the one beneath move straight up.
  // No dragging here; positions come from the free desk.
  const display = doc.display ?? DEFAULT_MARKS_DISPLAY;
  if (display.layout === 'columns') {
    const cols = Math.min(4, Math.max(2, display.columns || 3));
    return (
      <div
        className="hidden md:block [column-gap:1rem] [&>*]:mb-4 [&>*]:break-inside-avoid"
        data-marks-layout="desk-columns"
        data-marks-cols={cols}
        style={{ columnCount: cols }}
      >
        {items.map((item) => {
          const fixed = item.kind === 'table' || item.kind === 'whiteboard';
          return (
            <section
              key={item.id}
              data-marks-window={item.id}
              data-window-kind={item.kind}
              data-window-hidden={item.hidden ? 'true' : undefined}
              data-window-collapsed={item.collapsed ? 'true' : undefined}
              className={`${PANEL} flex min-w-0 flex-col overflow-hidden ${
                item.kind === 'whiteboard' ? 'border-stone-300 shadow-md' : ''
              } ${item.hidden ? 'border-dashed border-amber-400 opacity-75' : ''} ${
                fixed || item.collapsed ? '' : 'max-h-[85vh]'
              }`}
              style={{ height: fixed && !item.collapsed ? item.rect.h : undefined }}
            >
              <div
                data-marks-titlebar={item.id}
                className={`flex shrink-0 items-center gap-1.5 border-b border-stone-100 px-2 py-1.5 ${
                  item.kind === 'whiteboard' ? 'bg-[#efece4]' : 'bg-stone-50'
                }`}
              >
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${windowDotClass(item.kind)}`} aria-hidden />
                {renderTitle ? (
                  renderTitle(item.id, item.name, item.kind)
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{item.name}</span>
                )}
                {renderTitleExtra?.(item.id, item.kind)}
              </div>
              <div className={`min-h-0 flex-1 ${fixed ? 'overflow-hidden' : 'overflow-auto'}`}>
                {renderWindow(item.id, item.kind)}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

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
          className={`${PANEL} absolute flex flex-col overflow-hidden ${
            item.kind === 'whiteboard' ? 'border-stone-300 shadow-md' : ''
          } ${item.hidden ? 'border-dashed border-amber-400 opacity-75' : ''}`}
          style={{
            left: item.rect.x,
            top: item.rect.y,
            width: item.rect.w,
            // Collapsed → the frame hugs the title bar + folder header instead of
            // leaving an empty box the size of the open window.
            height: item.collapsed ? undefined : item.rect.h,
            zIndex: zOf(item.id),
          }}
          data-window-kind={item.kind}
          data-window-hidden={item.hidden ? 'true' : undefined}
          data-window-collapsed={item.collapsed ? 'true' : undefined}
          onPointerDown={() => raise(item.id)}
        >
          <div
            data-marks-titlebar={item.id}
            className={`flex shrink-0 items-center gap-1.5 border-b border-stone-100 px-2 py-1.5 ${
              item.kind === 'whiteboard' ? 'bg-[#efece4]' : 'bg-stone-50'
            } ${gesture?.id === item.id && gesture.type === 'move' ? 'cursor-grabbing' : 'cursor-grab'}`}
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
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${windowDotClass(item.kind)}`} aria-hidden />
            {renderTitle ? (
              renderTitle(item.id, item.name, item.kind)
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{item.name}</span>
            )}
            {renderTitleExtra?.(item.id, item.kind)}
          </div>
          <div
            className={`min-h-0 flex-1 ${
              item.kind === 'whiteboard' || item.kind === 'table' ? 'overflow-hidden' : 'overflow-auto'
            }`}
          >
            {renderWindow(item.id, item.kind)}
          </div>
          {(item.collapsed ? RESIZE_HANDLES.filter((handle) => handle.edge === 'e' || handle.edge === 'w') : RESIZE_HANDLES).map((handle) => (
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
