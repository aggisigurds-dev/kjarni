'use client';

/**
 * Structured folder columns. File name is whiteboard.tsx only because
 * board.tsx imports it — this is not a free-position canvas.
 */

import type { DragEvent } from 'react';
import {
  buttonsInFolder,
  childCategories,
  linksInCategory,
  type MarkCategory,
  type MarkLink,
  type MarksButton,
  type MarksDoc,
} from '@/lib/marks/model';
import { videoSourceForLink } from '@/lib/marks/video';
import { BookmarkMedia } from './bookmark-media';
import { ACTION_TINY, BUTTON_CHIP, PANEL } from './ui';

export function Whiteboard({
  doc,
  onRenameFolder,
  onEditLink,
  onAddLink,
  onAddFolder,
  onAddButton,
  onEditFolder,
  onEditButton,
  onRunButton,
  onMoveLink,
  onToggleFolder,
  onDeleteFolder,
  onDrop,
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
  onToggleFolder?: (id: string, collapsed: boolean) => void;
  onDeleteFolder?: (category: MarkCategory) => void;
  onDrop: (kind: 'folder' | 'link' | 'button', id: string, targetFolderId: string | null) => void;
  onMove?: (kind: 'folder' | 'link', id: string, x: number, y: number) => void;
}) {
  const roots = childCategories(doc, null);
  const unfiled = linksInCategory(doc, '');

  const dropOn = (folderId: string | null, event: DragEvent) => {
    event.preventDefault();
    const linkId = event.dataTransfer.getData('text/marks-link');
    const buttonId = event.dataTransfer.getData('text/marks-button');
    const folderDrag = event.dataTransfer.getData('text/marks-folder');
    if (linkId) onDrop('link', linkId, folderId);
    if (buttonId) onDrop('button', buttonId, folderId);
    if (folderDrag) onDrop('folder', folderDrag, folderId);
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-3">
      {roots.map((folder) => (
        <Column
          key={folder.id}
          doc={doc}
          folder={folder}
          nested={false}
          onRenameFolder={onRenameFolder}
          onEditLink={onEditLink}
          onAddLink={onAddLink}
          onAddFolder={onAddFolder}
          onAddButton={onAddButton}
          onEditFolder={onEditFolder}
          onEditButton={onEditButton}
          onRunButton={onRunButton}
          onMoveLink={onMoveLink}
          onToggleFolder={onToggleFolder}
          onDeleteFolder={onDeleteFolder}
          onDrop={dropOn}
        />
      ))}
      <section
        className={`${PANEL} flex flex-col p-3`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => dropOn(null, event)}
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-sm font-semibold">Unfiled</h2>
          <span className="text-[0.65rem] text-stone-400">{unfiled.length}</span>
        </div>
        {unfiled.length === 0 ? (
          <p className="px-1 py-3 text-[0.75rem] text-stone-400">Links with no folder land here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {unfiled.map((link) => (
              <LinkRow key={link.id} link={link} folders={doc.categories} onEdit={() => onEditLink(link)} onMove={onMoveLink} />
            ))}
          </ul>
        )}
        <AddRow
          onFolder={onAddFolder ? () => onAddFolder(null) : undefined}
          onLink={() => onAddLink('')}
          onButton={onAddButton ? () => onAddButton('') : undefined}
        />
      </section>
    </div>
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
  onRenameFolder,
  onEditLink,
  onAddLink,
  onAddFolder,
  onAddButton,
  onEditFolder,
  onEditButton,
  onRunButton,
  onMoveLink,
  onToggleFolder,
  onDeleteFolder,
  onDrop,
}: {
  doc: MarksDoc;
  folder: MarkCategory;
  nested: boolean;
  onRenameFolder: (id: string, name: string) => void;
  onEditLink: (link: MarkLink) => void;
  onAddLink: (categoryId: string) => void;
  onAddFolder?: (parentId: string | null) => void;
  onAddButton?: (folderId: string) => void;
  onEditFolder: (category: MarkCategory) => void;
  onEditButton?: (button: MarksButton) => void;
  onRunButton?: (button: MarksButton) => void;
  onMoveLink?: (id: string, categoryId: string) => void;
  onToggleFolder?: (id: string, collapsed: boolean) => void;
  onDeleteFolder?: (category: MarkCategory) => void;
  onDrop: (folderId: string | null, event: DragEvent) => void;
}) {
  const links = linksInCategory(doc, folder.id);
  const buttons = buttonsInFolder(doc, folder.id);
  const children = childCategories(doc, folder.id);
  const count = links.length + buttons.length + children.length;

  return (
    <section
      id={`marks-folder-${folder.id}`}
      className={`${nested ? 'rounded-lg bg-stone-50/80 p-2' : `${PANEL} p-3`} flex flex-col`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(folder.id, event)}
    >
      <div className="mb-2 flex items-center gap-1">
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
          onChange={(event) => onRenameFolder(folder.id, event.target.value)}
        />
        <span className="text-[0.65rem] text-stone-400">{count}</span>
        <button type="button" className="rounded px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase text-stone-400" onClick={() => onEditFolder(folder)}>
          Edit
        </button>
        {onDeleteFolder ? (
          <button type="button" className="rounded px-1 text-[0.6rem] font-bold text-rose-600" onClick={() => onDeleteFolder(folder)}>
            Delete
          </button>
        ) : null}
      </div>
      {folder.collapsed ? (
        <p className="px-1 text-[0.7rem] text-stone-400">{count} items</p>
      ) : (
        <>
          {buttons.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {buttons.map((button) => (
                <button
                  key={button.id}
                  type="button"
                  className={BUTTON_CHIP}
                  style={{ backgroundColor: button.color }}
                  onClick={() => onRunButton?.(button)}
                >
                  {button.icon ? <span aria-hidden>{button.icon}</span> : null}
                  {button.label}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <LinkRow key={link.id} link={link} folders={doc.categories} onEdit={() => onEditLink(link)} onMove={onMoveLink} />
            ))}
          </ul>
          {children.map((child) => (
            <div key={child.id} className="mt-2 border-l-2 border-stone-100 pl-2">
              <Column
                doc={doc}
                folder={child}
                nested
                onRenameFolder={onRenameFolder}
                onEditLink={onEditLink}
                onAddLink={onAddLink}
                onAddFolder={onAddFolder}
                onAddButton={onAddButton}
                onEditFolder={onEditFolder}
                onEditButton={onEditButton}
                onRunButton={onRunButton}
                onMoveLink={onMoveLink}
                onToggleFolder={onToggleFolder}
                onDeleteFolder={onDeleteFolder}
                onDrop={onDrop}
              />
            </div>
          ))}
          {count === 0 ? <p className="px-1 py-2 text-[0.75rem] text-stone-400">Empty folder</p> : null}
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
  onEdit,
  onMove,
}: {
  link: MarkLink;
  folders: MarkCategory[];
  onEdit: () => void;
  onMove?: (id: string, categoryId: string) => void;
}) {
  const video = videoSourceForLink(link);
  return (
    <li>
      <div
        className="group flex items-stretch gap-1 rounded-lg hover:bg-stone-50"
        draggable
        onDragStart={(event) => event.dataTransfer.setData('text/marks-link', link.id)}
      >
        <a
          href={link.url}
          target={link.url.startsWith('/') ? undefined : '_blank'}
          rel="noreferrer"
          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2"
        >
          {link.showImage || video ? <BookmarkMedia link={link} video={video} hovering={false} /> : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-stone-900">{link.title}</span>
            {link.showDescription && link.note ? (
              <span className="block truncate text-[0.7rem] text-stone-400">{link.note}</span>
            ) : null}
          </span>
        </a>
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
