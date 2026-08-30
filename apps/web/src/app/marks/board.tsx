'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Loader2,
  MousePointerClick,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { loadMarksBoard, saveMarksBoard, uploadMarkCover } from '@/lib/marks/cloud';
import { addFilter, allTags, applyMarksQuery, applySavedFilter, parseTags, removeFilter } from '@/lib/marks/filters';
import {
  countImported,
  looksLikeBookmarkHtml,
  mergeBookmarkImport,
  parseBookmarkHtml,
  parsePastedUrls,
} from '@/lib/marks/import-bookmarks';
import {
  formatKeepSummary,
  importKeepUploads,
  importPastedKeep,
  type KeepImportSummary,
} from '@/lib/marks/keep';
import {
  addButton,
  addCategory,
  addLink,
  buttonsInFolder,
  childCategories,
  createClientClock,
  emptyDoc,
  filterDoc,
  layoutMissingPositions,
  linksInCategory,
  looksLikeUrl,
  moveButton,
  moveCategory,
  moveLink,
  normalizeDoc,
  persistDoc,
  setCategoryPos,
  setLinkPos,
  removeButton,
  removeCategory,
  removeLink,
  renameCategory,
  revealFolder,
  seedDoc,
  setFolderCollapsed,
  updateButton,
  updateCategory,
  updateLink,
  type MarkCategory,
  type MarkLink,
  type MarksButton,
  type MarksClock,
  type MarksDoc,
} from '@/lib/marks/model';
import { videoSourceForLink } from '@/lib/marks/video';
import { BookmarkMedia } from './bookmark-media';
import {
  ButtonDialog,
  draftFromButton,
  draftFromLink,
  emptyButtonDraft,
  emptyLinkDraft,
  FilterDialog,
  FolderDialog,
  ImportDialog,
  LinkDialog,
  type ButtonDraft,
  type LinkDraft,
} from './dialogs';
import { KeepImportDialog } from './keep-import-dialog';
import { ACTION_GHOST, ACTION_PRIMARY, ACTION_TINY, BUTTON_CHIP, CHIP_IDLE, CHIP_ON, FIELD, LABEL, PANEL, SURFACE } from './ui';
import { Whiteboard } from './whiteboard';

const LOCAL_KEY = 'kjarni-marks-home';

function readLocal(): MarksDoc | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return normalizeDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(doc: MarksDoc) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(persistDoc(doc)));
}

function useMarksClock(): MarksClock {
  const ref = useRef<MarksClock | null>(null);
  if (!ref.current) ref.current = createClientClock();
  return ref.current;
}

