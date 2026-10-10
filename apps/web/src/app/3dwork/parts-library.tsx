'use client';

/**
 * The Partasafn: the parts library, as a window of pictures.
 *
 *  - Uppáhalds — the starred parts of the library.
 *  - Söfn — the user's collections, each holding parts saved into it under
 *    names of their own, to rename, star, move or delete. A new collection is
 *    made here or when saving a part.
 *  - Allir partar — every part of every build, here or on Supabase, to save
 *    into a collection under a name.
 *
 * Every part has a category (Body, Innvols, … Óflokkað); the category chips
 * filter every tab, together with the search, and show how many parts each
 * holds. „Flokka sjálfvirkt" suggests a category for every part the user has
 * not sorted by hand, shows what it changed, and can take it back.
 *
 * Tick any number, from any tab, and open them together as a new board — or,
 * on the bench, put them into the build that is open.
 *
 * A part that has no picture yet — a build made on another computer — is
 * drawn when its card comes into view, one at a time, and the picture is kept
 * on this computer so it is drawn only once.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FolderInput,
  FolderPlus,
  Layers,
  Library,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  autoCategorize,
  categoryLabel,
  classifyPart,
  countByCategory,
  filterCategory,
  undoChanges,
  type AutoChange,
  type CategoryMark,
  type CategoryValue,
  type ClassifyInput,
} from '@/lib/3dwork/categories';
import {
  addFavorite,
  buildCategoryLookup,
  createCollection,
  DEFAULT_COLLECTION_ID,
  deleteCollection,
  loadFavoriteGeometry,
  loadLibrary,
  moveFavorite,
  removeFavorite,
  renameCollection,
  renameFavorite,
  setCategories,
  snapshotWithCategories,
  starFavorite,
  type CategoryUpdate,
  type Favorite,
  type LibraryCollection,
  type LibrarySnapshot,
} from '@/lib/3dwork/favorites';
import { lookFor } from '@/lib/3dwork/finish';
import { formatCount } from '@/lib/3dwork/format';
import { buildBoard, failureNote, partsOfBuilds, type BoardItem, type BuildPart } from '@/lib/3dwork/parts-library';
import type { Project } from '@/lib/3dwork/project';
import { listProjects, loadGeometry, loadThumbnail, saveThumbnail } from '@/lib/3dwork/storage';
import { listCloudBuildParts, loadCloudGeometry } from '@/lib/3dwork/supabase-sync';
import {
  CategorySelect,
  lastSaveCollection,
  rememberSaveCollection,
  SaveTargetFields,
  saveTargetReady,
  type SaveTarget,
} from './library-target';
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
const identityOf = (name: string, triangles: number) => `${name}\u0000${triangles}`;
/** Eintala eða fleirtala: 1, 21, 31 … taka eintölu, en ekki 11. */
const one = (count: number) => count % 10 === 1 && count % 100 !== 11;
const say = (count: number, singular: string, plural: string) => `${count} ${one(count) ? singular : plural}`;

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

