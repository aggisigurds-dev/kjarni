'use client';

/**
 * The Partasafn: the parts library, as a window of pictures.
 *
 *  - Uppáhalds — the starred parts of the library.
 *  - Safnið — every part saved into the library, each under its own name,
 *    to rename, star or delete.
 *  - Allir partar — every part of every build, here or on Supabase, to save
 *    into the library under a name.
 *
 * Tick any number, from any tab, and open them together as a new board — or,
 * on the bench, put them into the build that is open.
 *
 * A part that has no picture yet — a build made on another computer — is
 * drawn when its card comes into view, one at a time, and the picture is kept
 * on this computer so it is drawn only once.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Layers, Library, Loader2, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { lookFor } from '@/lib/3dwork/finish';
import {
  addFavorite,
  listFavorites,
  loadFavoriteGeometry,
  removeFavorite,
  renameFavorite,
  starFavorite,
  type Favorite,
} from '@/lib/3dwork/favorites';
import { formatCount } from '@/lib/3dwork/format';
import { buildBoard, failureNote, partsOfBuilds, type BoardItem, type BuildPart } from '@/lib/3dwork/parts-library';
import type { Project } from '@/lib/3dwork/project';
import { listProjects, loadGeometry, loadThumbnail, saveThumbnail } from '@/lib/3dwork/storage';
import { listCloudBuildParts, loadCloudGeometry } from '@/lib/3dwork/supabase-sync';
import { renderThumbnail } from './thumbnail';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, PANEL } from './ui';

export type LibraryTab = 'starred' | 'library' | 'builds';

/** One card: a part of the library, or a part of a build. */
type Entry =
  | { kind: 'library'; key: string; favorite: Favorite }
  | { kind: 'build'; key: string; part: BuildPart };

const nameOf = (entry: Entry) => (entry.kind === 'library' ? entry.favorite.name : entry.part.name);
const versionOf = (entry: Entry) => (entry.kind === 'library' ? entry.favorite.versionId : entry.part.versionId);
const pictureOf = (entry: Entry) => (entry.kind === 'library' ? entry.favorite.thumbnail : entry.part.thumbnail);

/** The mesh of a card's part: from the library's shelf, or this computer's copy, or Supabase. */
async function meshOf(entry: Entry): Promise<Float32Array | null> {
  if (entry.kind === 'library') return loadFavoriteGeometry(entry.favorite.versionId);
  return (await loadGeometry(entry.part.versionId)) ?? loadCloudGeometry(entry.part.projectId, entry.part.versionId);
}

function lookOf(entry: Entry) {
  return lookFor(
    entry.kind === 'library'
      ? { color: entry.favorite.color, finishId: entry.favorite.finishId }
      : { color: entry.part.color, finishId: entry.part.finishId }
  );
}

/** A picture small enough to keep many of in the library's document: WebP where the browser can write it. */
async function compactPicture(dataUrl: string): Promise<string> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    const webp = canvas.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl;
  } catch {
    return dataUrl;
  }
}

/** Pictures still to draw, one at a time: a mesh can be tens of megabytes. */
const drawQueue: (() => Promise<void>)[] = [];
let drawing = false;
function queueDrawing(job: () => Promise<void>): void {
  drawQueue.push(job);
  if (drawing) return;
  drawing = true;
  void (async () => {
    for (let next = drawQueue.shift(); next; next = drawQueue.shift()) {
      try {
        await next();
      } catch {
        /* a picture that cannot be drawn stays a placeholder */
      }
    }
    drawing = false;
  })();
}
/** Pictures drawn this visit, by version id. */
const drawn = new Map<string, string>();

