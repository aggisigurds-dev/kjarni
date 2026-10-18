'use client';

/**
 * The Partasafn's sorting controls, in two shapes: a side column with room to
 * sort (the start page, wide screens) and rows of chips (phone, the window).
 * A collection's sub-categories are layers: each parts layer has an eye to
 * show or hide its parts; a board layer opens its planning board.
 */

import { Check, Eye, EyeOff, FolderPlus, LayoutDashboard, Pencil, Plus, Star } from 'lucide-react';
import { PART_STATUSES, type LibraryCollection, type LibrarySection, type PartStatus } from '@/lib/3dwork/favorites';

/** The pseudo-layer of parts in a collection that are under no sub-category. */
export const UNSORTED_LAYER = (collectionId: string) => `none:${collectionId}`;

export type LibraryTabId = 'starred' | 'library' | 'builds';

interface Counted {
  id: string;
  label: string;
  count: number;
}

export interface LayersProps {
  tab: LibraryTabId;
  tabs: { tab: LibraryTabId; label: string; count: number }[];
  onTab: (tab: LibraryTabId) => void;
  collections: LibraryCollection[];
  activeCollection: string;
  countIn: (collectionId: string) => number;
  totalSaved: number;
  onPickCollection: (id: string) => void;
  onNewCollection: () => void;
  sections: LibrarySection[];
  /** Parts per layer id (section id, or UNSORTED_LAYER for the active collection). */
  layerCount: (id: string) => number;
  boardCount: (id: string) => number;
  hidden: Set<string>;
  onToggleLayer: (id: string) => void;
  openBoardId: string | null;
  onOpenBoard: (id: string | null) => void;
  onNewSection: (kind: LibrarySection['kind']) => void;
  onEditSection: (section: LibrarySection) => void;
  categories: Counted[];
  categoryFilter: string;
  allCategoriesCount: number;
  onCategory: (id: string) => void;
  statusCounts: Record<PartStatus, number>;
  statusFilter: PartStatus | 'all';
  onStatus: (status: PartStatus | 'all') => void;
  /** AR-15 checklist for the collection shown (empty when there is none). */
  slots?: { category: string; label: string; count: number }[];
  /** Show only the parts of one slot's category (again to show all). */
  onSlot?: (category: string) => void;
}

const ROW = 'flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-[0.75rem]';
const ROW_ON = 'bg-[var(--wb-accent)] font-bold text-[var(--wb-accent-ink)]';
const ROW_OFF = 'text-[var(--wb-ink)] hover:bg-[var(--wb-tool-hover)]';
const HEAD = 'px-2 pb-1 pt-2 text-[0.62rem] font-extrabold uppercase tracking-[0.06em] text-[var(--wb-label)]';

