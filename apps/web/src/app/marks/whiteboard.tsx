'use client';

/**
 * Desktop: category windows (title-bar move, edge resize).
 * Phone: the same folders as columns. Drag a link row between folders.
 */

import { useState, type DragEvent } from 'react';
import {
  buttonsInFolder,
  childCategories,
  folderOptions,
  linksInCategory,
  type MarkCategory,
  type MarkLink,
  type MarkTable,
  type MarksButton,
  type MarksDoc,
} from '@/lib/marks/model';
import { screenshotCoverUrl } from '@/lib/marks/preview';
import { videoSourceForLink } from '@/lib/marks/video';
import { BookmarkMedia } from './bookmark-media';
import { TableGrid } from './table-window';
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
  onMoveLink,
  onMoveFolder,
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
  onMoveLink?: (id: string, categoryId: string) => void;
  onMoveFolder?: (id: string, parentId: string | null) => void;
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
}) {
  const [overFolder, setOverFolder] = useState('');
  const [overLink, setOverLink] = useState('');
  const roots = childCategories(doc, null);
  const unfiled = linksInCategory(doc, '');
  const tables = doc.tables ?? [];

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

  return (
    <>
    <div className="mx-auto grid max-w-6xl gap-4 md:hidden" data-marks-layout="columns">
      {roots.map((folder) => (
        <Column
          key={folder.id}
          doc={doc}
          folder={folder}
          nested={false}
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
          onRunButton={onRunButton}
          onMoveLink={onMoveLink}
          onMoveFolder={onMoveFolder}
          onToggleFolder={onToggleFolder}
          onDeleteFolder={onDeleteFolder}
          onMarkOver={markOver}
          onOverLink={setOverLink}
          onDrop={acceptDrop}
          onScreenshotLink={onScreenshotLink}
        />
      ))}
      <section
        className={`${PANEL} flex flex-col p-3 ${
          overFolder === '__unfiled__' ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-stone-100' : ''
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
                link={link}
                folders={doc.categories}
                hovering={hoverLink === link.id}
                insertBefore={overLink === link.id}
                onHover={onHoverLink}
                onEdit={() => onEditLink(link)}
                onMove={onMoveLink}
                onDragOver={(event) => {
                  markOver('__unfiled__', event);
                  setOverLink(link.id);
                }}
                onDrop={(event) => acceptDrop(null, event, index)}
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
      {tables.map((table) => (
        <section key={table.id} className={`${PANEL} overflow-hidden`} data-marks-table={table.id}>
          <TableTitle
            table={table}
            onRename={onRenameTable}
            onDelete={onDeleteTable}
          />
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
        renderTitle={(id, name) => {
          const table = tables.find((row) => row.id === id);
          if (!table) {
            return <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{name}</span>;
          }
          return <TableTitle table={table} onRename={onRenameTable} onDelete={onDeleteTable} />;
        }}
        renderWindow={(id) => {
          const table = tables.find((row) => row.id === id);
          if (table) {
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
                        link={link}
                        folders={doc.categories}
                        hovering={hoverLink === link.id}
                        insertBefore={overLink === link.id}
                        onHover={onHoverLink}
                        onEdit={() => onEditLink(link)}
                        onMove={onMoveLink}
                        onDragOver={(event) => {
                          markOver('__unfiled__', event);
                          setOverLink(link.id);
                        }}
                        onDrop={(event) => acceptDrop(null, event, index)}
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
          const folder = roots.find((row) => row.id === id);
          if (!folder) return null;
          return (
            <Column
              doc={doc}
              folder={folder}
              nested={false}
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
              onRunButton={onRunButton}
              onMoveLink={onMoveLink}
              onMoveFolder={onMoveFolder}
              onToggleFolder={onToggleFolder}
              onDeleteFolder={onDeleteFolder}
              onMarkOver={markOver}
              onOverLink={setOverLink}
              onDrop={acceptDrop}
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
  onMoveLink,
  onMoveFolder,
  onToggleFolder,
  onDeleteFolder,
  onMarkOver,
  onOverLink,
  onDrop,
  onScreenshotLink,
  onLayout,
}: {
  doc: MarksDoc;
  folder: MarkCategory;
  nested: boolean;
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
  onMoveLink?: (id: string, categoryId: string) => void;
  onMoveFolder?: (id: string, parentId: string | null) => void;
  onToggleFolder?: (id: string, collapsed: boolean) => void;
  onDeleteFolder?: (category: MarkCategory) => void;
  onMarkOver: (folderId: string, event: DragEvent) => void;
  onOverLink: (id: string) => void;
  onDrop: (folderId: string | null, event: DragEvent, index?: number) => void;
  onScreenshotLink?: (link: MarkLink) => void;
  onLayout?: (id: string, rect: MarksWindowRect) => void;
}) {
  const links = linksInCategory(doc, folder.id);
  const buttons = buttonsInFolder(doc, folder.id);
  const children = childCategories(doc, folder.id);
  const count = links.length + buttons.length + children.length;
  const dropping = overFolder === folder.id;

  return (
    <section
      id={`marks-folder-${folder.id}`}
      data-drop-folder={folder.id}
      data-drop-active={dropping ? 'true' : undefined}
      className={`${nested ? 'rounded-lg bg-stone-50/80 p-2' : `${PANEL} p-3`} flex flex-col ${
        highlightFolder === folder.id || dropping
          ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-stone-100'
          : ''
      }`}
      onDragOver={(event) => onMarkOver(folder.id, event)}
      onDrop={(event) => onDrop(folder.id, event)}
    >
      <div className="mb-2 flex items-center gap-1">
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
        <button
          type="button"
          className="rounded p-1 text-stone-400"
          aria-label={folder.collapsed ? 'Open folder' : 'Collapse folder'}
          onClick={() => onToggleFolder?.(folder.id, !folder.collapsed)}
        >
          {folder.collapsed ? '▸' : '▾'}
        </button>
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
          value={folder.name}
          aria-label="Folder name"
          draggable={false}
          onChange={(event) => onRenameFolder(folder.id, event.target.value)}
        />
        <span className="text-[0.65rem] text-stone-400">{count}</span>
        {onMoveFolder ? (
          <select
            className="max-w-[7rem] bg-transparent text-[0.6rem] text-stone-400"
            value={folder.parentId ?? ''}
            aria-label="Move folder"
            onChange={(event) => onMoveFolder(folder.id, event.target.value || null)}
          >
            <option value="">Top level</option>
            {folderOptions(doc, { includeUnfiled: false, excludeId: folder.id }).map((option) => (
              <option key={option.id} value={option.id}>
                {`${'· '.repeat(option.depth)}${option.name}`}
              </option>
            ))}
          </select>
        ) : null}
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
      </div>
      {folder.collapsed ? (
        <p className="px-1 text-[0.7rem] text-stone-400">{count} items</p>
      ) : (
        <>
          {folder.showCover && folder.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={folder.coverUrl}
              alt=""
              className="mb-2 aspect-square h-24 w-24 rounded-md object-cover"
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
                  {button.label}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1">
            {links.map((link, index) => (
              <LinkRow
                key={link.id}
                link={link}
                folders={doc.categories}
                hovering={hoverLink === link.id}
                insertBefore={overLink === link.id}
                onHover={onHoverLink}
                onEdit={() => onEditLink(link)}
                onMove={onMoveLink}
                onDragOver={(event) => {
                  onMarkOver(folder.id, event);
                  onOverLink(link.id);
                }}
                onDrop={(event) => onDrop(folder.id, event, index)}
                onScreenshot={onScreenshotLink ? () => onScreenshotLink(link) : undefined}
              />
            ))}
          </ul>
          {children.map((child) => (
            <div key={child.id} className="mt-2 border-l-2 border-stone-100 pl-2">
              <Column
                doc={doc}
                folder={child}
                nested
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
                onRunButton={onRunButton}
                onMoveLink={onMoveLink}
                onMoveFolder={onMoveFolder}
                onToggleFolder={onToggleFolder}
                onDeleteFolder={onDeleteFolder}
                onMarkOver={onMarkOver}
                onOverLink={onOverLink}
                onDrop={onDrop}
                onScreenshotLink={onScreenshotLink}
              />
            </div>
          ))}
          {count === 0 ? <p className="px-1 py-2 text-[0.75rem] text-stone-400">Empty folder — drop a link here</p> : null}
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
  folders,
  hovering,
  insertBefore,
  onHover,
  onEdit,
  onMove,
  onDragOver,
  onDrop,
  onScreenshot,
}: {
  link: MarkLink;
  folders: MarkCategory[];
  hovering?: boolean;
  insertBefore?: boolean;
  onHover?: (id: string) => void;
  onEdit: () => void;
  onMove?: (id: string, categoryId: string) => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
  onScreenshot?: () => void;
}) {
  const video = videoSourceForLink(link);
  const canShot = Boolean(onScreenshot && screenshotCoverUrl(link.url));
  return (
    <li
      data-link-id={link.id}
      className={insertBefore ? 'rounded-lg ring-1 ring-emerald-400' : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className="group flex items-stretch gap-1 rounded-lg hover:bg-stone-50"
        draggable
        onDragStart={(event) => startDrag(event, 'link', link.id)}
        onMouseEnter={() => onHover?.(link.id)}
        onMouseLeave={() => onHover?.('')}
      >
        <a
          href={link.url}
          target={link.url.startsWith('/') ? undefined : '_blank'}
          rel="noreferrer"
          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2"
        >
          {link.showImage || video ? <BookmarkMedia link={link} video={video} hovering={Boolean(hovering)} /> : null}
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="block min-w-0 truncate text-sm font-medium text-stone-900">{link.title}</span>
              {video ? (
                <span className="shrink-0 text-[0.6rem] font-extrabold uppercase tracking-wide text-emerald-700">
                  ▶ video
                </span>
              ) : null}
            </span>
            {link.showDescription && link.note ? (
              <span className="block truncate text-[0.7rem] text-stone-400">{link.note}</span>
            ) : null}
            {link.showUrl ? (
              <span className="block truncate text-[0.65rem] text-stone-400">{link.url}</span>
            ) : null}
          </span>
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
        {onMove ? (
          <select
            className="max-w-[6rem] self-center bg-transparent text-[0.6rem] text-stone-400"
            value={link.categoryId}
            aria-label="Move to folder"
            onChange={(event) => onMove(link.id, event.target.value)}
          >
            <option value="">Unfiled</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="px-2 text-[0.65rem] font-bold uppercase text-stone-400" onClick={onEdit}>
          Edit
        </button>
      </div>
    </li>
  );
}
