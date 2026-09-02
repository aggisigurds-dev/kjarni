'use client';

/**
 * Desktop: category windows (title-bar move, edge resize).
 * Phone: the same folders as columns. Drag a link row between folders.
 */

import { useState, type DragEvent } from 'react';
import { useHoldToMoveLink } from '@/lib/marks/hold-move';
import {
  buttonsInFolder,
  childCategories,
  DEFAULT_MARKS_DISPLAY,
  folderCoverClass,
  linksInCategory,
  type MarkCategory,
  type MarkLink,
  type MarkTable,
  type MarkWhiteboard,
  type MarksButton,
  type MarksDisplay,
  type MarksDoc,
  type WhiteboardItem,
} from '@/lib/marks/model';
import { screenshotCoverUrl } from '@/lib/marks/preview';
import { videoSourceForLink } from '@/lib/marks/video';
import { BookmarkMedia } from './bookmark-media';
import { TableGrid } from './table-window';
import { WhiteboardCanvas } from './whiteboard-canvas';
import { MarksWindowDesk } from './windows-board';
import { ACTION_TINY, BUTTON_CHIP, PANEL } from './ui';
import { UNFILED_WINDOW_ID, type MarksWindowRect } from '@/lib/marks/windows';

export type MarksDragKind = 'folder' | 'link' | 'button';

const LINK_MIME = 'text/marks-link';
const FOLDER_MIME = 'text/marks-folder';
const BUTTON_MIME = 'text/marks-button';

function readDrag(event: DragEvent): { kind: MarksDragKind; id: string } | null {
  const linkId = event.dataTransfer.getData(LINK_MIME);
  if (linkId) return { kind: 'link', id: linkId };
  const buttonId = event.dataTransfer.getData(BUTTON_MIME);
  if (buttonId) return { kind: 'button', id: buttonId };
  const folderId = event.dataTransfer.getData(FOLDER_MIME);
  if (folderId) return { kind: 'folder', id: folderId };
  const plain = event.dataTransfer.getData('text/plain');
  const match = plain.match(/^(folder|link|button):(.+)$/);
  if (match) return { kind: match[1] as MarksDragKind, id: match[2]! };
  return null;
}

function startDrag(event: DragEvent, kind: MarksDragKind, id: string) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(
    kind === 'link' ? LINK_MIME : kind === 'button' ? BUTTON_MIME : FOLDER_MIME,
    id
  );
  event.dataTransfer.setData('text/plain', `${kind}:${id}`);
}