/** A card's picture: the one it came with, the one drawn before, or one drawn when the card comes into view. */
function Picture({ entry }: { entry: Entry }) {
  const own = pictureOf(entry);
  const versionId = versionOf(entry);
  const [picture, setPicture] = useState<string | undefined>(own ?? drawn.get(versionId));
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (picture || !box.current) return;
    let cancelled = false;
    const observer = new IntersectionObserver((seen) => {
      if (!seen.some((item) => item.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const kept = await loadThumbnail(versionId);
        if (kept) {
          drawn.set(versionId, kept);
          if (!cancelled) setPicture(kept);
          return;
        }
        queueDrawing(async () => {
          if (cancelled || drawn.has(versionId)) {
            if (!cancelled) setPicture(drawn.get(versionId));
            return;
          }
          const soup = await meshOf(entry);
          if (!soup) return;
          const look = lookOf(entry);
          const made = renderThumbnail(soup, look.color, look);
          if (!made) return;
          const small = await compactPicture(made);
          drawn.set(versionId, small);
          void saveThumbnail(versionId, small);
          if (!cancelled) setPicture(small);
        });
      })();
    });
    observer.observe(box.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [picture, versionId, entry]);

  return (
    <div ref={box} className="flex h-28 items-center justify-center bg-slate-100">
      {picture ? (
        // A data URL drawn in the browser; next/image would only add a hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" className="h-full w-full object-contain" />
      ) : (
        <Layers className="h-8 w-8 text-slate-300" />
      )}
    </div>
  );
}

interface PartsLibraryProps {
  open: boolean;
  onClose: () => void;
  /** Open the ticked parts together as a new board. */
  onOpenBoard: (board: { project: Project; geometries: Map<string, Float32Array> }) => void | Promise<void>;
  /** On the bench: put the ticked parts into the build that is open. */
  onAddToBench?: (items: BoardItem[]) => void | Promise<void>;
  initialTab?: LibraryTab;
}

const TABS: { tab: LibraryTab; label: string }[] = [
  { tab: 'starred', label: 'Uppáhalds' },
  { tab: 'library', label: 'Safnið' },
  { tab: 'builds', label: 'Allir partar' },
];

