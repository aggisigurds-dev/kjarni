'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { descendantIds, looseLinks, rootCategories, type MarkCategory, type MarkLink, type MarksDoc } from '@/lib/marks/model';
import { FolderCard, LinkCard } from './cards';
import { BOARD } from './ui';

type DragKind = 'folder' | 'link';

interface DragState {
  kind: DragKind;
  id: string;
  dx: number;
  dy: number;
  originX: number;
  originY: number;
  startClientX: number;
  startClientY: number;
  pointerId: number;
  overId: string | null;
  nested: boolean;
}

function hitFolder(clientX: number, clientY: number, exclude: Set<string>): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    const host = node.closest('[data-folder-id]');
    const id = host?.getAttribute('data-folder-id');
    if (id && !exclude.has(id)) return id;
  }
  return null;
}

export function Whiteboard({
  doc,
  onRenameFolder,
  onEditLink,
  onAddLink,
  onEditFolder,
  onDrop,
  onMove,
}: {
  doc: MarksDoc;
  onRenameFolder: (id: string, name: string) => void;
  onEditLink: (link: MarkLink) => void;
  onAddLink: (categoryId: string) => void;
  onEditFolder: (category: MarkCategory) => void;
  onDrop: (kind: DragKind, id: string, targetFolderId: string | null, x: number, y: number) => void;
  onMove: (kind: DragKind, id: string, x: number, y: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const toBoard = (clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return { x: clientX, y: clientY };
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const excluded = (kind: DragKind, id: string) => {
    const skip = new Set<string>([id]);
    if (kind === 'folder') {
      for (const child of descendantIds(doc, id)) skip.add(child);
    }
    return skip;
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, kind: DragKind, id: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const folder = kind === 'folder' ? doc.categories.find((category) => category.id === id) : null;
    const link = kind === 'link' ? doc.links.find((row) => row.id === id) : null;
    const nested = kind === 'folder' ? Boolean(folder?.parentId) : Boolean(link?.categoryId);
    const next: DragState = {
      kind,
      id,
      dx: 0,
      dy: 0,
      originX: folder?.x ?? link?.x ?? 0,
      originY: folder?.y ?? link?.y ?? 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pointerId: event.pointerId,
      overId: null,
      nested,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const next: DragState = {
      ...current,
      dx: event.clientX - current.startClientX,
      dy: event.clientY - current.startClientY,
      overId: hitFolder(event.clientX, event.clientY, excluded(current.kind, current.id)),
    };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = toBoard(event.clientX, event.clientY);
    const target = hitFolder(event.clientX, event.clientY, excluded(current.kind, current.id));
    const x = current.nested ? Math.max(16, point.x - 24) : Math.max(16, current.originX + current.dx);
    const y = current.nested ? Math.max(16, point.y - 24) : Math.max(16, current.originY + current.dy);
    dragRef.current = null;
    setDrag(null);
    if (target) {
      onDrop(current.kind, current.id, target, x, y);
      return;
    }
    if (Math.abs(current.dx) > 4 || Math.abs(current.dy) > 4) {
      onMove(current.kind, current.id, x, y);
    }
  };

  const styleFor = (kind: DragKind, id: string, x: number, y: number) => {
    const active = drag && drag.kind === kind && drag.id === id;
    return {
      transform: active ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
      zIndex: active ? 40 : undefined,
      left: x,
      top: y,
    } as const;
  };

  return (
    <div
      ref={boardRef}
      className={`${BOARD} ${drag ? 'cursor-grabbing' : ''}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {rootCategories(doc).map((category) => (
        <div
          key={category.id}
          className="absolute"
          style={styleFor('folder', category.id, category.x, category.y)}
          data-over={drag?.overId === category.id ? '1' : '0'}
        >
          <div className={drag?.overId === category.id ? 'rounded-xl ring-2 ring-emerald-600' : ''}>
            <FolderCard
              doc={doc}
              category={category}
              onEditLink={onEditLink}
              onAddLink={onAddLink}
              onRename={onRenameFolder}
              onEditFolder={onEditFolder}
              onDragStart={startDrag}
              highlightId={drag?.overId ?? ''}
            />
          </div>
        </div>
      ))}
      {looseLinks(doc).map((link) => (
        <div key={link.id} className="absolute" style={styleFor('link', link.id, link.x, link.y)}>
          <LinkCard link={link} onEdit={onEditLink} onDragStart={startDrag} />
        </div>
      ))}
    </div>
  );
}
