'use client';

import { useState } from 'react';
import type { PointerEvent } from 'react';
import { GripVertical, Play } from 'lucide-react';
import { faviconUrl, hostOf, type MarkCategory, type MarkLink, type MarksDoc } from '@/lib/marks/model';
import { childCategories, linksInCategory } from '@/lib/marks/model';
import { coverForLink, hoverVideoFor, type HoverVideo } from '@/lib/marks/video';
import { PANEL } from './ui';

function CoverImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (!src) {
    return <div className={`bg-gradient-to-br from-stone-200 to-emerald-100 ${className ?? ''}`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}

export function VideoHover({ video }: { video: HoverVideo }) {
  if (video.kind === 'file') {
    return (
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        src={video.src}
        autoPlay
        muted
        loop
        playsInline
        tabIndex={-1}
        aria-hidden
      />
    );
  }
  return (
    <iframe
      className="pointer-events-none absolute inset-0 h-full w-full border-0"
      src={video.src}
      title=""
      tabIndex={-1}
      aria-hidden
      allow="autoplay; encrypted-media"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

export function LinkCard({
  link,
  compact = false,
  onEdit,
  onDragStart,
}: {
  link: MarkLink;
  compact?: boolean;
  onEdit: (link: MarkLink) => void;
  onDragStart: (event: PointerEvent<HTMLButtonElement>, kind: 'link', id: string) => void;
}) {
  const video = hoverVideoFor(link);
  const [hovering, setHovering] = useState(false);
  const image = link.showImage ? coverForLink(link) : '';
  const showMedia = Boolean(link.showImage || video);

  return (
    <article
      data-mark-card="link"
      data-link-id={link.id}
      className={`${PANEL} group relative overflow-hidden ${compact ? 'w-full' : 'w-[16.5rem]'}`}
      onMouseEnter={() => {
        if (video) setHovering(true);
      }}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        className="absolute left-1 top-1 z-20 rounded bg-white/80 p-1 text-stone-400 hover:text-stone-800"
        aria-label="Drag bookmark"
        onPointerDown={(event) => onDragStart(event, 'link', link.id)}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <a
        href={link.url}
        target={link.url.startsWith('/') ? undefined : '_blank'}
        rel="noreferrer"
        className="block"
      >
        {showMedia ? (
          <div className="relative aspect-square overflow-hidden bg-stone-200" aria-hidden data-mark-cover-shape="square">
            {video && hovering ? <VideoHover video={video} /> : <CoverImage src={image} alt="" className="h-full w-full object-cover" />}
            {video && !hovering ? (
              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-stone-900/75 px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-wide text-white">
                <Play className="h-2.5 w-2.5 fill-current" />
                video
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-start gap-2 px-3 py-2">
          {faviconUrl(link.url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl(link.url)}
              alt=""
              className="mt-0.5 h-4 w-4 shrink-0 rounded"
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden';
              }}
            />
          ) : (
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded bg-emerald-100" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-stone-900">{link.title}</span>
            {link.showUrl ? (
              <span className="block truncate text-[0.7rem] text-stone-400">{hostOf(link.url) || link.url}</span>
            ) : null}
            {link.showDescription && link.note ? (
              <span className="mt-0.5 block line-clamp-2 text-[0.7rem] text-stone-500">{link.note}</span>
            ) : null}
          </span>
        </div>
      </a>
      {link.tags.length ? (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {link.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-emerald-800">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="absolute right-1 top-1 z-20 rounded bg-white/80 px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-stone-400 hover:text-stone-800 sm:opacity-0 sm:group-hover:opacity-100"
        onClick={() => onEdit(link)}
      >
        Edit
      </button>
    </article>
  );
}

export function FolderCard({
  doc,
  category,
  onEditLink,
  onAddLink,
  onRename,
  onEditFolder,
  onDragStart,
  nested = false,
  highlightId = '',
}: {
  doc: MarksDoc;
  category: MarkCategory;
  onEditLink: (link: MarkLink) => void;
  onAddLink: (categoryId: string) => void;
  onRename: (id: string, name: string) => void;
  onEditFolder: (category: MarkCategory) => void;
  onDragStart: (event: PointerEvent<HTMLButtonElement>, kind: 'folder' | 'link', id: string) => void;
  nested?: boolean;
  highlightId?: string;
}) {
  const links = linksInCategory(doc, category.id);
  const children = childCategories(doc, category.id);
  const cover = category.showCover
    ? category.coverUrl || links.find((link) => link.coverUrl)?.coverUrl || ''
    : '';

  return (
    <section
      data-mark-card="folder"
      data-folder-id={category.id}
      className={`${PANEL} ${nested ? 'w-full' : 'w-[20.5rem]'} overflow-hidden ${highlightId === category.id ? 'ring-2 ring-emerald-600' : ''}`}
    >
      {category.showCover ? (
        <div className="relative aspect-square w-24 overflow-hidden bg-gradient-to-br from-emerald-100 to-stone-200">
          <CoverImage src={cover} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 to-transparent" />
        </div>
      ) : null}
      <div className="-mt-6 flex items-center gap-1 px-2 pb-1">
        <button
          type="button"
          className="rounded bg-white/90 p-1 text-stone-400 hover:text-stone-800"
          aria-label="Drag folder"
          onPointerDown={(event) => onDragStart(event, 'folder', category.id)}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-white/90 px-1 py-0.5 text-sm font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
          value={category.name}
          aria-label="Folder name"
          onChange={(event) => onRename(category.id, event.target.value)}
          onBlur={(event) => {
            if (!event.target.value.trim()) onRename(category.id, 'Untitled');
          }}
        />
        <span className="text-[0.65rem] text-stone-400">{links.length + children.length}</span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-stone-400 hover:text-stone-800"
          onClick={() => onEditFolder(category)}
        >
          Edit
        </button>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {children.map((child) => (
          <FolderCard
            key={child.id}
            doc={doc}
            category={child}
            nested
            onEditLink={onEditLink}
            onAddLink={onAddLink}
            onRename={onRename}
            onEditFolder={onEditFolder}
            onDragStart={onDragStart}
            highlightId={highlightId}
          />
        ))}
        {links.map((link) => (
          <LinkCard key={link.id} link={link} compact onEdit={onEditLink} onDragStart={onDragStart} />
        ))}
        <button
          type="button"
          className="rounded-lg px-2 py-1.5 text-left text-[0.7rem] font-semibold text-stone-400 hover:bg-stone-50 hover:text-emerald-800"
          onClick={() => onAddLink(category.id)}
        >
          + Bookmark in {category.name}
        </button>
      </div>
    </section>
  );
}
