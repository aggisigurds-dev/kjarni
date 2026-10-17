'use client';

/**
 * Söfn — one collection at a time, as a showcase: the parts assembled as an
 * AR-15 on a plate at the top, and below it the parts by layer, folded until
 * opened. A part opens on the bench by itself; „Vista og loka" there saves it
 * back to the library and comes straight back here — no new board is kept.
 * The user, 17.10.2026: "hoppa inn, kíkja á hlut án þess að það skapist
 * endalaust af borðum".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Eye, EyeOff, Layers, Loader2, Move, SquarePen } from 'lucide-react';
import { toast } from 'sonner';
import { categoryLabel, filterCategory } from '@/lib/3dwork/categories';
import {
  arrangeFavorites,
  loadFavoriteGeometry,
  loadLibrary,
  PART_STATUSES,
  type ArrangeChange,
  type Favorite,
  type LibrarySnapshot,
} from '@/lib/3dwork/favorites';
import { failureNote, slotCheck } from '@/lib/3dwork/parts-library';
import { STATUS_STYLE } from './board-view';
import { CollectionArranger } from './collection-arranger';
import { CollectionHero, type HeroPart } from './collection-hero';
import { ACTION_PRIMARY, PANEL } from './ui';

const LAST_KEY = 'kjarni3d_sofn_collection';
const UNSORTED = 'unsorted';

function lastCollection(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function rememberCollection(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* private mode — it opens on the biggest collection next time */
  }
}

const categoryOf = (favorite: Favorite) => {
  const value = filterCategory(favorite.category);
  return value === 'none' ? undefined : value;
};

