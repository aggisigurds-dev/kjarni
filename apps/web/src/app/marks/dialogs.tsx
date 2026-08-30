'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { parseTags } from '@/lib/marks/filters';
import {
  BUTTON_COLORS,
  folderOptions,
  sortedCategories,
  type MarkCategory,
  type MarkLink,
  type MarksButton,
  type MarksButtonKind,
  type MarksDoc,
} from '@/lib/marks/model';
import { screenshotCoverUrl } from '@/lib/marks/preview';
import { imageFileFromClipboard } from '@/lib/marks/square-cover';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL } from './ui';

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[0.7rem] font-semibold text-stone-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
      />
      {label}
    </label>
  );
}

export interface LinkDraft {
  title: string;
  url: string;
  note: string;
  categoryId: string;
  tags: string;
  videoUrl: string;
  coverUrl: string;
  showImage: boolean;
  showUrl: boolean;
  showDescription: boolean;
  many: string;
}

export const emptyLinkDraft = (categoryId = ''): LinkDraft => ({
  title: '',
  url: '',
  note: '',
  categoryId,
  tags: '',
  videoUrl: '',
  coverUrl: '',
  showImage: true,
  showUrl: true,
  showDescription: true,
  many: '',
});

export function draftFromLink(link: MarkLink): LinkDraft {
  return {
    title: link.title,
    url: link.url,
    note: link.note,
    categoryId: link.categoryId,
    tags: link.tags.join(', '),
    videoUrl: link.videoUrl,
    coverUrl: link.coverUrl,
    showImage: link.showImage,
    showUrl: link.showUrl,
    showDescription: link.showDescription,
    many: '',
  };
}