export function Whiteboard({
  doc,
  highlightFolder,
  hoverLink,
  onHoverLink,
  onRenameFolder,
  onEditLink,
  onAddLink,
  onAddFolder,
  onAddButton,
  onEditFolder,
  onEditButton,
  onRunButton,
  onToggleFolder,
  onDeleteFolder,
  onDrop,
  onScreenshotLink,
  onRenameTable,
  onTableCell,
  onTableCells,
  onAddTableRow,
  onAddTableCol,
  onRemoveTableRow,
  onRemoveTableCol,
  onDeleteTable,
  onLayout,
  onToggleUnfiled,
  onRenameWhiteboard,
  onDeleteWhiteboard,
  onAddWhiteboardFiles,
  onAddWhiteboardUrl,
  onMoveWhiteboardItem,
  onRemoveWhiteboardItem,
  activeWhiteboard,
  onActiveWhiteboard,
}: {
  doc: MarksDoc;
  highlightFolder?: string;
  hoverLink?: string;
  onHoverLink?: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onEditLink: (link: MarkLink) => void;
  onAddLink: (categoryId: string) => void;
  onAddFolder?: (parentId: string | null) => void;
  onAddButton?: (folderId: string) => void;
  onEditFolder: (category: MarkCategory) => void;
  onEditButton?: (button: MarksButton) => void;
  onRunButton?: (button: MarksButton) => void;
  onToggleFolder?: (id: string, collapsed: boolean) => void;
  onDeleteFolder?: (category: MarkCategory) => void;
  onDrop: (
    kind: MarksDragKind,
    id: string,
    targetFolderId: string | null,
    index?: number
  ) => void;
  onScreenshotLink?: (link: MarkLink) => void;
  onRenameTable?: (id: string, title: string) => void;
  onTableCell?: (id: string, key: string, raw: string) => void;
  onTableCells?: (id: string, entries: Record<string, string>) => void;
  onAddTableRow?: (id: string) => void;
  onAddTableCol?: (id: string) => void;
  onRemoveTableRow?: (id: string) => void;
  onRemoveTableCol?: (id: string) => void;
  onDeleteTable?: (id: string) => void;
  onLayout?: (id: string, rect: MarksWindowRect) => void;
  onToggleUnfiled?: (collapsed: boolean) => void;
  onRenameWhiteboard?: (id: string, title: string) => void;
  onDeleteWhiteboard?: (id: string) => void;
  onAddWhiteboardFiles?: (id: string, files: File[], at?: { x: number; y: number }) => void;
  onAddWhiteboardUrl?: (id: string, src: string, at?: { x: number; y: number }) => void;
  onMoveWhiteboardItem?: (
    whiteboardId: string,
    itemId: string,
    rect: Pick<WhiteboardItem, 'x' | 'y' | 'w' | 'h' | 'z'>
  ) => void;
  onRemoveWhiteboardItem?: (whiteboardId: string, itemId: string) => void;
  activeWhiteboard?: string;
  onActiveWhiteboard?: (id: string) => void;
}) {
  const [overFolder, setOverFolder] = useState('');
  const [overLink, setOverLink] = useState('');
  const roots = childCategories(doc, null);
  const unfiled = linksInCategory(doc, '');
  const display = doc.display ?? DEFAULT_MARKS_DISPLAY;
  const tables = doc.tables ?? [];
  const boards = doc.whiteboards ?? [];

  const renderCanvas = (board: MarkWhiteboard) => (
    <WhiteboardCanvas
      board={board}
      active={activeWhiteboard === board.id}
      onActive={onActiveWhiteboard}
      onAddFiles={(files, at) => onAddWhiteboardFiles?.(board.id, files, at)}
      onAddUrl={(src, at) => onAddWhiteboardUrl?.(board.id, src, at)}
      onMoveItem={(itemId, rect) => onMoveWhiteboardItem?.(board.id, itemId, rect)}
      onRemoveItem={onRemoveWhiteboardItem ? (itemId) => onRemoveWhiteboardItem(board.id, itemId) : undefined}
    />
  );

  const acceptDrop = (folderId: string | null, event: DragEvent, index?: number) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = readDrag(event);
    setOverFolder('');
    setOverLink('');
    if (!dragged) return;
    onDrop(dragged.kind, dragged.id, folderId, dragged.kind === 'link' ? index : undefined);
  };

  const markOver = (folderId: string, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (overFolder !== folderId) setOverFolder(folderId);
  };

  const holdOver = (key: string) => setOverFolder(key);
  const holdClear = () => {
    setOverFolder('');
    setOverLink('');
  };
  const holdDrop = (linkId: string, folderId: string | null) => {
    holdClear();
    const dest = folderId ?? '';
    const link = doc.links.find((row) => row.id === linkId);
    if (link && link.categoryId === dest) return;
    onDrop('link', linkId, folderId);
  };

  return (
    <>
    <p className="mb-1 px-1 text-[0.65rem] text-stone-400 md:hidden">
      Hold a link, then drag it into another folder.
    </p>
    <div
      className="mx-auto grid grid-cols-3 items-start gap-1.5 px-1 md:hidden"
      data-marks-layout="columns"
      data-marks-cols="3"
    >
      {roots.map((folder) => (
        <Column
          key={folder.id}
          doc={doc}
          folder={folder}
          nested={false}
          compact
          display={display}
          highlightFolder={highlightFolder}
          hoverLink={hoverLink}
          overFolder={overFolder}
          overLink={overLink}
          onHoverLink={onHoverLink}
          onRenameFolder={onRenameFolder}
          onEditLink={onEditLink}
          onAddLink={onAddLink}
          onAddFolder={onAddFolder}
          onAddButton={onAddButton}
          onEditFolder={onEditFolder}
          onEditButton={onEditButton}
          onRunButton={onRunButton}          onToggleFolder={onToggleFolder}
          onDeleteFolder={onDeleteFolder}
          onMarkOver={markOver}
          onOverLink={setOverLink}
          onDrop={acceptDrop}
          onHoldOver={holdOver}
          onHoldClear={holdClear}
          onHoldDrop={holdDrop}
          onScreenshotLink={onScreenshotLink}
        />
      ))}
      <section
        className={`${PANEL} flex min-w-0 flex-col p-1.5 ${
          overFolder === '__unfiled__' ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-stone-100' : ''
        }`}
        data-drop-folder=""
        data-drop-active={overFolder === '__unfiled__' ? 'true' : undefined}
        onDragOver={(event) => markOver('__unfiled__', event)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOverFolder((current) => (current === '__unfiled__' ? '' : current));
          }
        }}
        onDrop={(event) => acceptDrop(null, event)}
      >
        <div className="mb-1 flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            className="rounded p-1 text-stone-400"
            aria-label={doc.unfiledCollapsed ? 'Open Unfiled' : 'Collapse Unfiled'}
            onClick={() => onToggleUnfiled?.(!doc.unfiledCollapsed)}
          >
            {doc.unfiledCollapsed ? '▸' : '▾'}
          </button>
          <h2 className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold">Unfiled</h2>
          <span className="text-[0.55rem] text-stone-400">{unfiled.length}</span>
        </div>
        {doc.unfiledCollapsed ? (
          <p className="px-1 text-[0.6rem] text-stone-400">{unfiled.length} items</p>
        ) : (
          <>
            {unfiled.length === 0 ? (
              <p className="px-1 py-2 text-[0.65rem] text-stone-400">Drop a link here</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {unfiled.map((link, index) => (
                  <LinkRow
                    key={link.id}
                    link={link}                    display={display}
                    compact
                    hovering={hoverLink === link.id}
                    insertBefore={overLink === link.id}
                    onHover={onHoverLink}
                    onEdit={() => onEditLink(link)}                    onDragOver={(event) => {
                      markOver('__unfiled__', event);
                      setOverLink(link.id);
                    }}
                    onDrop={(event) => acceptDrop(null, event, index)}
                    onHoldOver={holdOver}
                    onHoldClear={holdClear}
                    onHoldDrop={holdDrop}
                    onScreenshot={onScreenshotLink ? () => onScreenshotLink(link) : undefined}
                  />
                ))}
              </ul>
            )}
            <AddRow
              onFolder={onAddFolder ? () => onAddFolder(null) : undefined}
              onLink={() => onAddLink('')}
              onButton={onAddButton ? () => onAddButton('') : undefined}
            />
          </>
        )}
      </section>
      {boards.map((board) => (
        <section key={board.id} className={`${PANEL} overflow-hidden`} data-marks-whiteboard-mobile={board.id}>
          <div className="flex items-center gap-2 border-b border-stone-100 bg-[#efece4] px-3 py-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
              value={board.title}
              aria-label="Whiteboard name"
              onChange={(event) => onRenameWhiteboard?.(board.id, event.target.value)}
            />
            {onDeleteWhiteboard ? (
              <button
                type="button"
                className="rounded px-1 text-[0.6rem] font-bold text-rose-600"
                onClick={() => onDeleteWhiteboard(board.id)}
              >
                Delete
              </button>
            ) : null}
          </div>
          <div className="h-72">{renderCanvas(board)}</div>
        </section>
      ))}
      {tables.map((table) => (
        <section key={table.id} className={`${PANEL} overflow-hidden`} data-marks-table={table.id}>
          <TableTitle table={table} onRename={onRenameTable} onDelete={onDeleteTable} />
          <div className="h-[28rem]">
            <TableSheet
              table={table}
              onTableCell={onTableCell}
              onTableCells={onTableCells}
              onAddTableRow={onAddTableRow}
              onAddTableCol={onAddTableCol}
              onRemoveTableRow={onRemoveTableRow}
              onRemoveTableCol={onRemoveTableCol}
              onRenameTable={onRenameTable}
            />
          </div>
        </section>
      ))}
    </div>
      <MarksWindowDesk
        doc={doc}
        onLayout={onLayout}
        renderTitle={(id, name, kind) => {
          if (kind === 'table') {
            const table = tables.find((row) => row.id === id);
            if (table) return <TableTitle table={table} onRename={onRenameTable} onDelete={onDeleteTable} />;
          }
          if (kind === 'whiteboard' && onRenameWhiteboard) {
            return (
              <input
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
                value={name}
                aria-label="Whiteboard name"
                data-no-drag
                onChange={(event) => onRenameWhiteboard(id, event.target.value)}
              />
            );
          }
          return <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{name}</span>;
        }}
        renderTitleExtra={(id, kind) =>
          kind === 'whiteboard' && onDeleteWhiteboard ? (
            <button
              type="button"
              className="rounded px-1 text-[0.6rem] font-bold text-rose-600"
              data-no-drag
              onClick={() => onDeleteWhiteboard(id)}
            >
              Delete
            </button>
          ) : null
        }
        renderWindow={(id, kind) => {
          if (kind === 'table') {
            const table = tables.find((row) => row.id === id);
            if (!table) return null;
            return (
              <TableSheet
                table={table}
                onTableCell={onTableCell}
                onTableCells={onTableCells}
                onAddTableRow={onAddTableRow}
                onAddTableCol={onAddTableCol}
                onRemoveTableRow={onRemoveTableRow}
                onRemoveTableCol={onRemoveTableCol}
                onRenameTable={onRenameTable}
              />
            );
          }
          if (id === UNFILED_WINDOW_ID) {
            return (
              <section
                className={`${PANEL} flex h-full flex-col p-3`}
                data-drop-folder=""
                onDragOver={(event) => markOver('__unfiled__', event)}
                onDrop={(event) => acceptDrop(null, event)}
              >
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 text-sm font-semibold">Unfiled</h2>
                  <span className="text-[0.65rem] text-stone-400">{unfiled.length}</span>
                </div>
                {unfiled.length === 0 ? (
                  <p className="px-1 py-3 text-[0.75rem] text-stone-400">
                    Links with no folder land here. Drop a link or folder to move it out.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {unfiled.map((link, index) => (
                      <LinkRow
                        key={link.id}
                        link={link}                        display={display}
                        hovering={hoverLink === link.id}
                        insertBefore={overLink === link.id}
                        onHover={onHoverLink}
                        onEdit={() => onEditLink(link)}                        onDragOver={(event) => {
                          markOver('__unfiled__', event);
                          setOverLink(link.id);
                        }}
                        onDrop={(event) => acceptDrop(null, event, index)}
                        onHoldOver={holdOver}
                        onHoldClear={holdClear}
                        onHoldDrop={holdDrop}
                        onScreenshot={onScreenshotLink ? () => onScreenshotLink(link) : undefined}
                      />
                    ))}
                  </ul>
                )}
                <AddRow
                  onFolder={onAddFolder ? () => onAddFolder(null) : undefined}
                  onLink={() => onAddLink('')}
                  onButton={onAddButton ? () => onAddButton('') : undefined}
                />
              </section>
            );
          }
          const whiteboard = boards.find((row) => row.id === id);
          if (whiteboard) return renderCanvas(whiteboard);
          const folder = roots.find((row) => row.id === id);
          if (!folder) return null;
          return (
            <Column
              doc={doc}
              folder={folder}
              nested={false}
              display={display}
              highlightFolder={highlightFolder}
              hoverLink={hoverLink}
              overFolder={overFolder}
              overLink={overLink}
              onHoverLink={onHoverLink}
              onRenameFolder={onRenameFolder}
              onEditLink={onEditLink}
              onAddLink={onAddLink}
              onAddFolder={onAddFolder}
              onAddButton={onAddButton}
              onEditFolder={onEditFolder}
              onEditButton={onEditButton}
              onRunButton={onRunButton}              onToggleFolder={onToggleFolder}
              onDeleteFolder={onDeleteFolder}
              onMarkOver={markOver}
              onOverLink={setOverLink}
              onDrop={acceptDrop}
              onHoldOver={holdOver}
              onHoldClear={holdClear}
              onHoldDrop={holdDrop}
              onScreenshotLink={onScreenshotLink}
            />
          );
        }}
      />
    </>
  );
}