/** The category change to store for a card. */
function updateFor(entry: Entry, mark: CategoryMark | undefined): CategoryUpdate {
  return entry.kind === 'library'
    ? { kind: 'library', id: entry.favorite.id, mark }
    : { kind: 'build', key: entry.part.key, name: entry.part.name, triangles: entry.part.triangles, mark };
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

/** The collection last looked at, so the window opens on it again. */
let lastCollectionFilter = 'all';

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

/** A filter chip: a collection or a category, with how many parts it holds. */
function Chip({
  active,
  label,
  count,
  onClick,
  dim,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[0.72rem] font-bold transition-colors ${
        active
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
          : 'border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]'
      } ${dim && !active ? 'opacity-50' : ''}`}
    >
      {label}
      <span className="font-mono text-[0.65rem] opacity-70">{count}</span>
    </button>
  );
}

const CHIP_ROW = 'flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]';

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
  { tab: 'library', label: 'Söfn' },
  { tab: 'builds', label: 'Allir partar' },
];

type CollectionEdit =
  | { mode: 'new'; name: string }
  | { mode: 'rename'; id: string; name: string }
  | { mode: 'delete'; id: string };

/** The last run of „Flokka sjálfvirkt", to show and to take back. */
interface AutoRun {
  changes: AutoChange[];
  /** Names of the parts still Óflokkað after the run. */
  remaining: string[];
  showList: boolean;
  settled?: 'undone' | 'confirmed';
}

interface SaveSheet {
  part: BuildPart;
  name: string;
  starred: boolean;
  target: SaveTarget;
}

export function PartsLibrary({ open, onClose, onOpenBoard, onAddToBench, initialTab = 'library' }: PartsLibraryProps) {
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null);
  const [buildParts, setBuildParts] = useState<BuildPart[] | null>(null);
  const [buildsReady, setBuildsReady] = useState(false);
  const [cloudFailed, setCloudFailed] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryValue | 'all'>('all');
  const [collectionFilter, setCollectionFilter] = useState<string>(lastCollectionFilter);
  const [boardName, setBoardName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Inline edits: a library part being renamed, a delete to confirm, a collection being made, renamed or deleted.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [collectionEdit, setCollectionEdit] = useState<CollectionEdit | null>(null);
  const [saveSheet, setSaveSheet] = useState<SaveSheet | null>(null);
  const [autoRun, setAutoRun] = useState<AutoRun | null>(null);

  const reloadLibrary = useCallback(async () => {
    try {
      setLibrary(await loadLibrary());
    } catch (error) {
      setLibrary({ favorites: [], collections: [], buildCategories: {} });
      toast.error(failureNote(error, 'Náði ekki í Partasafnið.'));
    }
  }, []);

  // Escape closes the window — unless it was meant for a name being typed, or a sheet on top.
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
    setCategoryFilter('all');
    setRenaming(null);
    setDeleting(null);
    setCollectionEdit(null);
    setSaveSheet(null);
    setAutoRun(null);
    setBuildsReady(false);
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
      } finally {
        if (!cancelled) setBuildsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialTab, reloadLibrary]);

  const collections = useMemo<LibraryCollection[]>(() => library?.collections ?? [], [library]);
  const favorites = useMemo<Favorite[]>(() => library?.favorites ?? [], [library]);

  // The collection shown: the one picked, if it is still there; with a single collection, that one.
  const activeCollection =
    collectionFilter !== 'all' && collections.some((entry) => entry.id === collectionFilter)
      ? collectionFilter
      : collections.length === 1
        ? collections[0].id
        : 'all';
  const collectionName = useCallback(
    (id: string) => collections.find((entry) => entry.id === id)?.name ?? '',
    [collections]
  );
  const pickCollection = (id: string) => {
    lastCollectionFilter = id;
    setCollectionFilter(id);
    setCollectionEdit(null);
  };

  const lookup = useMemo(() => buildCategoryLookup(library?.buildCategories ?? {}), [library]);
  const markOf = useCallback(
    (entry: Entry): CategoryMark | undefined => (entry.kind === 'library' ? entry.favorite.category : lookup(entry.part)),
    [lookup]
  );

  const libraryEntries = useMemo<Entry[]>(
    () => favorites.map((favorite) => ({ kind: 'library', key: `lib:${favorite.id}`, favorite })),
    [favorites]
  );
  const buildEntries = useMemo<Entry[]>(
    () => (buildParts ?? []).map((part) => ({ kind: 'build', key: `build:${part.key}`, part })),
    [buildParts]
  );
  const entryByKey = useMemo(
    () => new Map<string, Entry>([...libraryEntries, ...buildEntries].map((entry) => [entry.key, entry])),
    [libraryEntries, buildEntries]
  );

  // A saved part is sorted with what its build knows about it, when the build part is found by name and size.
  const buildByIdentity = useMemo(() => {
    const map = new Map<string, BuildPart>();
    for (const part of buildParts ?? []) {
      const identity = identityOf(part.name, part.triangles);
      if (!map.has(identity)) map.set(identity, part);
    }
    return map;
  }, [buildParts]);
  const inputOf = useCallback(
    (entry: Entry): ClassifyInput => {
      const part =
        entry.kind === 'build'
          ? entry.part
          : buildByIdentity.get(identityOf(entry.favorite.name, entry.favorite.triangles));
      return {
        name: nameOf(entry),
        notes: part?.notes,
        fileName: part?.fileName,
        slotId: part?.slotId,
        projectName: part?.projectName,
      };
    },
    [buildByIdentity]
  );

  const tabEntries = useMemo<Entry[]>(() => {
    if (tab === 'builds') return buildEntries;
    if (tab === 'starred') return libraryEntries.filter((entry) => entry.kind === 'library' && entry.favorite.starred);
    if (activeCollection === 'all') return libraryEntries;
    return libraryEntries.filter((entry) => entry.kind === 'library' && entry.favorite.collectionId === activeCollection);
  }, [tab, buildEntries, libraryEntries, activeCollection]);

  const searched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tabEntries;
    return tabEntries.filter((entry) =>
      [nameOf(entry), entry.kind === 'build' ? entry.part.projectName : collectionName(entry.favorite.collectionId)]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [tabEntries, search, collectionName]);

  const categoryCounts = useMemo(
    () => countByCategory(searched, (entry) => filterCategory(markOf(entry))),
    [searched, markOf]
  );
  const entries = useMemo(
    () =>
      categoryFilter === 'all'
        ? searched
        : searched.filter((entry) => filterCategory(markOf(entry)) === categoryFilter),
    [searched, categoryFilter, markOf]
  );

  // Every ticked card, from every tab, in the order they were ticked.
  const tickedEntries = useMemo(
    () => [...ticked].map((key) => entryByKey.get(key)).filter((entry): entry is Entry => Boolean(entry)),
    [ticked, entryByKey]
  );

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

  // ── Categories ──────────────────────────────────────────────────────────

  /** Store category changes; they show at once, and the window reloads if the write fails. */
  const writeCategories = useCallback(
    async (updates: CategoryUpdate[], failure: string): Promise<boolean> => {
      if (updates.length === 0) return true;
      setLibrary((current) => (current ? snapshotWithCategories(current, updates) : current));
      try {
        await setCategories(updates);
        return true;
      } catch (error) {
        void reloadLibrary();
        toast.error(failureNote(error, failure));
        return false;
      }
    },
    [reloadLibrary]
  );

  const setCategory = useCallback(
    (entry: Entry, mark: CategoryMark) => writeCategories([updateFor(entry, mark)], 'Náði ekki að vista flokkinn.'),
    [writeCategories]
  );

  const runAuto = useCallback(async () => {
    const all = [...libraryEntries, ...buildEntries];
    const changes = autoCategorize(all.map((entry) => ({ key: entry.key, mark: markOf(entry), input: inputOf(entry) })));
    const after = new Map(changes.map((change) => [change.key, change.to]));
    const remaining = all
      .filter((entry) => filterCategory(after.get(entry.key) ?? markOf(entry)) === 'none')
      .map((entry) => nameOf(entry));
    if (changes.length === 0) {
      setAutoRun({ changes, remaining, showList: remaining.length > 0 });
      return;
    }
    setBusy('Flokka sjálfvirkt…');
    const updates = changes.flatMap((change) => {
      const entry = entryByKey.get(change.key);
      return entry ? [updateFor(entry, change.to)] : [];
    });
    const stored = await writeCategories(updates, 'Náði ekki að vista sjálfvirku flokkunina.');
    setBusy(null);
    if (stored) setAutoRun({ changes, remaining, showList: false });
  }, [libraryEntries, buildEntries, markOf, inputOf, entryByKey, writeCategories]);

  const undoAuto = useCallback(async () => {
    if (!autoRun) return;
    const current = (key: string) => {
      const entry = entryByKey.get(key);
      return entry ? markOf(entry) : undefined;
    };
    const updates = undoChanges(autoRun.changes, current).flatMap((undo) => {
      const entry = entryByKey.get(undo.key);
      return entry ? [updateFor(entry, undo.mark)] : [];
    });
    setBusy('Afturkalla…');
    const stored = await writeCategories(updates, 'Náði ekki að afturkalla flokkunina.');
    setBusy(null);
    if (stored) {
      setAutoRun({ ...autoRun, settled: 'undone' });
      toast.success(`Afturkallað — ${say(updates.length, 'partur', 'partar')} aftur eins og áður.`);
    }
  }, [autoRun, entryByKey, markOf, writeCategories]);

  const confirmAuto = useCallback(async () => {
    if (!autoRun) return;
    const updates = autoRun.changes.flatMap((change) => {
      const entry = entryByKey.get(change.key);
      const now = entry ? markOf(entry) : undefined;
      if (!entry || !now?.auto || now.category !== change.to.category) return [];
      return [updateFor(entry, { category: now.category })];
    });
    setBusy('Staðfesti…');
    const stored = await writeCategories(updates, 'Náði ekki að staðfesta flokkana.');
    setBusy(null);
    if (stored) setAutoRun({ ...autoRun, settled: 'confirmed' });
  }, [autoRun, entryByKey, markOf, writeCategories]);

  // ── Collections ─────────────────────────────────────────────────────────

  const makeCollection = useCallback(
    async (name: string) => {
      setBusy(`Bý til safnið ${name}…`);
      try {
        const made = await createCollection(name);
        await reloadLibrary();
        lastCollectionFilter = made.id;
        setCollectionFilter(made.id);
        setCollectionEdit(null);
        toast.success(`Safnið „${made.name}“ er tilbúið.`);
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að búa til safnið.'));
      } finally {
        setBusy(null);
      }
    },
    [reloadLibrary]
  );

  const changeCollectionName = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLibrary((current) =>
      current
        ? { ...current, collections: current.collections.map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry)) }
        : current
    );
    setCollectionEdit(null);
    try {
      await renameCollection(id, trimmed);
    } catch (error) {
      void reloadLibrary();
      toast.error(failureNote(error, 'Náði ekki að endurnefna safnið.'));
    }
  }, [reloadLibrary]);

  const dropCollection = useCallback(
    async (collection: LibraryCollection, moveTo: string | null, count: number) => {
      setBusy(`Eyði safninu ${collection.name}…`);
      try {
        await deleteCollection(collection.id, moveTo);
        await reloadLibrary();
        setCollectionEdit(null);
        lastCollectionFilter = moveTo ?? 'all';
        setCollectionFilter(moveTo ?? 'all');
        if (moveTo === null) {
          setTicked((current) => {
            const next = new Set(current);
            for (const favorite of favorites) {
              if (favorite.collectionId === collection.id) next.delete(`lib:${favorite.id}`);
            }
            return next;
          });
        }
        toast.success(
          count === 0
            ? `Safninu „${collection.name}“ eytt.`
            : moveTo
              ? `Safninu „${collection.name}“ eytt — ${say(count, 'partur fór', 'partar fóru')} í „${collectionName(moveTo)}“.`
              : `Safninu „${collection.name}“ og ${say(count, 'parti', 'pörtum')} í því eytt. Þeir eru áfram í verkefnunum sínum.`
        );
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að eyða safninu.'));
      } finally {
        setBusy(null);
      }
    },
    [favorites, reloadLibrary, collectionName]
  );

  const move = useCallback(async (favorite: Favorite, collectionId: string) => {
    if (collectionId === favorite.collectionId) return;
    setLibrary((current) =>
      current
        ? {
            ...current,
            favorites: current.favorites.map((entry) => (entry.id === favorite.id ? { ...entry, collectionId } : entry)),
          }
        : current
    );
    try {
      await moveFavorite(favorite.id, collectionId);
      toast.success(`${favorite.name} færður í „${collectionName(collectionId)}“.`);
    } catch (error) {
      void reloadLibrary();
      toast.error(failureNote(error, 'Náði ekki að færa partinn.'));
    }
  }, [reloadLibrary, collectionName]);

  // ── Saved parts ─────────────────────────────────────────────────────────

  const openSaveSheet = (part: BuildPart, entry: Entry) => {
    const known = markOf(entry);
    const guess = classifyPart(inputOf(entry)).category;
    const last = lastSaveCollection();
    const startIn =
      activeCollection !== 'all'
        ? activeCollection
        : last && collections.some((collection) => collection.id === last)
          ? last
          : DEFAULT_COLLECTION_ID;
    setSaveSheet({
      part,
      name: part.name,
      starred: false,
      target: { collectionId: startIn, category: known ?? (guess ? { category: guess, auto: true } : undefined) },
    });
  };

  const saveToLibrary = useCallback(
    async (sheet: SaveSheet) => {
      const name = sheet.name.trim();
      if (!name || !saveTargetReady(sheet.target)) return;
      const { part, target } = sheet;
      setBusy(`Vista ${name} í Partasafn…`);
      try {
        const entry: Entry = { kind: 'build', key: `build:${part.key}`, part };
        const soup = await meshOf(entry);
        if (!soup) throw new Error(`Fann ekki möskvann í ${part.name}.`);
        const look = lookOf(entry);
        const picture = part.thumbnail ?? drawn.get(part.versionId) ?? renderThumbnail(soup, look.color, look);
        const making = target.newCollectionName !== undefined;
        const saved = await addFavorite(
          {
            name,
            color: part.color,
            materialId: part.materialId,
            finishId: part.finishId,
            thumbnail: picture ? await compactPicture(picture) : undefined,
            starred: sheet.starred,
            collectionId: making ? undefined : target.collectionId,
            newCollectionName: making ? target.newCollectionName?.trim() : undefined,
            category: target.category,
          },
          soup
        );
        rememberSaveCollection(saved.collectionId);
        setSaveSheet(null);
        await reloadLibrary();
        toast.success(
          `Vistað sem „${name}“ í ${making ? `nýja safninu „${target.newCollectionName?.trim()}“` : `„${collectionName(saved.collectionId) || 'safnið'}“`}.`
        );
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að vista partinn.'));
      } finally {
        setBusy(null);
      }
    },
    [reloadLibrary, collectionName]
  );

  const rename = useCallback(async (id: string, name: string) => {
    try {
      await renameFavorite(id, name);
      setRenaming(null);
      setLibrary((current) =>
        current
          ? {
              ...current,
              favorites: current.favorites.map((favorite) => (favorite.id === id ? { ...favorite, name: name.trim() } : favorite)),
            }
          : current
      );
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að endurnefna.'));
    }
  }, []);

  const setFavorites = useCallback(
    (change: (list: Favorite[]) => Favorite[]) =>
      setLibrary((current) => (current ? { ...current, favorites: change(current.favorites) } : current)),
    []
  );

  const star = useCallback(async (favorite: Favorite) => {
    const starred = !favorite.starred;
    setFavorites((list) => list.map((entry) => (entry.id === favorite.id ? { ...entry, starred } : entry)));
    try {
      await starFavorite(favorite.id, starred);
    } catch (error) {
      setFavorites((list) => list.map((entry) => (entry.id === favorite.id ? { ...entry, starred: !starred } : entry)));
      toast.error(failureNote(error, 'Náði ekki að breyta stjörnunni.'));
    }
  }, [setFavorites]);

  const remove = useCallback(async (favorite: Favorite) => {
    setDeleting(null);
    try {
      await removeFavorite(favorite.id);
      setFavorites((list) => list.filter((entry) => entry.id !== favorite.id));
      setTicked((current) => {
        const next = new Set(current);
        next.delete(`lib:${favorite.id}`);
        return next;
      });
      toast.success(`${favorite.name} tekinn úr Partasafni.`);
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að eyða partinum.'));
    }
  }, [setFavorites]);

  if (!open) return null;

  const loading = tab === 'builds' ? buildParts === null : library === null;
  const counts: Record<LibraryTab, number> = {
    starred: favorites.filter((favorite) => favorite.starred).length,
    library: favorites.length,
    builds: (buildParts ?? []).length,
  };
  const countIn = (id: string) => favorites.filter((favorite) => favorite.collectionId === id).length;
  const showCollectionOnCards = collections.length > 1 && (tab === 'starred' || activeCollection === 'all');
  const editedCollection =
    collectionEdit && collectionEdit.mode !== 'new' ? collections.find((entry) => entry.id === collectionEdit.id) : undefined;
  const moveTarget = (id: string) =>
    (id !== DEFAULT_COLLECTION_ID && collections.find((entry) => entry.id === DEFAULT_COLLECTION_ID)) ||
    collections.find((entry) => entry.id !== id);
  const autoSummary = autoRun
    ? countByCategory(autoRun.changes, (change) => change.to.category).filter((entry) => entry.count > 0)
    : [];

  return (
    <div className="wb-theme fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`${PANEL} flex max-h-dvh w-full min-w-0 max-w-5xl flex-col p-3 shadow-2xl sm:max-h-[92dvh] sm:p-4`}>
        <div className="mb-2 flex shrink-0 items-start gap-2">
          <Library className="mt-0.5 h-5 w-5 shrink-0 text-[var(--wb-label)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[var(--wb-ink)]">Partasafn</h2>
            <p className="text-[0.7rem] text-[var(--wb-ink-mute)]">
              Partar sem þú hefur vistað í söfnin þín, hver undir sínu nafni, og allir partar úr öllum verkefnum.
              <span className="hidden sm:inline"> Hakaðu við nokkra og opnaðu þá saman í nýju Board.</span>
            </p>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
            onClick={onClose}
            aria-label="Loka Partasafni"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 flex shrink-0 overflow-hidden rounded border border-[var(--wb-tool-border)] sm:self-start" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.tab}
              type="button"
              role="tab"
              aria-selected={tab === entry.tab}
              className={`min-h-10 flex-1 whitespace-nowrap px-3 text-[0.72rem] font-bold sm:flex-none ${
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

        {/* Collections and search scroll away with the cards; the category row stays at the top. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'library' && library && (
          <div className="mb-2 space-y-1.5">
            <div className={CHIP_ROW} role="tablist" aria-label="Söfn">
              {collections.length > 1 && (
                <Chip active={activeCollection === 'all'} label="Öll söfn" count={favorites.length} onClick={() => pickCollection('all')} />
              )}
              {collections.map((collection) => (
                <Chip
                  key={collection.id}
                  active={activeCollection === collection.id}
                  label={collection.name}
                  count={countIn(collection.id)}
                  onClick={() => pickCollection(collection.id)}
                />
              ))}
              <button
                type="button"
                className="inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-[var(--wb-label)] px-3 text-[0.72rem] font-bold text-[var(--wb-label)] hover:bg-[var(--wb-tool-hover)]"
                onClick={() => setCollectionEdit({ mode: 'new', name: '' })}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Nýtt safn
              </button>
            </div>

            {collectionEdit?.mode === 'new' || collectionEdit?.mode === 'rename' ? (
              <form
                className="flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!collectionEdit.name.trim()) return;
                  if (collectionEdit.mode === 'new') void makeCollection(collectionEdit.name.trim());
                  else void changeCollectionName(collectionEdit.id, collectionEdit.name);
                }}
              >
                <input
                  className={`${FIELD} min-h-10 min-w-0 flex-1 font-sans`}
                  placeholder={collectionEdit.mode === 'new' ? 'Nafn á nýja safninu' : 'Nýtt nafn á safninu'}
                  value={collectionEdit.name}
                  onChange={(event) => setCollectionEdit({ ...collectionEdit, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    setCollectionEdit(null);
                  }}
                  autoFocus
                  aria-label={collectionEdit.mode === 'new' ? 'Nafn á nýja safninu' : 'Nýtt nafn á safninu'}
                />
                <button
                  type="submit"
                  className={`${ACTION_PRIMARY} min-h-10 shrink-0`}
                  disabled={!collectionEdit.name.trim() || Boolean(busy)}
                >
                  {collectionEdit.mode === 'new' ? 'Búa til' : 'Vista'}
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[var(--wb-tool-border)] text-[var(--wb-ink-mute)]"
                  onClick={() => setCollectionEdit(null)}
                  aria-label="Hætta við"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : collectionEdit?.mode === 'delete' && editedCollection ? (
              <div className="space-y-2 rounded border border-rose-300 bg-rose-50 p-2.5 text-[0.75rem] text-rose-900" role="alertdialog">
                <p>
                  Safnið „{editedCollection.name}“ hefur {say(countIn(editedCollection.id), 'part', 'parta')}. Hvað á að gera við þá? Partarnir hverfa ekki úr
                  verkefnunum sínum („Allir partar“).
                </p>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                  {moveTarget(editedCollection.id) && (
                    <button
                      type="button"
                      className="min-h-10 rounded border border-[var(--wb-accent)] bg-[var(--wb-accent)] px-3 text-[0.72rem] font-bold text-[var(--wb-accent-ink)] disabled:opacity-40"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void dropCollection(editedCollection, moveTarget(editedCollection.id)!.id, countIn(editedCollection.id))
                      }
                    >
                      Færa þá í „{moveTarget(editedCollection.id)!.name}“ og eyða safninu
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-10 rounded bg-rose-600 px-3 text-[0.72rem] font-bold text-white hover:bg-rose-500 disabled:opacity-40"
                    disabled={Boolean(busy)}
                    onClick={() => void dropCollection(editedCollection, null, countIn(editedCollection.id))}
                  >
                    Eyða safninu og pörtunum í því
                  </button>
                  <button
                    type="button"
                    className="min-h-10 rounded border border-slate-300 bg-white px-3 text-[0.72rem] text-slate-700"
                    onClick={() => setCollectionEdit(null)}
                  >
                    Hætta við
                  </button>
                </div>
              </div>
            ) : activeCollection !== 'all' ? (
              <div className="flex items-center gap-1.5 text-[0.72rem] text-[var(--wb-ink-mute)]">
                <span className="min-w-0 flex-1 truncate">
                  <b className="text-[var(--wb-ink)]">{collectionName(activeCollection)}</b> ·{' '}
                  {say(countIn(activeCollection), 'partur', 'partar')}
                </span>
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 font-bold text-[var(--wb-tool-ink)]"
                  onClick={() => setCollectionEdit({ mode: 'rename', id: activeCollection, name: collectionName(activeCollection) })}
                >
                  <Pencil className="h-3 w-3" />
                  Endurnefna
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 font-bold text-[var(--wb-tool-ink)] hover:text-rose-600 disabled:opacity-40"
                  disabled={collections.length <= 1 || Boolean(busy)}
                  title={collections.length <= 1 ? 'Síðasta safninu er ekki hægt að eyða.' : undefined}
                  onClick={() => {
                    const collection = collections.find((entry) => entry.id === activeCollection);
                    if (!collection) return;
                    if (countIn(collection.id) === 0) void dropCollection(collection, null, 0);
                    else setCollectionEdit({ mode: 'delete', id: collection.id });
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Eyða safni
                </button>
              </div>
            ) : null}
          </div>
        )}

        <div className="mb-2 flex items-center gap-1.5">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--wb-ink-mute)]" />
            <input
              className={`${FIELD} min-h-10 pl-7`}
              placeholder="Leita að parti eða verkefni…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Leita"
            />
          </label>
          <button
            type="button"
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded border border-[var(--wb-accent)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.7rem] font-bold text-[var(--wb-label)] hover:bg-[var(--wb-tool-hover)] disabled:opacity-40"
            onClick={() => void runAuto()}
            disabled={!library || !buildsReady || Boolean(busy)}
            title="Gefur öllum pörtum sem þú hefur ekki flokkað sjálfur tillögu að flokki. Handval þitt stendur."
          >
            {!buildsReady && library ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Flokka sjálfvirkt
          </button>
        </div>

        <div
          className={`${CHIP_ROW} sticky top-0 z-10 mb-2 border-b border-[var(--wb-panel-border)] bg-[var(--wb-panel)] pt-1`}
          role="tablist"
          aria-label="Flokkar"
        >
          <Chip active={categoryFilter === 'all'} label="Allir flokkar" count={searched.length} onClick={() => setCategoryFilter('all')} />
          {categoryCounts.map((entry) => (
            <Chip
              key={entry.id}
              active={categoryFilter === entry.id}
              label={entry.label}
              count={entry.count}
              dim={entry.count === 0}
              onClick={() => setCategoryFilter(categoryFilter === entry.id ? 'all' : entry.id)}
            />
          ))}
        </div>

        {tab === 'builds' && cloudFailed && (
          <p className="mb-1 text-[0.65rem] text-amber-700">Supabase svaraði ekki — aðeins partar á þessari tölvu.</p>
        )}

          {autoRun && (
            <section
              className="mb-2 rounded border border-[var(--wb-accent)] bg-[var(--wb-tool-hover)] p-2.5 text-[0.75rem] text-[var(--wb-ink)]"
              aria-label="Niðurstaða sjálfvirkrar flokkunar"
            >
              <div className="flex items-start gap-2">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--wb-label)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {autoRun.settled === 'undone'
                      ? 'Sjálfvirka flokkunin var afturkölluð.'
                      : autoRun.settled === 'confirmed'
                        ? `Staðfest — ${autoRun.changes.length} flokkar eru nú handvaldir.`
                        : autoRun.changes.length === 0
                          ? 'Ekkert nýtt að flokka — allir partar eru flokkaðir eða handvaldir.'
                          : `${say(autoRun.changes.length, 'partur fékk', 'partar fengu')} tillögu að flokki (${autoRun.changes.filter((change) => change.key.startsWith('lib:')).length} í söfnum, ${autoRun.changes.filter((change) => change.key.startsWith('build:')).length} úr verkefnum).`}
                    {autoRun.remaining.length > 0 && !autoRun.settled && ` ${say(autoRun.remaining.length, 'enn óflokkaður', 'enn óflokkaðir')}.`}
                  </p>
                  {!autoRun.settled && autoSummary.length > 0 && (
                    <p className="text-[0.7rem] text-[var(--wb-ink-mute)]">
                      {autoSummary.map((entry) => `${entry.label} ${entry.count}`).join(' · ')}
                    </p>
                  )}
                  {!autoRun.settled && autoRun.changes.length > 0 && (
                    <p className="text-[0.65rem] text-[var(--wb-ink-mute)]">
                      Tillögurnar eru merktar „sjálfvirkt“ á spjöldunum þar til þú staðfestir eða velur annan flokk.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-bg)]"
                  onClick={() => setAutoRun(null)}
                  aria-label="Loka niðurstöðu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {!autoRun.settled && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(autoRun.changes.length > 0 || autoRun.remaining.length > 0) && (
                    <button
                      type="button"
                      className="min-h-9 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.7rem] font-bold"
                      onClick={() => setAutoRun({ ...autoRun, showList: !autoRun.showList })}
                      aria-expanded={autoRun.showList}
                    >
                      {autoRun.showList ? 'Fela lista' : 'Sjá hvað breyttist'}
                    </button>
                  )}
                  {autoRun.changes.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.7rem] font-bold disabled:opacity-40"
                        onClick={() => void undoAuto()}
                        disabled={Boolean(busy)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Afturkalla
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded bg-[var(--wb-accent)] px-2.5 text-[0.7rem] font-bold text-[var(--wb-accent-ink)] disabled:opacity-40"
                        onClick={() => void confirmAuto()}
                        disabled={Boolean(busy)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Staðfesta allt
                      </button>
                    </>
                  )}
                </div>
              )}
              {autoRun.showList && !autoRun.settled && (
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded bg-[var(--wb-tool-bg)] p-2">
                  {autoRun.changes.length > 0 && (
                    <ul className="space-y-0.5">
                      {autoRun.changes.map((change) => (
                        <li key={change.key} className="flex gap-2 text-[0.7rem]">
                          <span className="min-w-0 flex-1 truncate" title={change.name}>
                            {change.name}
                          </span>
                          <span className="shrink-0 font-bold text-[var(--wb-label)]">
                            {change.from ? `${categoryLabel(change.from.category)} → ` : ''}
                            {categoryLabel(change.to.category)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {autoRun.remaining.length > 0 && (
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[var(--wb-ink-mute)]">
                        Enn óflokkaðir ({autoRun.remaining.length})
                      </p>
                      <p className="text-[0.7rem]">{autoRun.remaining.join(' · ')}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--wb-ink-mute)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sæki parta…
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-sm text-[var(--wb-ink-mute)]">
              {search
                ? 'Ekkert passar við leitina.'
                : categoryFilter !== 'all'
                  ? `Enginn partur í flokknum ${categoryLabel(categoryFilter)} hér.`
                  : tab === 'starred'
                    ? 'Engir partar í uppáhaldi enn. Smelltu á stjörnuna á parti í söfnunum.'
                    : tab === 'library'
                      ? activeCollection !== 'all'
                        ? `Safnið „${collectionName(activeCollection)}“ er tómt. Vistaðu parta í það úr „Allir partar“, eða af bekknum með „Vista í Partasafn…“.`
                        : 'Söfnin eru tóm. Vistaðu parta í þau úr „Allir partar“, eða af bekknum með „Vista í Partasafn…“.'
                      : 'Engin verkefni með pörtum fundust.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {entries.map((entry) => {
                const isTicked = ticked.has(entry.key);
                const mark = markOf(entry);
                const sorted = filterCategory(mark) !== 'none';
                return (
                  <li
                    key={entry.key}
                    className={`relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${
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
                        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 hover:bg-white"
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
                            className={`${FIELD} min-w-0 py-1 text-[0.75rem]`}
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
                          ? `${showCollectionOnCards ? `${collectionName(entry.favorite.collectionId)} · ` : ''}${formatCount(entry.favorite.triangles)} tri · ${new Date(entry.favorite.addedAt).toLocaleDateString()}`
                          : `${entry.part.projectName} · ${formatCount(entry.part.triangles)} tri`}
                      </div>
                      {entry.kind === 'build' && entry.part.alsoIn.length > 0 && (
                        <div className="truncate text-[0.6rem] text-slate-400" title={entry.part.alsoIn.join('\n')}>
                          líka í {entry.part.alsoIn.length} öðrum
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 px-1.5 pt-1.5">
                      <CategorySelect
                        className={`min-h-9 w-full min-w-0 flex-1 truncate rounded border bg-white py-1 pl-1.5 pr-7 text-[0.7rem] font-bold ${
                          mark?.auto
                            ? 'border-dashed border-amber-500 text-amber-800'
                            : sorted
                              ? 'border-slate-300 text-slate-800'
                              : 'border-slate-300 text-slate-400'
                        }`}
                        value={mark}
                        onChange={(next) => void setCategory(entry, next)}
                        ariaLabel={`Flokkur: ${nameOf(entry)}`}
                      />
                      {mark?.auto && (
                        <button
                          type="button"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          onClick={() => void setCategory(entry, { category: mark.category })}
                          aria-label={`Staðfesta flokkinn ${categoryLabel(mark.category)} á ${nameOf(entry)}`}
                          title="Staðfesta tillöguna"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 p-1.5">
                      {entry.kind === 'library' ? (
                        deleting === entry.favorite.id ? (
                          <>
                            <button
                              type="button"
                              className="flex min-h-9 flex-1 items-center justify-center rounded bg-rose-600 px-2 text-[0.68rem] font-bold text-white hover:bg-rose-500"
                              onClick={() => void remove(entry.favorite)}
                            >
                              Eyða?
                            </button>
                            <button
                              type="button"
                              className="flex min-h-9 items-center justify-center rounded border border-slate-300 px-2 text-[0.68rem] text-slate-600"
                              onClick={() => setDeleting(null)}
                            >
                              Nei
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded border border-slate-300 px-2 text-[0.68rem] font-bold text-slate-600 hover:bg-slate-50"
                              onClick={() => setRenaming({ id: entry.favorite.id, name: entry.favorite.name })}
                            >
                              <Pencil className="h-3 w-3" />
                              Nafn
                            </button>
                            {collections.length > 1 && (
                              <label
                                className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-slate-300 text-slate-500 hover:text-slate-800"
                                title="Færa í annað safn"
                              >
                                <FolderInput className="h-3.5 w-3.5" />
                                <select
                                  className="absolute inset-0 cursor-pointer opacity-0"
                                  value={entry.favorite.collectionId}
                                  onChange={(event) => void move(entry.favorite, event.target.value)}
                                  aria-label={`Færa ${entry.favorite.name} í safn`}
                                >
                                  {collections.map((collection) => (
                                    <option key={collection.id} value={collection.id}>
                                      {collection.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <button
                              type="button"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-500 hover:text-rose-600"
                              onClick={() => setDeleting(entry.favorite.id)}
                              aria-label={`Eyða ${entry.favorite.name} úr Partasafni`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )
                      ) : (
                        <button
                          type="button"
                          className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded border border-emerald-500 px-2 text-[0.68rem] font-bold text-emerald-700 hover:bg-emerald-50"
                          onClick={() => openSaveSheet(entry.part, entry)}
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

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--wb-panel-border)] pt-3">
          <span className="text-[0.75rem] font-bold text-[var(--wb-ink)]">
            {say(ticked.size, 'valinn', 'valdir')}
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
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <input
              className={`${FIELD} w-48 min-w-0`}
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

      {saveSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/55 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setSaveSheet(null);
          }}
        >
          <form
            className={`${PANEL} max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto p-4 shadow-2xl`}
            role="dialog"
            aria-label="Vista í safn"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void saveToLibrary(saveSheet);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              if (!busy) setSaveSheet(null);
            }}
          >
            <div>
              <h3 className="text-sm font-bold text-[var(--wb-ink)]">Vista í safn</h3>
              <p className="truncate text-[0.7rem] text-[var(--wb-ink-mute)]">
                {saveSheet.part.name} · úr {saveSheet.part.projectName}
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.05em] text-[var(--wb-label)]">Nafn</span>
              <input
                className={`${FIELD} min-h-10`}
                value={saveSheet.name}
                onChange={(event) => setSaveSheet({ ...saveSheet, name: event.target.value })}
                onFocus={(event) => event.currentTarget.select()}
                disabled={Boolean(busy)}
                aria-label="Nafn í Partasafni"
                autoFocus
              />
            </label>
            <SaveTargetFields
              value={saveSheet.target}
              onChange={(target) => setSaveSheet((current) => (current ? { ...current, target } : current))}
              collections={collections}
              disabled={Boolean(busy)}
            />
            <label className="flex min-h-10 items-center gap-2 text-[0.75rem] text-[var(--wb-ink)]">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={saveSheet.starred}
                onChange={(event) => setSaveSheet({ ...saveSheet, starred: event.target.checked })}
              />
              <Star className="h-3.5 w-3.5 text-amber-500" />
              Líka í Uppáhalds
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${ACTION_GHOST} min-h-10`} onClick={() => setSaveSheet(null)} disabled={Boolean(busy)}>
                Hætta við
              </button>
              <button
                type="submit"
                className={`${ACTION_PRIMARY} min-h-10`}
                disabled={Boolean(busy) || !saveSheet.name.trim() || !saveTargetReady(saveSheet.target)}
              >
                {busy ? 'Vista…' : 'Vista'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