export function CollectionsView({
  onBack,
  onEditPart,
}: {
  /** A way back, when Söfn is a page of its own; on the start page there is none. */
  onBack?: () => void;
  /** Open one saved part on the bench by itself; saving there brings it back to the library. */
  onEditPart: (favorite: Favorite, soup: Float32Array) => void | Promise<void>;
}) {
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(lastCollection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((snapshot) => {
        if (!cancelled) setLibrary(snapshot);
      })
      .catch((error) => {
        if (cancelled) return;
        setFailed(true);
        toast.error(failureNote(error, 'Náði ekki í Partasafnið.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const collections = useMemo(() => library?.collections ?? [], [library]);
  const countIn = useCallback(
    (id: string) => (library?.favorites ?? []).filter((favorite) => favorite.collectionId === id).length,
    [library]
  );
  // The collection picked before, if it is still there; otherwise the one with the most parts.
  const activeId = useMemo(() => {
    if (picked && collections.some((entry) => entry.id === picked)) return picked;
    return [...collections].sort((a, b) => countIn(b.id) - countIn(a.id))[0]?.id ?? null;
  }, [picked, collections, countIn]);
  const active = collections.find((entry) => entry.id === activeId);
  const parts = useMemo(
    () => (library?.favorites ?? []).filter((favorite) => favorite.collectionId === activeId),
    [library, activeId]
  );

  // The layers of the collection, each with its parts; parts in no layer last, under „Óflokkað".
  const groups = useMemo(() => {
    const layers = (active?.sections ?? []).filter((section) => section.kind === 'parts');
    const out = layers.map((section) => ({
      id: section.id,
      name: section.name,
      parts: parts.filter((favorite) => favorite.sectionId === section.id),
    }));
    const loose = parts.filter((favorite) => !favorite.sectionId || !layers.some((section) => section.id === favorite.sectionId));
    if (loose.length > 0 || out.length === 0) out.push({ id: UNSORTED, name: layers.length ? 'Óflokkað' : 'Partar', parts: loose });
    return out;
  }, [active, parts]);
  const boards = (active?.sections ?? []).filter((section) => section.kind === 'board');

  const heroParts = useMemo<HeroPart[]>(
    () =>
      parts.map((favorite) => ({
        id: favorite.id,
        name: favorite.name,
        versionId: favorite.versionId,
        color: favorite.color,
        finishId: favorite.finishId,
        category: categoryOf(favorite),
        place: favorite.place,
      })),
    [parts]
  );
  const hiddenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) if (hiddenGroups.has(group.id)) for (const favorite of group.parts) ids.add(favorite.id);
    return ids;
  }, [groups, hiddenGroups]);
  const missing = slotCheck(parts.map(categoryOf))
    .filter((slot) => slot.count === 0)
    .map((slot) => slot.label);
  const selected = parts.find((favorite) => favorite.id === selectedId) ?? null;

  const pickCollection = (id: string) => {
    rememberCollection(id);
    setPicked(id);
    setSelectedId(null);
    setOpenGroups(new Set());
    setHiddenGroups(new Set());
  };

  // A part picked in the picture opens its layer and shows in the list.
  const pickPart = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const group = groups.find((entry) => entry.parts.some((favorite) => favorite.id === id));
    if (group) setOpenGroups((current) => new Set(current).add(group.id));
  };

  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  /** The collection as arranged by hand: stored, then read back so the picture stands that way. */
  const saveArrangement = async (changes: ArrangeChange[]) => {
    await arrangeFavorites(changes);
    setLibrary(await loadLibrary());
    toast.success(`Röðunin á „${active?.name ?? 'safninu'}“ er vistuð.`);
  };

  const openPart = async (favorite: Favorite) => {
    setBusy(`Sæki ${favorite.name}…`);
    try {
      const soup = await loadFavoriteGeometry(favorite.versionId);
      if (!soup) {
        toast.error(`Fann ekki möskvann í ${favorite.name}.`);
        return;
      }
      await onEditPart(favorite, soup);
    } catch (error) {
      toast.error(failureNote(error, `Náði ekki að opna ${favorite.name}.`));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-2">
      <div className={`${PANEL} flex flex-col gap-2 px-2 py-2`}>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded px-1.5 text-[0.75rem] font-bold text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              3dwork
            </button>
          )}
          <span className={`text-sm font-bold text-[var(--wb-ink)] ${onBack ? '' : 'px-1'}`}>Söfn</span>
          {busy && (
            <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-[0.7rem] text-[var(--wb-ink-mute)]">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              {busy}
            </span>
          )}
        </div>
        <div className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Söfn">
          {collections.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === activeId}
              onClick={() => pickCollection(entry.id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[0.75rem] font-bold ${
                entry.id === activeId
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
                  : 'border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]'
              }`}
            >
              {entry.name}
              <span className="font-mono text-[0.65rem] opacity-70">{countIn(entry.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {arranging && active && (
        <CollectionArranger title={active.name} parts={heroParts} onSave={saveArrangement} onClose={() => setArranging(false)} />
      )}

      {!library ? (
        <div className={`${PANEL} flex items-center gap-2 p-6 text-sm text-[var(--wb-ink-mute)]`}>
          {failed ? (
            'Náði ekki í Partasafnið.'
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sæki söfnin…
            </>
          )}
        </div>
      ) : parts.length === 0 ? (
        <div className={`${PANEL} p-6 text-sm text-[var(--wb-ink-mute)]`}>
          {active ? `Safnið „${active.name}“ er tómt.` : 'Engin söfn enn.'} Vistaðu parta í það úr Partasafninu, eða af bekknum með „Vista í safn“.
        </div>
      ) : (
        <>
          <div className={`${PANEL} p-1.5`}>
            <div className="h-[44dvh] min-h-[260px] md:h-[58dvh]">
              <CollectionHero parts={heroParts} selectedId={selectedId} hiddenIds={hiddenIds} onPick={pickPart} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 pt-1.5 text-[0.7rem] text-[var(--wb-ink-mute)]">
              <span>
                <b className="text-[var(--wb-ink)]">{active?.name}</b> · {parts.length} partar
              </span>
              {missing.length > 0 && missing.length < 8 && <span className="text-amber-700">vantar: {missing.join(', ')}</span>}
              <button
                type="button"
                className="ml-auto inline-flex min-h-9 items-center gap-1 rounded border border-[var(--wb-accent)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.7rem] font-bold text-[var(--wb-label)] hover:bg-[var(--wb-tool-hover)]"
                onClick={() => setArranging(true)}
                title="Opna stórt og raða pörtunum í 2D — draga til hliðar, upp og niður — og mála þá"
              >
                <Move className="h-3.5 w-3.5" />
                Raða og mála
              </button>
            </div>
            {selected && (
              <div className="mt-1.5 flex items-center gap-2 rounded border border-emerald-400 bg-emerald-50 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[0.78rem] font-bold text-emerald-900">{selected.name}</span>
                <button
                  type="button"
                  className={`${ACTION_PRIMARY} inline-flex shrink-0 items-center gap-1`}
                  onClick={() => void openPart(selected)}
                  disabled={Boolean(busy)}
                >
                  <SquarePen className="h-3.5 w-3.5" />
                  Opna og breyta
                </button>
              </div>
            )}
          </div>

          <div className={`${PANEL} divide-y divide-[var(--wb-panel-border)]`}>
            {groups.map((group) => {
              const open = openGroups.has(group.id);
              const hidden = hiddenGroups.has(group.id);
              return (
                <section key={group.id}>
                  <div className="flex items-center gap-1 px-1.5">
                    <button
                      type="button"
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1 text-left"
                      onClick={() => setOpenGroups((current) => flip(current, group.id))}
                      aria-expanded={open}
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--wb-ink-mute)] transition-transform ${open ? '' : '-rotate-90'}`} />
                      <span className={`min-w-0 flex-1 truncate text-[0.8rem] font-bold ${hidden ? 'text-[var(--wb-ink-mute)]' : 'text-[var(--wb-ink)]'}`}>
                        {group.name}
                      </span>
                      <span className="font-mono text-[0.68rem] text-[var(--wb-ink-mute)]">{group.parts.length}</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
                      onClick={() => setHiddenGroups((current) => flip(current, group.id))}
                      aria-pressed={!hidden}
                      aria-label={hidden ? `Sýna ${group.name} á myndinni` : `Fela ${group.name} á myndinni`}
                      title={hidden ? 'Sýna á myndinni' : 'Fela á myndinni'}
                    >
                      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {open && (
                    <ul className="pb-1.5">
                      {group.parts.length === 0 && (
                        <li className="px-3 py-2 text-[0.72rem] text-[var(--wb-ink-mute)]">Enginn partur í þessu lagi.</li>
                      )}
                      {group.parts.map((favorite) => {
                        const isSelected = favorite.id === selectedId;
                        const category = categoryOf(favorite);
                        const status = PART_STATUSES.find((entry) => entry.id === favorite.status);
                        return (
                          <li
                            key={favorite.id}
                            className={`mx-1.5 flex items-center gap-2 rounded px-1.5 py-1 ${isSelected ? 'bg-emerald-50 ring-1 ring-emerald-400' : ''}`}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() => setSelectedId(isSelected ? null : favorite.id)}
                              aria-pressed={isSelected}
                              title="Sýna á myndinni"
                            >
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                                {favorite.thumbnail ? (
                                  // A data URL drawn in the browser; next/image would only add a hop.
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={favorite.thumbnail} alt="" className="h-full w-full object-contain" />
                                ) : (
                                  <Layers className="h-5 w-5 text-slate-300" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[0.78rem] font-bold text-[var(--wb-ink)]">{favorite.name}</span>
                                <span className="flex items-center gap-1.5 text-[0.65rem] text-[var(--wb-ink-mute)]">
                                  {category ? categoryLabel(category) : 'Óflokkað'}
                                  {status && (
                                    <span className={`rounded px-1 py-px text-[0.58rem] font-bold ${STATUS_STYLE[status.id]}`}>{status.label}</span>
                                  )}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded border border-emerald-500 px-2 text-[0.7rem] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                              onClick={() => void openPart(favorite)}
                              disabled={Boolean(busy)}
                              aria-label={`Opna ${favorite.name} og breyta`}
                            >
                              <SquarePen className="h-3.5 w-3.5" />
                              Opna
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
            {boards.length > 0 && (
              <p className="px-3 py-2 text-[0.68rem] text-[var(--wb-ink-mute)]">
                Skipulagsborð ({boards.map((board) => board.name).join(', ')}) eru í Partasafninu.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