function TableTitle({
  table,
  onDelete,
}: {
  table: MarkTable;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{table.title}</span>
      {onDelete ? (
        <button
          type="button"
          className="rounded px-1 text-[0.6rem] font-bold text-rose-600"
          data-no-drag
          onClick={() => onDelete(table.id)}
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}

function TableSheet({
  table,
  onTableCell,
  onTableCells,
  onAddTableRow,
  onAddTableCol,
  onRemoveTableRow,
  onRemoveTableCol,
  onRenameTable,
}: {
  table: MarkTable;
  onTableCell?: (id: string, key: string, raw: string) => void;
  onTableCells?: (id: string, entries: Record<string, string>) => void;
  onAddTableRow?: (id: string) => void;
  onAddTableCol?: (id: string) => void;
  onRemoveTableRow?: (id: string) => void;
  onRemoveTableCol?: (id: string) => void;
  onRenameTable?: (id: string, title: string) => void;
}) {
  return (
    <TableGrid
      table={table}
      onCell={(key, raw) => onTableCell?.(table.id, key, raw)}
      onCells={(entries) => onTableCells?.(table.id, entries)}
      onAddRow={() => onAddTableRow?.(table.id)}
      onAddCol={() => onAddTableCol?.(table.id)}
      onRemoveRow={() => onRemoveTableRow?.(table.id)}
      onRemoveCol={() => onRemoveTableCol?.(table.id)}
      onRename={(title) => onRenameTable?.(table.id, title)}
    />
  );
}

function AddRow({
  onFolder,
  onLink,
  onButton,
}: {
  onFolder?: () => void;
  onLink: () => void;
  onButton?: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {onFolder ? (
        <button type="button" className={ACTION_TINY} onClick={onFolder}>
          + Folder
        </button>
      ) : null}
      <button type="button" className={ACTION_TINY} onClick={onLink}>
        + Link
      </button>
      {onButton ? (
        <button type="button" className={ACTION_TINY} onClick={onButton}>
          + Button
        </button>
      ) : null}
    </div>
  );
}

function Column({
  doc,
  folder,
  nested,
  compact = false,
  display,
  highlightFolder,
  hoverLink,
  overFolder,
  overLink,
  onHoverLink,
  onRenameFolder,
  onEditLink,
  onAddLink,
  onAddFolder,
  onAddButton,
  onEditFolder,
  onEditButton,
  onRunButton,
  onToggleFolder,
  onDeleteFolder,
  onMarkOver,
  onOverLink,
  onDrop,
  onHoldOver,
  onHoldClear,
  onHoldDrop,
  onScreenshotLink,
}: {
  doc: MarksDoc;
  folder: MarkCategory;
  nested: boolean;
  compact?: boolean;
  display: MarksDisplay;
  highlightFolder?: string;
  hoverLink?: string;
  overFolder: string;
  overLink: string;
  onHoverLink?: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onEditLink: (link: MarkLink) => void;
  onAddLink: (categoryId: string) => void;
  onAddFolder?: (parentId: string | null) => void;
  onAddButton?: (folderId: string) => void;
  onEditFolder: (category: MarkCategory) => void;
  onEditButton?: (button: MarksButton) => void;
  onRunButton?: (button: MarksButton) => void;
  onToggleFolder?: (id: string, collapsed: boolean) => void;
  onDeleteFolder?: (category: MarkCategory) => void;
  onMarkOver: (folderId: string, event: DragEvent) => void;
  onOverLink: (id: string) => void;
  onDrop: (folderId: string | null, event: DragEvent, index?: number) => void;
  onHoldOver: (key: string) => void;
  onHoldClear: () => void;
  onHoldDrop: (linkId: string, folderId: string | null) => void;
  onScreenshotLink?: (link: MarkLink) => void;
}) {
  const links = linksInCategory(doc, folder.id);
  const buttons = buttonsInFolder(doc, folder.id);
  const children = childCategories(doc, folder.id);
  const count = links.length + buttons.length + children.length;
  const dropping = overFolder === folder.id;
  const pad = compact ? 'p-1.5' : 'p-3';

  return (
    <section
      id={`marks-folder-${folder.id}`}
      data-drop-folder={folder.id}
      data-drop-active={dropping ? 'true' : undefined}
      className={`${nested ? 'rounded-lg bg-stone-50/80 p-1.5' : `${PANEL} ${pad}`} flex min-w-0 flex-col ${
        highlightFolder === folder.id || dropping
          ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-stone-100'
          : ''
      }`}
      onDragOver={(event) => onMarkOver(folder.id, event)}
      onDrop={(event) => onDrop(folder.id, event)}
    >
      <div className={`flex min-w-0 items-center gap-0.5 ${compact ? 'mb-1' : 'mb-2 gap-1'}`}>
        {compact ? null : (
          <span
            className="cursor-grab select-none px-0.5 text-stone-300"
            aria-hidden
            draggable
            title="Drag folder"
            onDragStart={(event) => startDrag(event, 'folder', folder.id)}
            onDragEnd={() => onOverLink('')}
          >
            ⋮⋮
          </span>
        )}
        <button
          type="button"
          className="shrink-0 rounded p-1 text-stone-400"
          aria-label={folder.collapsed ? 'Open folder' : 'Collapse folder'}
          onClick={() => onToggleFolder?.(folder.id, !folder.collapsed)}
        >
          {folder.collapsed ? '▸' : '▾'}
        </button>
        <input
          className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent font-semibold outline-none hover:border-stone-300 focus:border-emerald-600 ${
            compact ? 'px-0.5 py-0.5 text-[0.7rem]' : 'px-1 py-0.5 text-sm'
          }`}
          value={folder.name}
          aria-label="Folder name"
          draggable={false}
          onChange={(event) => onRenameFolder(folder.id, event.target.value)}
        />
        <span className={`shrink-0 text-stone-400 ${compact ? 'text-[0.55rem]' : 'text-[0.65rem]'}`}>{count}</span>
        {compact ? null : (
          <>
            {/* Folder moving lives in the Edit dialog ("Inside"), not as a
                dropdown on every row — the desk stays clean (2026-09-02). */}
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase text-stone-400"
              onClick={() => onEditFolder(folder)}
            >
              Edit
            </button>
            {onDeleteFolder ? (
              <button
                type="button"
                className="rounded px-1 text-[0.6rem] font-bold text-rose-600"
                onClick={() => onDeleteFolder(folder)}
              >
                Delete
              </button>
            ) : null}
          </>
        )}
      </div>
      {folder.collapsed ? (
        <p className={`px-1 text-stone-400 ${compact ? 'text-[0.6rem]' : 'text-[0.7rem]'}`}>{count} items</p>
      ) : (
        <>
          {display.showImages && folder.showCover && folder.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={folder.coverUrl}
              alt=""
              className={`mb-2 aspect-square rounded-md object-cover ${folderCoverClass(display.previewSize)}`}
              data-mark-cover-shape="square"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
          {buttons.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {buttons.map((button) => (
                <button
                  key={button.id}
                  type="button"
                  className={BUTTON_CHIP}
                  style={{ backgroundColor: button.color }}
                  draggable
                  onDragStart={(event) => startDrag(event, 'button', button.id)}
                  onClick={() => onRunButton?.(button)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onEditButton?.(button);
                  }}
                >
                  {button.icon ? <span aria-hidden>{button.icon}</span> : null}
                  {display.showNames ? button.label : button.icon || '•'}
                </button>
              ))}
            </div>
          ) : null}
          <ul className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-1'}`}>
            {links.map((link, index) => (
              <LinkRow
                key={link.id}
                link={link}                display={display}
                compact={compact}
                hovering={hoverLink === link.id}
                insertBefore={overLink === link.id}
                onHover={onHoverLink}
                onEdit={() => onEditLink(link)}                onDragOver={(event) => {
                  onMarkOver(folder.id, event);
                  onOverLink(link.id);
                }}
                onDrop={(event) => onDrop(folder.id, event, index)}
                onHoldOver={onHoldOver}
                onHoldClear={onHoldClear}
                onHoldDrop={onHoldDrop}
                onScreenshot={onScreenshotLink ? () => onScreenshotLink(link) : undefined}
              />
            ))}
          </ul>
          {children.map((child) => (
            <div key={child.id} className="mt-2 border-l-2 border-stone-100 pl-1.5">
              <Column
                doc={doc}
                folder={child}
                nested
                compact={compact}
                display={display}
                highlightFolder={highlightFolder}
                hoverLink={hoverLink}
                overFolder={overFolder}
                overLink={overLink}
                onHoverLink={onHoverLink}
                onRenameFolder={onRenameFolder}
                onEditLink={onEditLink}
                onAddLink={onAddLink}
                onAddFolder={onAddFolder}
                onAddButton={onAddButton}
                onEditFolder={onEditFolder}
                onEditButton={onEditButton}
                onRunButton={onRunButton}                onToggleFolder={onToggleFolder}
                onDeleteFolder={onDeleteFolder}
                onMarkOver={onMarkOver}
                onOverLink={onOverLink}
                onDrop={onDrop}
                onHoldOver={onHoldOver}
                onHoldClear={onHoldClear}
                onHoldDrop={onHoldDrop}
                onScreenshotLink={onScreenshotLink}
              />
            </div>
          ))}
          {count === 0 ? (
            <p className={`px-1 py-2 text-stone-400 ${compact ? 'text-[0.65rem]' : 'text-[0.75rem]'}`}>
              Empty folder — drop a link here
            </p>
          ) : null}
          <AddRow
            onFolder={onAddFolder ? () => onAddFolder(folder.id) : undefined}
            onLink={() => onAddLink(folder.id)}
            onButton={onAddButton ? () => onAddButton(folder.id) : undefined}
          />
        </>
      )}
    </section>
  );
}