/** The side column: tabs, collections with their layers and boards, categories, status. */
export function LayerList(props: LayersProps) {
  const {
    tab,
    tabs,
    onTab,
    collections,
    activeCollection,
    countIn,
    totalSaved,
    onPickCollection,
    onNewCollection,
    sections,
    layerCount,
    boardCount,
    hidden,
    onToggleLayer,
    openBoardId,
    onOpenBoard,
    onNewSection,
    onEditSection,
    categories,
    categoryFilter,
    allCategoriesCount,
    onCategory,
    statusCounts,
    statusFilter,
    onStatus,
    slots = [],
    onSlot,
  } = props;
  const layers = sections.filter((section) => section.kind === 'parts');
  const boards = sections.filter((section) => section.kind === 'board');

  return (
    <nav className="space-y-1 text-[var(--wb-ink)]" aria-label="Partasafn">
      <div>
        {tabs.map((entry) => (
          <button key={entry.tab} type="button" className={`${ROW} ${tab === entry.tab ? ROW_ON : ROW_OFF}`} onClick={() => onTab(entry.tab)}>
            {entry.tab === 'starred' && <Star className="h-3.5 w-3.5" />}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="font-mono text-[0.65rem] opacity-70">{entry.count}</span>
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <div>
          <div className={HEAD}>Söfn</div>
          {collections.length > 1 && (
            <button
              type="button"
              className={`${ROW} ${activeCollection === 'all' ? ROW_ON : ROW_OFF}`}
              onClick={() => onPickCollection('all')}
            >
              <span className="min-w-0 flex-1 truncate">Öll söfn</span>
              <span className="font-mono text-[0.65rem] opacity-70">{totalSaved}</span>
            </button>
          )}
          {collections.map((collection) => (
            <div key={collection.id}>
              <button
                type="button"
                className={`${ROW} ${activeCollection === collection.id && !openBoardId ? ROW_ON : ROW_OFF}`}
                onClick={() => {
                  onPickCollection(collection.id);
                  onOpenBoard(null);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                <span className="font-mono text-[0.65rem] opacity-70">{countIn(collection.id)}</span>
              </button>
              {activeCollection === collection.id && (
                <div className="ml-3 border-l border-[var(--wb-panel-border)] pl-1.5">
                  {[{ id: UNSORTED_LAYER(collection.id), name: 'Óflokkað', section: null as LibrarySection | null }, ...layers.map((section) => ({ id: section.id, name: section.name, section }))]
                    .filter((layer) => layer.section || layerCount(layer.id) > 0 || layers.length === 0)
                    .map((layer) => {
                      const off = hidden.has(layer.id);
                      return (
                        <div key={layer.id} className="flex items-center">
                          <button
                            type="button"
                            className="flex h-9 w-8 shrink-0 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
                            onClick={() => onToggleLayer(layer.id)}
                            aria-pressed={!off}
                            aria-label={`${off ? 'Sýna' : 'Fela'} ${layer.name}`}
                            title={off ? 'Falið — smelltu til að sýna' : 'Sýnt — smelltu til að fela'}
                          >
                            {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-[var(--wb-label)]" />}
                          </button>
                          <button
                            type="button"
                            className={`${ROW} min-w-0 flex-1 px-1 ${off ? 'text-[var(--wb-ink-mute)] line-through' : ROW_OFF}`}
                            onClick={() => onOpenBoard(null)}
                          >
                            <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                            <span className="font-mono text-[0.65rem] opacity-70">{layerCount(layer.id)}</span>
                          </button>
                          {layer.section && (
                            <button
                              type="button"
                              className="flex h-9 w-7 shrink-0 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
                              onClick={() => onEditSection(layer.section!)}
                              aria-label={`Breyta ${layer.name}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  {boards.map((board) => (
                    <div key={board.id} className="flex items-center">
                      <span className="flex h-9 w-8 shrink-0 items-center justify-center text-[var(--wb-label)]">
                        <LayoutDashboard className="h-3.5 w-3.5" />
                      </span>
                      <button
                        type="button"
                        className={`${ROW} min-w-0 flex-1 px-1 ${openBoardId === board.id ? ROW_ON : ROW_OFF}`}
                        onClick={() => onOpenBoard(board.id)}
                      >
                        <span className="min-w-0 flex-1 truncate">{board.name}</span>
                        <span className="font-mono text-[0.65rem] opacity-70">{boardCount(board.id)}</span>
                      </button>
                      <button
                        type="button"
                        className="flex h-9 w-7 shrink-0 items-center justify-center rounded text-[var(--wb-ink-mute)] hover:bg-[var(--wb-tool-hover)]"
                        onClick={() => onEditSection(board)}
                        aria-label={`Breyta ${board.name}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1 py-1">
                    <button
                      type="button"
                      className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-dashed border-[var(--wb-label)] text-[0.68rem] font-bold text-[var(--wb-label)] hover:bg-[var(--wb-tool-hover)]"
                      onClick={() => onNewSection('parts')}
                    >
                      <Plus className="h-3 w-3" />
                      Lag
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded border border-dashed border-[var(--wb-label)] text-[0.68rem] font-bold text-[var(--wb-label)] hover:bg-[var(--wb-tool-hover)]"
                      onClick={() => onNewSection('board')}
                    >
                      <LayoutDashboard className="h-3 w-3" />
                      Borð
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" className={`${ROW} ${ROW_OFF} text-[var(--wb-label)]`} onClick={onNewCollection}>
            <FolderPlus className="h-3.5 w-3.5" />
            Nýtt safn
          </button>
        </div>
      )}

      {tab === 'library' && slots.length > 0 && (
        <div>
          <div className={HEAD}>Hólf (AR-15)</div>
          {slots.map((slot) => (
            <button
              key={slot.category}
              type="button"
              className={`${ROW} ${ROW_OFF} ${categoryFilter === slot.category ? 'ring-1 ring-[var(--wb-accent)]' : ''}`}
              onClick={() => onSlot?.(slot.category)}
              title={slot.count > 0 ? `${slot.count} í safninu — smelltu til að sýna aðeins þá` : 'Enginn partur í þessu hólfi enn'}
            >
              {slot.count > 0 ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-dashed border-amber-500 text-[0.6rem] font-bold text-amber-600">
                  +
                </span>
              )}
              <span className={`min-w-0 flex-1 truncate ${slot.count > 0 ? '' : 'text-amber-700'}`}>{slot.label}</span>
              <span className="font-mono text-[0.65rem] opacity-70">{slot.count > 0 ? slot.count : 'vantar'}</span>
            </button>
          ))}
        </div>
      )}

      {!openBoardId && (
        <>
          <div>
            <div className={HEAD}>Flokkar</div>
            <button type="button" className={`${ROW} ${categoryFilter === 'all' ? ROW_ON : ROW_OFF}`} onClick={() => onCategory('all')}>
              <span className="min-w-0 flex-1 truncate">Allir flokkar</span>
              <span className="font-mono text-[0.65rem] opacity-70">{allCategoriesCount}</span>
            </button>
            {categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`${ROW} ${categoryFilter === entry.id ? ROW_ON : ROW_OFF} ${entry.count === 0 ? 'opacity-50' : ''}`}
                onClick={() => onCategory(categoryFilter === entry.id ? 'all' : entry.id)}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="font-mono text-[0.65rem] opacity-70">{entry.count}</span>
              </button>
            ))}
          </div>

          <div>
            <div className={HEAD}>Staða</div>
            <button type="button" className={`${ROW} ${statusFilter === 'all' ? ROW_ON : ROW_OFF}`} onClick={() => onStatus('all')}>
              <span className="min-w-0 flex-1 truncate">Öll</span>
            </button>
            {PART_STATUSES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`${ROW} ${statusFilter === entry.id ? ROW_ON : ROW_OFF}`}
                onClick={() => onStatus(statusFilter === entry.id ? 'all' : entry.id)}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="font-mono text-[0.65rem] opacity-70">{statusCounts[entry.id]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

/** On a phone or in the window: the active collection's layers and boards as a row of chips. */
export function LayerChips({
  collectionId,
  sections,
  layerCount,
  boardCount,
  hidden,
  onToggleLayer,
  openBoardId,
  onOpenBoard,
  onNewSection,
  onEditSection,
  className = '',
}: Pick<
  LayersProps,
  'sections' | 'layerCount' | 'boardCount' | 'hidden' | 'onToggleLayer' | 'openBoardId' | 'onOpenBoard' | 'onNewSection' | 'onEditSection'
> & { collectionId: string; className?: string }) {
  const layers = sections.filter((section) => section.kind === 'parts');
  const boards = sections.filter((section) => section.kind === 'board');
  const chip = 'inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[0.7rem] font-bold';
  const all = [{ id: UNSORTED_LAYER(collectionId), name: 'Óflokkað', section: null as LibrarySection | null }, ...layers.map((section) => ({ id: section.id, name: section.name, section }))];
  return (
    <div className={`flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] ${className}`} aria-label="Lög og borð">
      {all
        .filter((layer) => layer.section || layerCount(layer.id) > 0 || layers.length === 0)
        .map((layer) => {
          const off = hidden.has(layer.id);
          return (
            <button
              key={layer.id}
              type="button"
              className={`${chip} ${off ? 'border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-ink-mute)] line-through' : 'border-[var(--wb-accent)] bg-[var(--wb-tool-hover)] text-[var(--wb-ink)]'}`}
              onClick={() => onToggleLayer(layer.id)}
              onContextMenu={(event) => {
                if (!layer.section) return;
                event.preventDefault();
                onEditSection(layer.section);
              }}
              aria-pressed={!off}
            >
              {off ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {layer.name}
              <span className="font-mono opacity-70">{layerCount(layer.id)}</span>
            </button>
          );
        })}
      {boards.map((board) => (
        <button
          key={board.id}
          type="button"
          className={`${chip} ${openBoardId === board.id ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]' : 'border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)]'}`}
          onClick={() => onOpenBoard(openBoardId === board.id ? null : board.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onEditSection(board);
          }}
        >
          <LayoutDashboard className="h-3 w-3" />
          {board.name}
          <span className="font-mono opacity-70">{boardCount(board.id)}</span>
        </button>
      ))}
      <button type="button" className={`${chip} border-dashed border-[var(--wb-label)] text-[var(--wb-label)]`} onClick={() => onNewSection('parts')}>
        <Plus className="h-3 w-3" />
        Lag
      </button>
      <button type="button" className={`${chip} border-dashed border-[var(--wb-label)] text-[var(--wb-label)]`} onClick={() => onNewSection('board')}>
        <LayoutDashboard className="h-3 w-3" />
        Borð
      </button>
    </div>
  );
}