export function PartsLibrary({ open, onClose, onOpenBoard, onAddToBench, initialTab = 'library' }: PartsLibraryProps) {
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [library, setLibrary] = useState<Favorite[] | null>(null);
  const [buildParts, setBuildParts] = useState<BuildPart[] | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [boardName, setBoardName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Inline edits: a library part being renamed, a build part being saved under a name, a delete to confirm.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState<{ key: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const reloadLibrary = useCallback(async () => {
    try {
      setLibrary(await listFavorites());
    } catch (error) {
      setLibrary([]);
      toast.error(failureNote(error, 'Náði ekki í Partasafnið.'));
    }
  }, []);

  // Escape closes the window — unless it was meant for a name being typed on a card.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setTicked(new Set());
    setSearch('');
    setRenaming(null);
    setSaving(null);
    setDeleting(null);
    void reloadLibrary();
    let cancelled = false;
    void (async () => {
      const local = (await listProjects()).map((project) => ({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt ?? 0,
        parts: project.parts,
      }));
      if (!cancelled) setBuildParts(partsOfBuilds(local, []));
      try {
        const cloud = await listCloudBuildParts();
        if (!cancelled) setBuildParts(partsOfBuilds(local, cloud));
      } catch {
        if (!cancelled) setCloudFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialTab, reloadLibrary]);

  const entries = useMemo<Entry[]>(() => {
    const libraryEntries = (library ?? []).map<Entry>((favorite) => ({
      kind: 'library',
      key: `lib:${favorite.id}`,
      favorite,
    }));
    const list =
      tab === 'builds'
        ? (buildParts ?? []).map<Entry>((part) => ({ kind: 'build', key: `build:${part.key}`, part }))
        : tab === 'starred'
          ? libraryEntries.filter((entry) => entry.kind === 'library' && entry.favorite.starred)
          : libraryEntries;
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((entry) =>
      [nameOf(entry), entry.kind === 'build' ? entry.part.projectName : '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [tab, library, buildParts, search]);

  // Every ticked card, from every tab, in the order they were ticked.
  const tickedEntries = useMemo(() => {
    const all = new Map<string, Entry>();
    for (const favorite of library ?? []) all.set(`lib:${favorite.id}`, { kind: 'library', key: `lib:${favorite.id}`, favorite });
    for (const part of buildParts ?? []) all.set(`build:${part.key}`, { kind: 'build', key: `build:${part.key}`, part });
    return [...ticked].map((key) => all.get(key)).filter((entry): entry is Entry => Boolean(entry));
  }, [ticked, library, buildParts]);

  const toggle = (key: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** The ticked parts with their meshes, ready for a board. */
  const gather = useCallback(async (): Promise<BoardItem[] | null> => {
    const items: BoardItem[] = [];
    for (const [index, entry] of tickedEntries.entries()) {
      setBusy(`Sæki ${nameOf(entry)} (${index + 1}/${tickedEntries.length})…`);
      const soup = await meshOf(entry);
      if (!soup) {
        toast.error(`Fann ekki möskvann í ${nameOf(entry)}.`);
        return null;
      }
      const source = entry.kind === 'library' ? entry.favorite : entry.part;
      items.push({
        name: nameOf(entry),
        color: source.color,
        finishId: source.finishId,
        materialId: source.materialId,
        thumbnail: pictureOf(entry) ?? drawn.get(versionOf(entry)),
        soup,
      });
    }
    return items;
  }, [tickedEntries]);

  const openBoard = useCallback(async () => {
    try {
      const items = await gather();
      if (!items) return;
      setBusy('Opna nýtt board…');
      await onOpenBoard(buildBoard(boardName || `Partasafn · ${items.length} partar`, items));
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að opna partana.'));
    } finally {
      setBusy(null);
    }
  }, [gather, boardName, onOpenBoard]);

  const addToBench = useCallback(async () => {
    if (!onAddToBench) return;
    try {
      const items = await gather();
      if (!items) return;
      setBusy('Set á bekkinn…');
      await onAddToBench(items);
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að setja partana á bekkinn.'));
    } finally {
      setBusy(null);
    }
  }, [gather, onAddToBench]);

  const saveToLibrary = useCallback(
    async (part: BuildPart, name: string) => {
      setBusy(`Vista ${name} í Partasafn…`);
      try {
        const entry: Entry = { kind: 'build', key: `build:${part.key}`, part };
        const soup = await meshOf(entry);
        if (!soup) throw new Error(`Fann ekki möskvann í ${part.name}.`);
        const look = lookOf(entry);
        const picture = part.thumbnail ?? drawn.get(part.versionId) ?? renderThumbnail(soup, look.color, look);
        await addFavorite(
          {
            name,
            color: part.color,
            materialId: part.materialId,
            finishId: part.finishId,
            thumbnail: picture ? await compactPicture(picture) : undefined,
          },
          soup
        );
        setSaving(null);
        await reloadLibrary();
        toast.success(`Vistað í Partasafn sem „${name}“.`);
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að vista partinn.'));
      } finally {
        setBusy(null);
      }
    },
    [reloadLibrary]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      try {
        await renameFavorite(id, name);
        setRenaming(null);
        setLibrary((current) => current?.map((favorite) => (favorite.id === id ? { ...favorite, name: name.trim() } : favorite)) ?? null);
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að endurnefna.'));
      }
    },
    []
  );

  const star = useCallback(async (favorite: Favorite) => {
    const starred = !favorite.starred;
    setLibrary((current) => current?.map((entry) => (entry.id === favorite.id ? { ...entry, starred } : entry)) ?? null);
    try {
      await starFavorite(favorite.id, starred);
    } catch (error) {
      setLibrary((current) => current?.map((entry) => (entry.id === favorite.id ? { ...entry, starred: !starred } : entry)) ?? null);
      toast.error(failureNote(error, 'Náði ekki að breyta stjörnunni.'));
    }
  }, []);

  const remove = useCallback(async (favorite: Favorite) => {
    setDeleting(null);
    try {
      await removeFavorite(favorite.id);
      setLibrary((current) => current?.filter((entry) => entry.id !== favorite.id) ?? null);
      setTicked((current) => {
        const next = new Set(current);
        next.delete(`lib:${favorite.id}`);
        return next;
      });
      toast.success(`${favorite.name} tekinn úr Partasafni.`);
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að eyða partinum.'));
    }
  }, []);

  if (!open) return null;

  const loading = tab === 'builds' ? buildParts === null : library === null;
  const counts: Record<LibraryTab, number> = {
    starred: (library ?? []).filter((favorite) => favorite.starred).length,
    library: (library ?? []).length,
    builds: (buildParts ?? []).length,
  };

  return (
    <div className="wb-theme fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`${PANEL} flex max-h-dvh w-full max-w-5xl flex-col p-3 shadow-2xl sm:max-h-[92dvh] sm:p-4`}>
        <div className="mb-2 flex items-start gap-2">
          <Library className="mt-0.5 h-5 w-5 shrink-0 text-[var(--wb-label)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[var(--wb-ink)]">Partasafn</h2>
            <p className="text-[0.7rem] text-[var(--wb-ink-mute)]">
              Partar sem þú hefur vistað, hver undir sínu nafni, og allir partar úr öllum verkefnum. Hakaðu
              við nokkra og opnaðu þá saman í nýju Board.
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
            onClick={onClose}
            aria-label="Loka Partasafni"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded border border-[var(--wb-tool-border)]" role="tablist">
            {TABS.map((entry) => (
              <button
                key={entry.tab}
                type="button"
                role="tab"
                aria-selected={tab === entry.tab}
                className={`min-h-9 px-3 text-[0.7rem] font-bold ${
                  tab === entry.tab
                    ? 'bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
                    : 'bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]'
                }`}
                onClick={() => setTab(entry.tab)}
              >
                {entry.tab === 'starred' && <Star className="mr-1 inline h-3 w-3" />}
                {entry.label} <span className="font-mono opacity-70">{counts[entry.tab]}</span>
              </button>
            ))}
          </div>
          <label className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--wb-ink-mute)]" />
            <input
              className={`${FIELD} pl-7`}
              placeholder="Leita að parti eða verkefni…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Leita"
            />
          </label>
        </div>
        {tab === 'builds' && cloudFailed && (
          <p className="mb-1 text-[0.65rem] text-amber-700">Supabase svaraði ekki — aðeins partar á þessari tölvu.</p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--wb-ink-mute)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sæki parta…
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-sm text-[var(--wb-ink-mute)]">
              {search
                ? 'Ekkert passar við leitina.'
                : tab === 'starred'
                  ? 'Engir partar í uppáhaldi enn. Smelltu á stjörnuna á parti í Safninu.'
                  : tab === 'library'
                    ? 'Safnið er tómt. Vistaðu parta í það úr „Allir partar“, eða af bekknum með „Vista í Partasafn…“.'
                    : 'Engin verkefni með pörtum fundust.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {entries.map((entry) => {
                const isTicked = ticked.has(entry.key);
                return (
                  <li
                    key={entry.key}
                    className={`relative flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${
                      isTicked ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      className="block text-left"
                      onClick={() => toggle(entry.key)}
                      aria-pressed={isTicked}
                      aria-label={`${isTicked ? 'Taka hak af' : 'Haka við'} ${nameOf(entry)}`}
                    >
                      <Picture entry={entry} />
                    </button>
                    <span
                      className={`pointer-events-none absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border ${
                        isTicked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white/90'
                      }`}
                    >
                      {isTicked && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {entry.kind === 'library' && (
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 hover:bg-white"
                        onClick={() => void star(entry.favorite)}
                        aria-pressed={entry.favorite.starred}
                        aria-label={entry.favorite.starred ? `Taka ${entry.favorite.name} úr uppáhaldi` : `Setja ${entry.favorite.name} í uppáhald`}
                      >
                        <Star
                          className={`h-4 w-4 ${entry.favorite.starred ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`}
                        />
                      </button>
                    )}

                    <div className="min-w-0 flex-1 px-2 pt-1.5">
                      {entry.kind === 'library' && renaming?.id === entry.favorite.id ? (
                        <form
                          className="flex gap-1"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void rename(renaming.id, renaming.name);
                          }}
                        >
                          <input
                            className={`${FIELD} py-1 text-[0.75rem]`}
                            value={renaming.name}
                            onChange={(event) => setRenaming({ id: renaming.id, name: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return;
                              event.preventDefault();
                              setRenaming(null);
                            }}
                            autoFocus
                            aria-label="Nýtt nafn"
                          />
                          <button type="submit" className="rounded bg-emerald-600 px-2 text-white" aria-label="Vista nafn">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="truncate text-[0.78rem] font-bold text-slate-900" title={nameOf(entry)}>
                          {nameOf(entry)}
                        </div>
                      )}
                      <div className="truncate font-mono text-[0.6rem] text-slate-500">
                        {entry.kind === 'library'
                          ? `${formatCount(entry.favorite.triangles)} tri · ${new Date(entry.favorite.addedAt).toLocaleDateString()}`
                          : `${entry.part.projectName} · ${formatCount(entry.part.triangles)} tri`}
                      </div>
                      {entry.kind === 'build' && entry.part.alsoIn.length > 0 && (
                        <div className="truncate text-[0.6rem] text-slate-400" title={entry.part.alsoIn.join('\n')}>
                          líka í {entry.part.alsoIn.length} öðrum
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 p-1.5">
                      {entry.kind === 'library' ? (
                        deleting === entry.favorite.id ? (
                          <>
                            <button
                              type="button"
                              className="flex min-h-8 flex-1 items-center justify-center rounded bg-rose-600 px-2 text-[0.68rem] font-bold text-white hover:bg-rose-500"
                              onClick={() => void remove(entry.favorite)}
                            >
                              Eyða?
                            </button>
                            <button
                              type="button"
                              className="flex min-h-8 items-center justify-center rounded border border-slate-300 px-2 text-[0.68rem] text-slate-600"
                              onClick={() => setDeleting(null)}
                            >
                              Nei
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-slate-300 px-2 text-[0.68rem] font-bold text-slate-600 hover:bg-slate-50"
                              onClick={() => setRenaming({ id: entry.favorite.id, name: entry.favorite.name })}
                            >
                              <Pencil className="h-3 w-3" />
                              Nafn
                            </button>
                            <button
                              type="button"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-500 hover:text-rose-600"
                              onClick={() => setDeleting(entry.favorite.id)}
                              aria-label={`Eyða ${entry.favorite.name} úr Partasafni`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )
                      ) : saving?.key === entry.key ? (
                        <form
                          className="flex w-full gap-1"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (saving.name.trim()) void saveToLibrary(entry.part, saving.name.trim());
                          }}
                        >
                          <input
                            className={`${FIELD} py-1 text-[0.75rem]`}
                            value={saving.name}
                            onChange={(event) => setSaving({ key: saving.key, name: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return;
                              event.preventDefault();
                              setSaving(null);
                            }}
                            autoFocus
                            aria-label="Nafn í Partasafni"
                          />
                          <button
                            type="submit"
                            className="rounded bg-emerald-600 px-2 text-[0.68rem] font-bold text-white disabled:opacity-40"
                            disabled={Boolean(busy) || !saving.name.trim()}
                          >
                            Vista
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-emerald-500 px-2 text-[0.68rem] font-bold text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setSaving({ key: entry.key, name: entry.part.name })}
                        >
                          <Plus className="h-3 w-3" />
                          Vista í safn…
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--wb-panel-border)] pt-3">
          <span className="text-[0.75rem] font-bold text-[var(--wb-ink)]">
            {ticked.size} {ticked.size === 1 ? 'valinn' : 'valdir'}
          </span>
          {ticked.size > 0 && (
            <button type="button" className="text-[0.7rem] text-[var(--wb-ink-mute)] underline" onClick={() => setTicked(new Set())}>
              hreinsa
            </button>
          )}
          {busy && (
            <span className="flex items-center gap-1 text-[0.7rem] text-[var(--wb-ink-mute)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              className={`${FIELD} w-48`}
              placeholder="Nafn á nýju Board"
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              aria-label="Nafn á nýju Board"
            />
            {onAddToBench && (
              <button
                type="button"
                className={ACTION_GHOST}
                disabled={ticked.size === 0 || Boolean(busy)}
                onClick={() => void addToBench()}
              >
                Bæta á bekkinn
              </button>
            )}
            <button
              type="button"
              className={ACTION_PRIMARY}
              disabled={ticked.size === 0 || Boolean(busy)}
              onClick={() => void openBoard()}
            >
              Opna í nýju Board
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