function LinkRow({
  link,
  display,
  compact = false,
  hovering,
  insertBefore,
  onHover,
  onEdit,
  onDragOver,
  onDrop,
  onHoldOver,
  onHoldClear,
  onHoldDrop,
  onScreenshot,
}: {
  link: MarkLink;
  display: MarksDisplay;
  compact?: boolean;
  hovering?: boolean;
  insertBefore?: boolean;
  onHover?: (id: string) => void;
  onEdit: () => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
  onHoldOver: (key: string) => void;
  onHoldClear: () => void;
  onHoldDrop: (linkId: string, folderId: string | null) => void;
  onScreenshot?: () => void;
}) {
  const video = videoSourceForLink(link);
  const canShot = Boolean(!compact && onScreenshot && screenshotCoverUrl(link.url));
  const hold = useHoldToMoveLink({
    title: link.title,
    onOver: onHoldOver,
    onClearOver: onHoldClear,
    onDrop: (folderId) => onHoldDrop(link.id, folderId),
  });
  const showImage = display.showImages && (link.showImage || Boolean(video));
  const showName = display.showNames;
  const showUrl = display.showUrls && link.showUrl;
  const showNote = display.showNames && link.showDescription && Boolean(link.note);
  return (
    <li
      data-link-id={link.id}
      className={insertBefore ? 'rounded-lg ring-1 ring-emerald-400' : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={`group flex items-stretch gap-1 rounded-lg hover:bg-stone-50 ${hold.moving ? 'opacity-40' : ''}`}
        draggable={hold.html5Drag}
        onDragStart={(event) => startDrag(event, 'link', link.id)}
        onMouseEnter={() => onHover?.(link.id)}
        onMouseLeave={() => onHover?.('')}
      >
        <a
          href={link.url}
          target={link.url.startsWith('/') ? undefined : '_blank'}
          rel="noreferrer"
          className={`flex min-w-0 flex-1 touch-pan-y select-none items-center ${compact ? 'gap-1.5 px-0.5 py-1' : 'gap-3 px-2 py-2'}`}
          style={{ WebkitTouchCallout: 'none' }}
          onPointerDown={hold.onPointerDown}
          onContextMenu={hold.onContextMenu}
          onClick={hold.guardClick}
        >
          {showImage ? (
            <BookmarkMedia
              link={link}
              video={video}
              hovering={Boolean(hovering)}
              size={display.previewSize}
            />
          ) : null}
          {showName || showUrl || showNote ? (
            <span className="min-w-0">
              {showName ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className={`block min-w-0 truncate font-medium text-stone-900 ${compact ? 'text-[0.7rem]' : 'text-sm'}`}
                  >
                    {link.title}
                  </span>
                  {video ? (
                    <span className="shrink-0 text-[0.55rem] font-extrabold uppercase tracking-wide text-emerald-700">
                      ▶
                    </span>
                  ) : null}
                </span>
              ) : null}
              {showNote ? (
                <span className="block truncate text-[0.65rem] text-stone-400">{link.note}</span>
              ) : null}
              {showUrl ? (
                <span className="block truncate text-[0.6rem] text-stone-400">{link.url}</span>
              ) : null}
            </span>
          ) : null}
        </a>
        {canShot ? (
          <button
            type="button"
            className="self-center px-1.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-stone-400 hover:text-emerald-800"
            title="First-screen screenshot, square-fit"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onScreenshot?.();
            }}
          >
            Shot
          </button>
        ) : null}
        {/* Moving a link to another folder: Edit dialog (Folder field) or hold-to-drag. */}
        {compact ? null : (
          <button type="button" className="px-2 text-[0.65rem] font-bold uppercase text-stone-400" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
      {hold.ghost ? (
        <div
          data-marks-hold-ghost=""
          className="pointer-events-none fixed z-[80] max-w-[16rem] truncate rounded-lg border border-emerald-600 bg-white px-3 py-2 text-sm font-medium text-stone-900 shadow-lg"
          style={{ left: hold.ghost.x - 24, top: hold.ghost.y - 48 }}
        >
          {hold.ghost.title}
        </div>
      ) : null}
    </li>
  );
}