export function MarksBoard() {
  const clock = useMarksClock();
  const [doc, setDoc] = useState<MarksDoc>(() => emptyDoc());
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('Loading…');
  const [fastUrl, setFastUrl] = useState('');
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [editingLink, setEditingLink] = useState<MarkLink | null>(null);
  const [buttonDraft, setButtonDraft] = useState<ButtonDraft | null>(null);
  const [editingButton, setEditingButton] = useState<MarksButton | null>(null);
  const [folderEdit, setFolderEdit] = useState<MarkCategory | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderCover, setFolderCover] = useState('');
  const [folderShowCover, setFolderShowCover] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importParent, setImportParent] = useState('');
  const [importPasted, setImportPasted] = useState('');
  const [showKeepImport, setShowKeepImport] = useState(false);
  const [keepPasted, setKeepPasted] = useState('');
  const [keepBusy, setKeepBusy] = useState(false);
  const [keepSummary, setKeepSummary] = useState<KeepImportSummary | null>(null);
  const [keepError, setKeepError] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterFolder, setFilterFolder] = useState('');
  const [highlightFolder, setHighlightFolder] = useState('');
  const [hoverLink, setHoverLink] = useState('');
  const loaded = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;

  const patch = useCallback((next: MarksDoc) => {
    setDoc(next);
    writeLocal(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readLocal();
      if (local && (local.links.length > 0 || local.categories.length > 0 || local.buttons.length > 0)) {
        setDoc(layoutMissingPositions(local));
      }
      try {
        const cloud = await loadMarksBoard();
        if (cancelled) return;
        if (cloud && cloud.updatedAt >= (local?.updatedAt ?? 0)) {
          const next = layoutMissingPositions(cloud);
          setDoc(next);
          writeLocal(next);
          setNote('Saved across devices');
        } else if (local) {
          setNote('This computer · saving to cloud…');
          await saveMarksBoard(local);
          if (!cancelled) setNote('Saved across devices');
        } else {
          const seeded = seedDoc(clock.now());
          setDoc(seeded);
          writeLocal(seeded);
          await saveMarksBoard(seeded);
          if (!cancelled) setNote('Starter kjarni links · saved across devices');
        }
      } catch (error) {
        if (!cancelled) {
          setNote(error instanceof Error ? error.message : 'Cloud unavailable — staying on this computer');
        }
      } finally {
        if (!cancelled) {
          loaded.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clock]);

  useEffect(() => {
    if (!loaded.current) return;
    const timer = window.setTimeout(() => {
      void saveMarksBoard(docRef.current)
        .then(() => setNote('Saved across devices'))
        .catch((error: unknown) => {
          setNote(error instanceof Error ? error.message : 'Cloud save failed');
        });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [doc]);

  const hydrated = useRef(false);
  useEffect(() => {
    if (!ready || hydrated.current) return;
    hydrated.current = true;
    const missing = docRef.current.links.filter((link) => !link.coverUrl && link.url && !link.url.startsWith('/'));
    void (async () => {
      for (const link of missing.slice(0, 16)) {
        try {
          const response = await fetch(`/api/marks/preview?url=${encodeURIComponent(link.url)}`);
          const data = (await response.json()) as { coverUrl?: string; description?: string };
          if (!data.coverUrl) continue;
          const latest = docRef.current.links.find((row) => row.id === link.id);
          if (!latest || latest.coverUrl) continue;
          patch(
            updateLink(
              docRef.current,
              link.id,
              { coverUrl: data.coverUrl, note: latest.note || data.description || '' },
              clock
            )
          );
        } catch {
          /* preview is best-effort */
        }
      }
    })();
  }, [ready, patch, clock]);

  const saved = doc.filters.find((filter) => filter.id === activeFilter);
  const shown = useMemo(() => {
    const filtered = saved ? applySavedFilter(doc, saved, query) : applyMarksQuery(doc, { query });
    return query.trim() && !saved ? filterDoc(doc, query) : filtered;
  }, [doc, query, saved]);

  const topFolders = childCategories(shown, null);
  const unfiledLinks = linksInCategory(shown, '');
  const toolbarButtons = buttonsInFolder(shown, '');
  const tags = allTags(doc);
  const emptyBoard = doc.categories.length === 0 && doc.links.length === 0 && (doc.buttons ?? []).length === 0;

  const apply = (next: MarksDoc, ok: string, fail: string) => {
    if (next === doc) {
      toast.error(fail);
      return false;
    }
    patch(next);
    toast.success(ok);
    return true;
  };

  const submitFastAdd = (raw = fastUrl) => {
    const text = raw.trim();
    if (!text) return;
    if (looksLikeBookmarkHtml(text)) {
      const imported = parseBookmarkHtml(text);
      const next = mergeBookmarkImport(doc, imported);
      if (apply(next, `Imported ${countImported(imported).links} links.`, 'Nothing to import.')) setFastUrl('');
      return;
    }
    const many = parsePastedUrls(text);
    if (many.length > 1) {
      let next = doc;
      for (const item of many) next = addLink(next, item, clock);
      if (apply(next, `Added ${many.length} links.`, 'Need a URL.')) setFastUrl('');
      return;
    }
    if (!looksLikeUrl(text) && many.length === 0) {
      toast.error('Paste a URL to add a link.');
      return;
    }
    const item = many[0] ?? { url: text, title: '', note: '' };
    if (apply(addLink(doc, item, clock), 'Link added.', 'Need a URL.')) setFastUrl('');
  };

  const runButton = (button: MarksButton) => {
    if (button.kind === 'url') {
      if (button.url.startsWith('/')) window.location.assign(button.url);
      else window.open(button.url, '_blank', 'noreferrer');
      return;
    }
    if (button.kind === 'filter-tag') {
      setActiveFilter('');
      setQuery(button.tag);
      return;
    }
    if (button.targetFolderId) {
      patch(revealFolder(doc, button.targetFolderId, clock));
      setHighlightFolder(button.targetFolderId);
      setQuery('');
      setActiveFilter('');
      window.setTimeout(() => {
        document.getElementById(`marks-folder-${button.targetFolderId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }, 40);
    }
  };

  const onDropItem = (categoryId: string, event: DragEvent) => {
    event.preventDefault();
    const linkId = event.dataTransfer.getData('text/marks-link');
    const buttonId = event.dataTransfer.getData('text/marks-button');
    if (linkId) apply(moveLink(doc, linkId, categoryId, clock), 'Moved link.', 'Could not move that link.');
    if (buttonId) apply(moveButton(doc, buttonId, categoryId, clock), 'Moved button.', 'Could not move that button.');
  };

  const submitLink = () => {
    if (!linkDraft) return;
    if (!editingLink && linkDraft.many.trim()) {
      const items = parsePastedUrls(linkDraft.many);
      if (items.length === 0) {
        toast.error('Need a URL.');
        return;
      }
      let next = doc;
      for (const item of items) {
        next = addLink(
          next,
          {
            ...item,
            categoryId: linkDraft.categoryId,
            tags: parseTags(linkDraft.tags),
          },
          clock
        );
      }
      if (apply(next, `Added ${items.length} links.`, 'Need a URL.')) {
        setLinkDraft(null);
        setEditingLink(null);
      }
      return;
    }
    const input = {
      title: linkDraft.title,
      url: linkDraft.url,
      note: linkDraft.note,
      categoryId: linkDraft.categoryId,
      tags: parseTags(linkDraft.tags),
      videoUrl: linkDraft.videoUrl,
      coverUrl: linkDraft.coverUrl,
      showImage: linkDraft.showImage,
      showUrl: linkDraft.showUrl,
      showDescription: linkDraft.showDescription,
    };
    const next = editingLink ? updateLink(doc, editingLink.id, input, clock) : addLink(doc, input, clock);
    if (apply(next, editingLink ? 'Link updated.' : 'Link added.', 'Need a URL.')) {
      setLinkDraft(null);
      setEditingLink(null);
    }
  };

  const submitButton = () => {
    if (!buttonDraft) return;
    const next = editingButton
      ? updateButton(doc, editingButton.id, buttonDraft, clock)
      : addButton(doc, buttonDraft, clock);
    if (apply(next, editingButton ? 'Button updated.' : 'Button added.', 'Fill the button fields.')) {
      setButtonDraft(null);
      setEditingButton(null);
    }
  };

  const importFile = async (file: File) => {
    const html = await file.text();
    const imported = parseBookmarkHtml(html);
    const next = mergeBookmarkImport(doc, imported, importParent || null);
    if (next === doc) {
      toast.error('No bookmarks found in that file.');
      return;
    }
    patch(next);
    setShowImport(false);
    const count = countImported(imported);
    toast.success(`Imported ${count.folders} folders and ${count.links} links.`);
  };

  const applyKeepResult = (result: { doc: MarksDoc; summary: KeepImportSummary }, empty: string) => {
    if (result.summary.notes === 0 && result.summary.links === 0) {
      setKeepError(empty);
      toast.error(empty);
      return false;
    }
    patch(result.doc);
    setKeepSummary(result.summary);
    setKeepError('');
    toast.success(formatKeepSummary(result.summary));
    return true;
  };

  const importKeepFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setKeepBusy(true);
    setKeepError('');
    try {
      const result = await importKeepUploads(doc, files, clock);
      applyKeepResult(result, 'No Keep notes found in that upload.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read that Keep export.';
      setKeepError(message);
      toast.error(message);
    } finally {
      setKeepBusy(false);
    }
  };

  const importKeepPaste = () => {
    const result = importPastedKeep(doc, keepPasted, clock);
    if (applyKeepResult(result, 'Paste Keep notes or URLs first.')) setKeepPasted('');
  };

  const uploadCover = async (file: File, into: 'link' | 'folder') => {
    try {
      const url = await uploadMarkCover(file, file.name);
      if (into === 'link' && linkDraft) setLinkDraft({ ...linkDraft, coverUrl: url });
      if (into === 'folder') setFolderCover(url);
      toast.success('Cover uploaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    }
  };

  return (
    <div className={`${SURFACE} min-h-dvh text-stone-900`}>
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <p className={LABEL}>Kjarni</p>
            <h1 className="text-2xl font-semibold tracking-tight">Marks</h1>
            <p className="text-sm text-stone-500">
              Folders, links, and buttons. Structured columns — same board on your phone.
            </p>
          </div>
          <p className="text-[0.7rem] text-stone-400">{ready ? note : 'Loading…'}</p>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-3">
          <label className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              className={`${FIELD} pl-9`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter name, URL, or tag"
            />
          </label>
          <form
            className="flex min-w-[12rem] flex-1 items-center gap-2 sm:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              submitFastAdd();
            }}
          >
            <input
              className={FIELD}
              value={fastUrl}
              onChange={(event) => setFastUrl(event.target.value)}
              onPaste={(event) => {
                const text = event.clipboardData.getData('text').trim();
                if (looksLikeUrl(text) || looksLikeBookmarkHtml(text) || parsePastedUrls(text).length > 1) {
                  event.preventDefault();
                  submitFastAdd(text);
                }
              }}
              placeholder="Paste a URL"
            />
          </form>
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={() => apply(addCategory(doc, 'Untitled', null, clock), 'Folder added.', 'Name the folder first.')}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Folder
          </button>
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={() => {
              setEditingLink(null);
              setLinkDraft(emptyLinkDraft(''));
            }}
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Link
          </button>
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={() => {
              setEditingButton(null);
              setButtonDraft(emptyButtonDraft(''));
            }}
          >
            <MousePointerClick className="h-3.5 w-3.5" />
            Button
          </button>
          <button type="button" className={ACTION_GHOST} onClick={() => setShowImport(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={() => {
              setKeepSummary(null);
              setKeepError('');
              setShowKeepImport(true);
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Import Google Keep
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 pb-3">
          {doc.filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={activeFilter === filter.id ? CHIP_ON : CHIP_IDLE}
              onClick={() => setActiveFilter(activeFilter === filter.id ? '' : filter.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                apply(removeFilter(doc, filter.id), `Removed ${filter.name}.`, 'Could not remove filter.');
                if (activeFilter === filter.id) setActiveFilter('');
              }}
            >
              {filter.name}
            </button>
          ))}
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={query === tag ? CHIP_ON : CHIP_IDLE}
              onClick={() => {
                setActiveFilter('');
                setQuery(query === tag ? '' : tag);
              }}
            >
              #{tag}
            </button>
          ))}
          <button type="button" className={ACTION_TINY} onClick={() => setShowFilter(true)}>
            + Filter
          </button>
        </div>
        {toolbarButtons.length > 0 ? (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 pb-4">
            {toolbarButtons.map((button) => (
              <MarkButtonChip
                key={button.id}
                button={button}
                folders={doc.categories}
                onRun={() => runButton(button)}
                onEdit={() => {
                  setEditingButton(button);
                  setButtonDraft(draftFromButton(button));
                }}
                onMove={(folderId) => apply(moveButton(doc, button.id, folderId, clock), 'Moved button.', 'Could not move.')}
              />
            ))}
          </div>
        ) : null}
      </header>

      <main className="overflow-auto px-3 py-4">
        {!ready ? (
          <p className="flex items-center gap-2 px-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Marks…
          </p>
        ) : query.trim() && topFolders.length === 0 && unfiledLinks.length === 0 && !saved ? (
          <p className={`${PANEL} mx-auto max-w-xl px-4 py-8 text-sm text-stone-500`}>Nothing matches that filter.</p>
        ) : emptyBoard ? (
          <div className={`${PANEL} col-span-full flex flex-col items-start gap-3 px-4 py-8`}>
            <p className="text-sm text-stone-500">
              Empty board. Add a folder, a link, or a button — or paste a URL above.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ACTION_PRIMARY}
                onClick={() => apply(addCategory(doc, 'Untitled', null, clock), 'Folder added.', 'Name the folder first.')}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Folder
              </button>
              <button
                type="button"
                className={ACTION_GHOST}
                onClick={() => {
                  setEditingLink(null);
                  setLinkDraft(emptyLinkDraft(''));
                }}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Link
              </button>
              <button
                type="button"
                className={ACTION_GHOST}
                onClick={() => {
                  setEditingButton(null);
                  setButtonDraft(emptyButtonDraft(''));
                }}
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                Button
              </button>
            </div>
          </div>
        ) : (
          <Whiteboard
            doc={shown}
            onRenameFolder={(id, name) => {
              patch(
                persistDoc({
                  ...doc,
                  updatedAt: clock.now(),
                  categories: doc.categories.map((category) =>
                    category.id === id ? { ...category, name } : category
                  ),
                })
              );
            }}
            onEditLink={(link) => {
              setEditingLink(link);
              setLinkDraft(draftFromLink(link));
            }}
            onAddLink={(categoryId) => {
              setEditingLink(null);
              setLinkDraft(emptyLinkDraft(categoryId));
            }}
            onEditFolder={(category) => {
              setFolderEdit(category);
              setFolderName(category.name);
              setFolderCover(category.coverUrl);
              setFolderShowCover(category.showCover);
            }}
            onDrop={(kind, id, target) => {
              if (kind === 'folder') {
                apply(moveCategory(doc, id, target, clock), 'Folder moved.', 'Could not nest that folder.');
                return;
              }
              apply(moveLink(doc, id, target ?? '', clock), 'Bookmark moved.', 'Could not move that bookmark.');
            }}
            onMove={(kind, id, x, y) => {
              if (kind === 'folder') {
                const category = doc.categories.find((row) => row.id === id);
                if (category?.parentId) {
                  const rooted = moveCategory(doc, id, null, clock);
                  patch(setCategoryPos(rooted, id, x, y, clock));
                  return;
                }
                patch(setCategoryPos(doc, id, x, y, clock));
                return;
              }
              const link = doc.links.find((row) => row.id === id);
              if (link?.categoryId) {
                const loose = moveLink(doc, id, '', clock);
                patch(setLinkPos(loose, id, x, y, clock));
                return;
              }
              patch(setLinkPos(doc, id, x, y, clock));
            }}
          />
        )}
      </main>

      {linkDraft ? (
        <LinkDialog
          doc={doc}
          editing={editingLink}
          draft={linkDraft}
          setDraft={setLinkDraft}
          onClose={() => {
            setLinkDraft(null);
            setEditingLink(null);
          }}
          onSubmit={submitLink}
          onDelete={
            editingLink
              ? () => {
                  apply(removeLink(doc, editingLink.id, clock), 'Link removed.', 'Could not delete.');
                  setLinkDraft(null);
                  setEditingLink(null);
                }
              : undefined
          }
          onUploadCover={(file) => void uploadCover(file, 'link')}
        />
      ) : null}

      {buttonDraft ? (
        <ButtonDialog
          doc={doc}
          editing={editingButton}
          draft={buttonDraft}
          setDraft={setButtonDraft}
          onClose={() => {
            setButtonDraft(null);
            setEditingButton(null);
          }}
          onSubmit={submitButton}
          onDelete={
            editingButton
              ? () => {
                  apply(removeButton(doc, editingButton.id, clock), 'Button removed.', 'Could not delete.');
                  setButtonDraft(null);
                  setEditingButton(null);
                }
              : undefined
          }
        />
      ) : null}

      {folderEdit ? (
        <FolderDialog
          category={folderEdit}
          name={folderName}
          setName={setFolderName}
          coverUrl={folderCover}
          setCoverUrl={setFolderCover}
          showCover={folderShowCover}
          setShowCover={setFolderShowCover}
          onClose={() => setFolderEdit(null)}
          onSave={() => {
            apply(
              updateCategory(
                doc,
                folderEdit.id,
                { name: folderName, coverUrl: folderCover, showCover: folderShowCover },
                clock
              ),
              'Folder saved.',
              'Name the folder first.'
            );
            setFolderEdit(null);
          }}
          onDelete={() => {
            apply(
              removeCategory(doc, folderEdit.id, clock),
              `Removed ${folderEdit.name}. Contents moved up.`,
              'Could not remove folder.'
            );
            setFolderEdit(null);
          }}
          onUploadCover={(file) => void uploadCover(file, 'folder')}
        />
      ) : null}

      {showImport ? (
        <ImportDialog
          doc={doc}
          parentId={importParent}
          setParentId={setImportParent}
          pasted={importPasted}
          setPasted={setImportPasted}
          onClose={() => setShowImport(false)}
          onFile={(file) => void importFile(file)}
          onPaste={() => {
            if (looksLikeBookmarkHtml(importPasted)) {
              const imported = parseBookmarkHtml(importPasted);
              const next = mergeBookmarkImport(doc, imported, importParent || null);
              if (apply(next, `Imported ${countImported(imported).links} links.`, 'Nothing to import.')) {
                setImportPasted('');
                setShowImport(false);
              }
              return;
            }
            const items = parsePastedUrls(importPasted);
            let next = doc;
            for (const item of items) next = addLink(next, { ...item, categoryId: importParent }, clock);
            if (apply(next, `Added ${items.length} links.`, 'Need a URL.')) {
              setImportPasted('');
              setShowImport(false);
            }
          }}
          onKeep={() => {
            setShowImport(false);
            setKeepSummary(null);
            setKeepError('');
            setShowKeepImport(true);
          }}
        />
      ) : null}

      {showKeepImport ? (
        <KeepImportDialog
          pasted={keepPasted}
          setPasted={setKeepPasted}
          busy={keepBusy}
          summary={keepSummary}
          error={keepError}
          onClose={() => setShowKeepImport(false)}
          onFiles={(files) => void importKeepFiles(files)}
          onPaste={importKeepPaste}
        />
      ) : null}

      {showFilter ? (
        <FilterDialog
          doc={doc}
          name={filterName}
          setName={setFilterName}
          query={filterQuery}
          setQuery={setFilterQuery}
          tag={filterTag}
          setTag={setFilterTag}
          categoryId={filterFolder}
          setCategoryId={setFilterFolder}
          tags={tags}
          onClose={() => setShowFilter(false)}
          onSave={() => {
            if (
              apply(
                addFilter(doc, {
                  name: filterName,
                  query: filterQuery,
                  tag: filterTag,
                  categoryId: filterFolder,
                }),
                'Filter added.',
                'Name the filter first.'
              )
            ) {
              setShowFilter(false);
              setFilterName('');
              setFilterQuery('');
              setFilterTag('');
              setFilterFolder('');
            }
          }}
        />
      ) : null}
    </div>
  );
}

function AddRow({
  onFolder,
  onLink,
  onButton,
}: {
  onFolder: () => void;
  onLink: () => void;
  onButton: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <button type="button" className={ACTION_TINY} onClick={onFolder}>
        + Folder
      </button>
      <button type="button" className={ACTION_TINY} onClick={onLink}>
        + Link
      </button>
      <button type="button" className={ACTION_TINY} onClick={onButton}>
        + Button
      </button>
    </div>
  );
}

function FolderColumn({
  doc,
  fullDoc,
  folder,
  highlightFolder,
  hoverLink,
  clock,
  nested,
  onHoverLink,
  onPatch,
  onApply,
  onAddLink,
  onEditLink,
  onAddButton,
  onEditButton,
  onEditFolder,
  onRunButton,
  onDropItem,
}: {
  doc: MarksDoc;
  fullDoc: MarksDoc;
  folder: MarkCategory;
  highlightFolder: string;
  hoverLink: string;
  clock: MarksClock;
  nested: boolean;
  onHoverLink: (id: string) => void;
  onPatch: (doc: MarksDoc) => void;
  onApply: (next: MarksDoc, ok: string, fail: string) => boolean;
  onAddLink: (categoryId: string) => void;
  onEditLink: (link: MarkLink) => void;
  onAddButton: (folderId: string) => void;
  onEditButton: (button: MarksButton) => void;
  onEditFolder: (category: MarkCategory) => void;
  onRunButton: (button: MarksButton) => void;
  onDropItem: (categoryId: string, event: DragEvent) => void;
}) {
  const links = linksInCategory(doc, folder.id);
  const buttons = buttonsInFolder(doc, folder.id);
  const children = childCategories(doc, folder.id);
  const count = links.length + buttons.length + children.length;

  return (
    <section
      id={`marks-folder-${folder.id}`}
      className={`${nested ? 'rounded-lg bg-stone-50/80 p-2' : `${PANEL} p-3`} flex flex-col ${
        highlightFolder === folder.id ? 'ring-2 ring-emerald-500' : ''
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropItem(folder.id, event)}
    >
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
          aria-label={folder.collapsed ? 'Open folder' : 'Collapse folder'}
          onClick={() => onPatch(setFolderCollapsed(fullDoc, folder.id, !folder.collapsed, clock))}
        >
          {folder.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
          value={folder.name}
          aria-label="Folder name"
          onChange={(event) => onPatch(renameCategory(fullDoc, folder.id, event.target.value || ' ', clock))}
          onBlur={(event) => {
            if (!event.target.value.trim()) onPatch(renameCategory(fullDoc, folder.id, 'Untitled', clock));
          }}
        />
        <span className="text-[0.65rem] text-stone-400">{count}</span>
        <select
          className="max-w-[7rem] rounded border border-transparent bg-transparent text-[0.65rem] text-stone-400 outline-none hover:border-stone-300"
          value={folder.parentId ?? ''}
          aria-label="Move folder"
          onChange={(event) =>
            onApply(moveCategory(fullDoc, folder.id, event.target.value || null, clock), 'Moved folder.', 'Could not move folder.')
          }
        >
          <option value="">Top level</option>
          {fullDoc.categories
            .filter((row) => row.id !== folder.id)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-stone-400 hover:text-stone-800"
          onClick={() => onEditFolder(folder)}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
          title="Remove folder — contents move to the parent (or Unfiled)"
          onClick={() =>
            onApply(
              removeCategory(fullDoc, folder.id, clock),
              `Removed ${folder.name}. Contents moved up.`,
              'Could not remove folder.'
            )
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {folder.collapsed ? (
        <p className="px-1 text-[0.7rem] text-stone-400">{count} items</p>
      ) : (
        <>
          {buttons.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {buttons.map((button) => (
                <MarkButtonChip
                  key={button.id}
                  button={button}
                  folders={fullDoc.categories}
                  onRun={() => onRunButton(button)}
                  onEdit={() => onEditButton(button)}
                  onMove={(folderId) =>
                    onApply(moveButton(fullDoc, button.id, folderId, clock), 'Moved button.', 'Could not move.')
                  }
                />
              ))}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                folders={fullDoc.categories}
                hovering={hoverLink === link.id}
                onHover={onHoverLink}
                onEdit={() => onEditLink(link)}
                onMove={(categoryId) =>
                  onApply(moveLink(fullDoc, link.id, categoryId, clock), 'Moved link.', 'Could not move.')
                }
              />
            ))}
          </ul>
          {children.map((child) => (
            <div key={child.id} className="mt-2 border-l-2 border-stone-100 pl-2">
              <FolderColumn
                doc={doc}
                fullDoc={fullDoc}
                folder={child}
                highlightFolder={highlightFolder}
                hoverLink={hoverLink}
                clock={clock}
                nested
                onHoverLink={onHoverLink}
                onPatch={onPatch}
                onApply={onApply}
                onAddLink={onAddLink}
                onEditLink={onEditLink}
                onAddButton={onAddButton}
                onEditButton={onEditButton}
                onEditFolder={onEditFolder}
                onRunButton={onRunButton}
                onDropItem={onDropItem}
              />
            </div>
          ))}
          {links.length === 0 && buttons.length === 0 && children.length === 0 ? (
            <p className="px-1 py-2 text-[0.75rem] text-stone-400">Empty folder</p>
          ) : null}
          <AddRow
            onFolder={() =>
              onApply(addCategory(fullDoc, 'Untitled', folder.id, clock), 'Folder added.', 'Name the folder first.')
            }
            onLink={() => onAddLink(folder.id)}
            onButton={() => onAddButton(folder.id)}
          />
        </>
      )}
    </section>
  );
}

function MarkButtonChip({
  button,
  folders,
  onRun,
  onEdit,
  onMove,
}: {
  button: MarksButton;
  folders: MarkCategory[];
  onRun: () => void;
  onEdit: () => void;
  onMove: (folderId: string) => void;
}) {
  return (
    <span
      className="group inline-flex items-center gap-0.5"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/marks-button', button.id);
      }}
    >
      <button type="button" className={BUTTON_CHIP} style={{ backgroundColor: button.color }} onClick={onRun}>
        {button.icon ? <span aria-hidden>{button.icon}</span> : null}
        {button.label}
      </button>
      <button type="button" className="rounded px-1 text-[0.6rem] font-bold text-stone-400 hover:text-stone-800" onClick={onEdit}>
        Edit
      </button>
      <select
        className="max-w-[5.5rem] bg-transparent text-[0.6rem] text-stone-400 outline-none"
        value={button.folderId}
        aria-label="Move button"
        onChange={(event) => onMove(event.target.value)}
      >
        <option value="">Toolbar</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    </span>
  );
}

function LinkRow({
  link,
  folders,
  hovering,
  onHover,
  onEdit,
  onMove,
}: {
  link: MarkLink;
  folders: MarkCategory[];
  hovering: boolean;
  onHover: (id: string) => void;
  onEdit: () => void;
  onMove: (categoryId: string) => void;
}) {
  const video = videoSourceForLink(link);
  return (
    <li>
      <div
        className="group flex items-stretch gap-1 rounded-lg hover:bg-stone-50"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/marks-link', link.id);
        }}
        onMouseEnter={() => onHover(link.id)}
        onMouseLeave={() => onHover('')}
      >
        <a
          href={link.url}
          target={link.url.startsWith('/') ? undefined : '_blank'}
          rel="noreferrer"
          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2"
        >
          {link.showImage || video ? (
            <BookmarkMedia link={link} video={video} hovering={hovering} />
          ) : null}
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
            {link.tags.length > 0 ? (
              <span className="mt-0.5 flex flex-wrap gap-1">
                {link.tags.map((tag) => (
                  <span key={tag} className="rounded bg-stone-100 px-1 text-[0.6rem] font-bold text-stone-500">
                    #{tag}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        </a>
        <select
          className="max-w-[6rem] self-center bg-transparent text-[0.6rem] text-stone-400 outline-none sm:opacity-0 sm:group-hover:opacity-100"
          value={link.categoryId}
          aria-label="Move to folder"
          onChange={(event) => onMove(event.target.value)}
        >
          <option value="">Unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="px-2 text-[0.65rem] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-800 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
    </li>
  );
}
