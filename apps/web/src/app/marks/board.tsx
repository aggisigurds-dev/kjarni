'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, FolderPlus, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { loadMarksBoard, saveMarksBoard } from '@/lib/marks/cloud';
import {
  addCategory,
  addLink,
  faviconUrl,
  filterDoc,
  linksInCategory,
  removeCategory,
  removeLink,
  renameCategory,
  seedDoc,
  sortedCategories,
  updateLink,
  type MarkLink,
  type MarksDoc,
} from '@/lib/marks/model';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL, SURFACE } from './ui';

const LOCAL_KEY = 'kjarni-marks-home';

function readLocal(): MarksDoc | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarksDoc;
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.links)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(doc: MarksDoc) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
}

export function MarksBoard() {
  const [doc, setDoc] = useState<MarksDoc>(() => seedDoc());
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('Loading…');
  const [showAdd, setShowAdd] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState<MarkLink | null>(null);
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
      if (local && (local.links.length > 0 || local.categories.length > 0)) {
        setDoc(local);
      }
      try {
        const cloud = await loadMarksBoard();
        if (cancelled) return;
        if (cloud && cloud.updatedAt >= (local?.updatedAt ?? 0)) {
          setDoc(cloud);
          writeLocal(cloud);
          setNote('Saved across devices');
        } else if (local) {
          setNote('This computer · saving to cloud…');
          await saveMarksBoard(local);
          if (!cancelled) setNote('Saved across devices');
        } else {
          const seeded = seedDoc();
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
  }, []);

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

  useEffect(() => {
    if (!draftCategory && doc.categories[0]) setDraftCategory(doc.categories[0].id);
  }, [doc.categories, draftCategory]);

  const shown = useMemo(() => filterDoc(doc, query), [doc, query]);
  const categories = sortedCategories(shown);

  const submitLink = () => {
    const next = editing
      ? updateLink(doc, editing.id, {
          title: draftTitle,
          url: draftUrl,
          note: draftNote,
          categoryId: draftCategory,
        })
      : addLink(doc, {
          categoryId: draftCategory,
          title: draftTitle,
          url: draftUrl,
          note: draftNote,
        });
    if (next === doc) {
      toast.error(editing ? 'Could not update that bookmark.' : 'Need a URL and a category.');
      return;
    }
    patch(next);
    setShowAdd(false);
    setEditing(null);
    setDraftTitle('');
    setDraftUrl('');
    setDraftNote('');
    toast.success(editing ? 'Bookmark updated.' : 'Bookmark added.');
  };

  const submitCategory = () => {
    const next = addCategory(doc, newCategory);
    if (next === doc) {
      toast.error('Name the category first.');
      return;
    }
    patch(next);
    setNewCategory('');
    const created = next.categories[next.categories.length - 1];
    if (created) setDraftCategory(created.id);
    toast.success(`Category ${created?.name ?? ''} added.`);
  };

  return (
    <div className={`${SURFACE} min-h-dvh text-stone-900`}>
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <p className={LABEL}>Kjarni</p>
            <h1 className="text-2xl font-semibold tracking-tight">Marks</h1>
            <p className="text-sm text-stone-500">Frontpage bookmarks, in categories. Same list on your phone.</p>
          </div>
          <p className="text-[0.7rem] text-stone-400">{ready ? note : 'Loading…'}</p>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-4">
          <label className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              className={`${FIELD} pl-9`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter name or URL"
            />
          </label>
          <button type="button" className={ACTION_GHOST} onClick={() => setShowAdd(true)}>
            <BookmarkPlus className="h-3.5 w-3.5" />
            Add bookmark
          </button>
          <form
            className="flex min-w-[14rem] flex-1 items-center gap-2 sm:max-w-sm sm:flex-none"
            onSubmit={(event) => {
              event.preventDefault();
              submitCategory();
            }}
          >
            <input
              className={FIELD}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="New category"
            />
            <button type="submit" className={ACTION_GHOST}>
              <FolderPlus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-2 xl:grid-cols-3">
        {!ready ? (
          <p className="col-span-full flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Marks…
          </p>
        ) : categories.length === 0 ? (
          <p className={`${PANEL} col-span-full px-4 py-8 text-sm text-stone-500`}>
            {query.trim()
              ? 'Nothing matches that filter.'
              : 'Add a category, then drop bookmarks into it.'}
          </p>
        ) : (
          categories.map((category) => {
            const links = linksInCategory(shown, category.id);
            return (
              <section key={category.id} className={`${PANEL} flex flex-col p-3`}>
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
                    value={category.name}
                    aria-label="Category name"
                    onChange={(event) =>
                      patch({
                        ...doc,
                        updatedAt: Date.now(),
                        categories: doc.categories.map((row) =>
                          row.id === category.id ? { ...row, name: event.target.value } : row
                        ),
                      })
                    }
                    onBlur={(event) => {
                      if (!event.target.value.trim()) {
                        patch(renameCategory(doc, category.id, 'Untitled'));
                      }
                    }}
                  />
                  <span className="text-[0.65rem] text-stone-400">{links.length}</span>
                  <button
                    type="button"
                    className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                    title="Remove category and its bookmarks"
                    onClick={() => {
                      patch(removeCategory(doc, category.id));
                      toast.success(`Removed ${category.name}.`);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ul className="flex flex-col gap-1">
                  {links.map((link) => (
                    <li key={link.id}>
                      <div className="group flex items-stretch gap-1 rounded-lg hover:bg-stone-50">
                        <a
                          href={link.url}
                          target={link.url.startsWith('/') ? undefined : '_blank'}
                          rel="noreferrer"
                          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2"
                        >
                          {faviconUrl(link.url) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={faviconUrl(link.url)}
                              alt=""
                              className="h-5 w-5 shrink-0 rounded"
                            />
                          ) : (
                            <span className="h-5 w-5 shrink-0 rounded bg-emerald-100" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-stone-900">
                              {link.title}
                            </span>
                            <span className="block truncate text-[0.7rem] text-stone-400">
                              {link.note || link.url}
                            </span>
                          </span>
                        </a>
                        <button
                          type="button"
                          className="px-2 text-[0.65rem] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-800 sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => {
                            setEditing(link);
                            setDraftTitle(link.title);
                            setDraftUrl(link.url);
                            setDraftNote(link.note);
                            setDraftCategory(link.categoryId);
                            setShowAdd(true);
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-2 rounded-lg px-2 py-1.5 text-left text-[0.7rem] font-semibold text-stone-400 hover:bg-stone-50 hover:text-emerald-800"
                  onClick={() => {
                    setEditing(null);
                    setDraftTitle('');
                    setDraftUrl('');
                    setDraftNote('');
                    setDraftCategory(category.id);
                    setShowAdd(true);
                  }}
                >
                  + Bookmark in {category.name}
                </button>
              </section>
            );
          })
        )}
      </main>

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
          <form
            className={`${PANEL} w-full max-w-md p-4`}
            onSubmit={(event) => {
              event.preventDefault();
              submitLink();
            }}
          >
            <h2 className="text-sm font-bold">{editing ? 'Edit bookmark' : 'Add bookmark'}</h2>
            <label className="mt-3 block">
              <span className={`${LABEL} mb-1 block`}>URL</span>
              <input
                className={FIELD}
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.target.value)}
                placeholder="brunaholf.netlify.app"
                autoFocus
              />
            </label>
            <label className="mt-3 block">
              <span className={`${LABEL} mb-1 block`}>Title</span>
              <input
                className={FIELD}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Optional — uses the site name if empty"
              />
            </label>
            <label className="mt-3 block">
              <span className={`${LABEL} mb-1 block`}>Category</span>
              <select
                className={FIELD}
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.target.value)}
              >
                {sortedCategories(doc).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className={`${LABEL} mb-1 block`}>Note</span>
              <input
                className={FIELD}
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              {editing ? (
                <button
                  type="button"
                  className={`${ACTION_GHOST} text-rose-700`}
                  onClick={() => {
                    patch(removeLink(doc, editing.id));
                    setShowAdd(false);
                    setEditing(null);
                    toast.success('Bookmark removed.');
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  className={ACTION_GHOST}
                  onClick={() => {
                    setShowAdd(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={ACTION_PRIMARY}>
                  {editing ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