export function LinkDialog({
  doc,
  editing,
  draft,
  setDraft,
  onClose,
  onSubmit,
  onDelete,
  onUploadCover,
  onFetchPreview,
  previewBusy = false,
}: {
  doc: MarksDoc;
  editing: MarkLink | null;
  draft: LinkDraft;
  setDraft: (draft: LinkDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  onUploadCover: (file: File) => void;
  onFetchPreview?: () => void;
  previewBusy?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const applyPageShot = () => {
    const coverUrl = screenshotCoverUrl(draft.url);
    if (!coverUrl) return;
    setDraft({ ...draft, coverUrl, showImage: true });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
      <form
        className={`${PANEL} max-h-[92dvh] w-full max-w-md overflow-y-auto p-4`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onPaste={(event) => {
          if (event.clipboardData.getData('text').trim()) return;
          const file = imageFileFromClipboard(event.clipboardData);
          if (!file) return;
          event.preventDefault();
          onUploadCover(file);
        }}
      >
        <h2 className="text-sm font-bold">{editing ? 'Edit bookmark' : 'Add bookmark'}</h2>
        {!editing ? (
          <label className="mt-3 block">
            <span className={`${LABEL} mb-1 block`}>Paste many URLs</span>
            <textarea
              className={`${FIELD} min-h-20`}
              value={draft.many}
              onChange={(event) => setDraft({ ...draft, many: event.target.value })}
              placeholder={'one per line, or several on one line\nbrunaholf.netlify.app Hub'}
            />
          </label>
        ) : null}
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>URL</span>
          <input
            className={FIELD}
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            placeholder="brunaholf.netlify.app"
            autoFocus={!draft.many}
            onBlur={() => onFetchPreview?.()}
          />
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Title</span>
          <input
            className={FIELD}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="Optional — uses the site name if empty"
          />
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Folder</span>
          <select
            className={FIELD}
            value={draft.categoryId}
            onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
          >
            <option value="">Unfiled</option>
            {sortedCategories(doc).map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentId ? `↳ ${category.name}` : category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Description</span>
          <input
            className={FIELD}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            placeholder="Optional"
          />
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Tags</span>
          <input
            className={FIELD}
            value={draft.tags}
            onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
            placeholder="work, kjarni"
          />
          {draft.tags.trim() ? (
            <span className="mt-1 block text-[0.65rem] text-stone-400">
              {parseTags(draft.tags).join(' · ')}
            </span>
          ) : null}
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Video URL</span>
          <input
            className={FIELD}
            value={draft.videoUrl}
            onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
            placeholder="YouTube, Vimeo, or .mp4 — plays on hover"
          />
        </label>
        <div className="mt-3">
          <span className={`${LABEL} mb-1 block`}>Cover</span>
          <div className="flex gap-2">
            <input
              className={FIELD}
              value={draft.coverUrl}
              onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
              placeholder="Image URL, or attach a screenshot"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadCover(file);
                event.target.value = '';
              }}
            />
            <button type="button" className={ACTION_GHOST} onClick={() => fileRef.current?.click()}>
              Attach
            </button>
            <button
              type="button"
              className={ACTION_GHOST}
              disabled={!screenshotCoverUrl(draft.url)}
              onClick={applyPageShot}
            >
              Screenshot
            </button>
            {onFetchPreview ? (
              <button type="button" className={ACTION_GHOST} disabled={previewBusy} onClick={onFetchPreview}>
                {previewBusy ? 'Fetching…' : 'Fetch cover'}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[0.65rem] text-stone-400">
            Paste a screenshot, or grab the first screen. It fits the square well.
          </p>
          {draft.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.coverUrl}
              alt=""
              className="mt-2 aspect-square h-24 w-24 rounded-md object-cover"
              data-mark-cover-shape="square"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <button
              type="button"
              className="mt-2 flex aspect-square h-24 w-24 items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-[0.65rem] font-bold uppercase tracking-wide text-stone-400"
              onClick={() => fileRef.current?.click()}
            >
              Square
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Toggle
            label="Show image"
            checked={draft.showImage}
            onChange={(showImage) => setDraft({ ...draft, showImage })}
          />
          <Toggle label="Show URL" checked={draft.showUrl} onChange={(showUrl) => setDraft({ ...draft, showUrl })} />
          <Toggle
            label="Show description"
            checked={draft.showDescription}
            onChange={(showDescription) => setDraft({ ...draft, showDescription })}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          {editing && onDelete ? (
            <button type="button" className={`${ACTION_GHOST} text-rose-700`} onClick={onDelete}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={ACTION_GHOST} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={ACTION_PRIMARY}>
              {editing ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function FolderDialog({
  category,
  name,
  setName,
  coverUrl,
  setCoverUrl,
  showCover,
  setShowCover,
  onClose,
  onSave,
  onDelete,
  onUploadCover,
  screenshotUrl = '',
}: {
  category: MarkCategory;
  name: string;
  setName: (value: string) => void;
  coverUrl: string;
  setCoverUrl: (value: string) => void;
  showCover: boolean;
  setShowCover: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onUploadCover: (file: File) => void;
  screenshotUrl?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pageShot = screenshotCoverUrl(screenshotUrl);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
      <form
        className={`${PANEL} w-full max-w-md p-4`}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <h2 className="text-sm font-bold">Folder</h2>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Name</span>
          <input className={FIELD} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div
          className="mt-3"
          onPaste={(event) => {
            if (event.clipboardData.getData('text').trim()) return;
            const file = imageFileFromClipboard(event.clipboardData);
            if (!file) return;
            event.preventDefault();
            onUploadCover(file);
          }}
        >
          <span className={`${LABEL} mb-1 block`}>Cover</span>
          <div className="flex gap-2">
            <input
              className={FIELD}
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              placeholder="Screenshot or image URL"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadCover(file);
                event.target.value = '';
              }}
            />
            <button type="button" className={ACTION_GHOST} onClick={() => fileRef.current?.click()}>
              Attach
            </button>
            <button
              type="button"
              className={ACTION_GHOST}
              disabled={!pageShot}
              onClick={() => {
                if (!pageShot) return;
                setCoverUrl(pageShot);
                setShowCover(true);
              }}
            >
              Screenshot
            </button>
          </div>
          <p className="mt-1 text-[0.65rem] text-stone-400">Paste a screenshot — it crops to the square.</p>
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="mt-2 aspect-square h-24 w-24 rounded-md object-cover"
              data-mark-cover-shape="square"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
        </div>
        <div className="mt-3">
          <Toggle label="Show cover" checked={showCover} onChange={setShowCover} />
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <button type="button" className={`${ACTION_GHOST} text-rose-700`} onClick={onDelete}>
            Delete folder
          </button>
          <div className="flex gap-2">
            <button type="button" className={ACTION_GHOST} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={ACTION_PRIMARY}>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ImportDialog({
  doc,
  parentId,
  setParentId,
  pasted,
  setPasted,
  onClose,
  onFile,
  onPaste,
  onKeep,
}: {
  doc: MarksDoc;
  parentId: string;
  setParentId: (value: string) => void;
  pasted: string;
  setPasted: (value: string) => void;
  onClose: () => void;
  onFile: (file: File) => void;
  onPaste: () => void;
  onKeep?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
      <div className={`${PANEL} w-full max-w-lg p-4`}>
        <h2 className="text-sm font-bold">Import bookmark folder</h2>
        <p className="mt-1 text-sm text-stone-500">
          Chrome: Bookmarks → Import and export → Export bookmarks to HTML. Firefox: Bookmarks → Manage → Import
          and Backup → Export. Each folder becomes a category; nested folders stay nested. You can import again
          any time.
        </p>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Add into</span>
          <select className={FIELD} value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Top level</option>
            {sortedCategories(doc).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${PANEL} mt-3 flex w-full flex-col items-center gap-2 border-dashed px-4 py-8 text-sm text-stone-500 hover:border-emerald-600 hover:text-emerald-800`}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-5 w-5" />
          Drop bookmarks.html here, or pick a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm,text/html"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Or paste URLs</span>
          <textarea
            className={`${FIELD} min-h-24`}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={'https://brunaholf.netlify.app\nhttps://slokkvitaeki.netlify.app'}
          />
        </label>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onKeep ? (
            <button type="button" className={`${ACTION_GHOST} mr-auto`} onClick={onKeep}>
              Import Google Keep
            </button>
          ) : null}
          <button type="button" className={ACTION_GHOST} onClick={onClose}>
            Close
          </button>
          <button type="button" className={ACTION_PRIMARY} onClick={onPaste}>
            Add URLs
          </button>
        </div>
      </div>
    </div>
  );
}

export function FilterDialog({
  doc,
  name,
  setName,
  query,
  setQuery,
  tag,
  setTag,
  categoryId,
  setCategoryId,
  tags,
  onClose,
  onSave,
}: {
  doc: MarksDoc;
  name: string;
  setName: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  tag: string;
  setTag: (value: string) => void;
  categoryId: string;
  setCategoryId: (value: string) => void;
  tags: string[];
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
      <form
        className={`${PANEL} w-full max-w-md p-4`}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <h2 className="text-sm font-bold">New filter chip</h2>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Name</span>
          <input
            className={FIELD}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Work"
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Search</span>
          <input
            className={FIELD}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Optional text"
          />
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Tag</span>
          <select className={FIELD} value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">Any tag</option>
            {tags.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Folder</span>
          <select className={FIELD} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Any folder</option>
            {sortedCategories(doc).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ACTION_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ACTION_PRIMARY}>
            Save chip
          </button>
        </div>
      </form>
    </div>
  );
}

export interface ButtonDraft {
  label: string;
  kind: MarksButtonKind;
  url: string;
  tag: string;
  targetFolderId: string;
  icon: string;
  color: string;
  folderId: string;
}

export const emptyButtonDraft = (folderId = ''): ButtonDraft => ({
  label: '',
  kind: 'url',
  url: '',
  tag: '',
  targetFolderId: '',
  icon: '',
  color: BUTTON_COLORS[0],
  folderId,
});

export function draftFromButton(button: MarksButton): ButtonDraft {
  return {
    label: button.label,
    kind: button.kind,
    url: button.url,
    tag: button.tag,
    targetFolderId: button.targetFolderId,
    icon: button.icon,
    color: button.color,
    folderId: button.folderId,
  };
}

export function ButtonDialog({
  doc,
  editing,
  draft,
  setDraft,
  onClose,
  onSubmit,
  onDelete,
}: {
  doc: MarksDoc;
  editing: MarksButton | null;
  draft: ButtonDraft;
  setDraft: (draft: ButtonDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
      <form
        className={`${PANEL} w-full max-w-md p-4`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 className="text-sm font-bold">{editing ? 'Edit button' : 'Add button'}</h2>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Label</span>
          <input
            className={FIELD}
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Action</span>
          <select
            className={FIELD}
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as MarksButtonKind })}
          >
            <option value="url">Open a URL</option>
            <option value="filter-tag">Filter by tag</option>
            <option value="open-folder">Open a folder</option>
          </select>
        </label>
        {draft.kind === 'url' ? (
          <label className="mt-3 block">
            <span className={`${LABEL} mb-1 block`}>URL</span>
            <input
              className={FIELD}
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            />
          </label>
        ) : null}
        {draft.kind === 'filter-tag' ? (
          <label className="mt-3 block">
            <span className={`${LABEL} mb-1 block`}>Tag</span>
            <input
              className={FIELD}
              value={draft.tag}
              onChange={(event) => setDraft({ ...draft, tag: event.target.value })}
            />
          </label>
        ) : null}
        {draft.kind === 'open-folder' ? (
          <label className="mt-3 block">
            <span className={`${LABEL} mb-1 block`}>Folder</span>
            <select
              className={FIELD}
              value={draft.targetFolderId}
              onChange={(event) => setDraft({ ...draft, targetFolderId: event.target.value })}
            >
              {folderOptions(doc).map((option) => (
                <option key={option.id} value={option.id}>
                  {`${'· '.repeat(option.depth)}${option.name}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Icon</span>
          <input
            className={FIELD}
            value={draft.icon}
            onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            placeholder="Optional emoji"
          />
        </label>
        <div className="mt-3">
          <span className={`${LABEL} mb-1 block`}>Color</span>
          <div className="flex flex-wrap gap-2">
            {BUTTON_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`h-6 w-6 rounded-full ${draft.color === preset ? 'ring-2 ring-stone-900 ring-offset-2' : ''}`}
                style={{ backgroundColor: preset }}
                aria-label={preset}
                onClick={() => setDraft({ ...draft, color: preset })}
              />
            ))}
          </div>
        </div>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Lives on</span>
          <select
            className={FIELD}
            value={draft.folderId}
            onChange={(event) => setDraft({ ...draft, folderId: event.target.value })}
          >
            <option value="">Board toolbar</option>
            {folderOptions(doc).map((option) => (
              <option key={option.id} value={option.id}>
                {`${'· '.repeat(option.depth)}${option.name}`}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          {editing && onDelete ? (
            <button type="button" className={`${ACTION_GHOST} text-rose-700`} onClick={onDelete}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={ACTION_GHOST} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={ACTION_PRIMARY}>
              {editing ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
