'use client';

/**
 * Hvert partur fer þegar hann er vistaður í Partasafn: safnið (eða nýtt safn)
 * og flokkurinn. Notað bæði í „Vista í safn…" í Partasafninu og í „Vista í
 * Partasafn" á bekknum.
 */

import { useEffect, useState } from 'react';
import { Check, FolderPlus } from 'lucide-react';
import {
  categoryLabel,
  PART_CATEGORIES,
  UNCATEGORIZED_LABEL,
  type CategoryMark,
  type CategoryValue,
} from '@/lib/3dwork/categories';
import { DEFAULT_COLLECTION_ID, loadLibrary, type LibraryCollection } from '@/lib/3dwork/favorites';
import { FIELD, LABEL } from './ui';

/** Hvert á að vista: í safn sem er til, eða í nýtt safn (`newCollectionName` ekki undefined). */
export interface SaveTarget {
  collectionId?: string;
  newCollectionName?: string;
  category?: CategoryMark;
}

const LAST_COLLECTION_KEY = 'kjarni3d_partasafn_last_collection';

/** Safnið sem síðast var vistað í á þessu tæki — byrjunarval næst. */
export function lastSaveCollection(): string | undefined {
  try {
    return localStorage.getItem(LAST_COLLECTION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberSaveCollection(id: string | undefined): void {
  if (!id) return;
  try {
    localStorage.setItem(LAST_COLLECTION_KEY, id);
  } catch {
    /* einkahamur — byrjar þá í sjálfgefna safninu */
  }
}

/** Fellival flokka; sjálfvirk tillaga er merkt í textanum. */
export function CategorySelect({
  value,
  onChange,
  className = '',
  ariaLabel = 'Flokkur',
}: {
  value?: CategoryMark;
  onChange: (mark: CategoryMark) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const current: CategoryValue = value?.category ?? 'none';
  const suffix = value?.auto ? ' · sjálfvirkt' : '';
  return (
    <select
      className={className}
      value={current}
      aria-label={ariaLabel}
      onChange={(event) => onChange({ category: event.target.value as CategoryValue })}
    >
      {PART_CATEGORIES.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.label}
          {current === entry.id ? suffix : ''}
        </option>
      ))}
      <option value="none">{UNCATEGORIZED_LABEL}</option>
    </select>
  );
}

interface SaveTargetFieldsProps {
  value: SaveTarget;
  onChange: (next: SaveTarget) => void;
  /** Söfnin, ef þau eru þegar sótt; annars sækir reiturinn þau sjálfur. */
  collections?: LibraryCollection[];
  disabled?: boolean;
}

export function SaveTargetFields({ value, onChange, collections: given, disabled }: SaveTargetFieldsProps) {
  const [loaded, setLoaded] = useState<LibraryCollection[] | null>(null);
  const collections = given ?? loaded;

  useEffect(() => {
    if (given) return;
    let cancelled = false;
    loadLibrary()
      .then((snapshot) => {
        if (!cancelled) setLoaded(snapshot.collections);
      })
      .catch(() => {
        if (!cancelled) setLoaded([{ id: DEFAULT_COLLECTION_ID, name: 'Safnið mitt', createdAt: 0 }]);
      });
    return () => {
      cancelled = true;
    };
  }, [given]);

  // Safn sem er ekki (lengur) til: byrja í sjálfgefna safninu.
  useEffect(() => {
    if (!collections || value.newCollectionName !== undefined) return;
    if (value.collectionId && collections.some((entry) => entry.id === value.collectionId)) return;
    const fallback = collections.find((entry) => entry.id === DEFAULT_COLLECTION_ID) ?? collections[0];
    if (fallback) onChange({ ...value, collectionId: fallback.id });
  }, [collections, value, onChange]);

  const making = value.newCollectionName !== undefined;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className={LABEL}>Safn</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Safn">
          {(collections ?? []).map((entry) => {
            const chosen = !making && value.collectionId === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={disabled}
                className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-[0.75rem] font-bold ${
                  chosen
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
                    : 'border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)]'
                }`}
                onClick={() => onChange({ ...value, collectionId: entry.id, newCollectionName: undefined })}
              >
                {chosen && <Check className="h-3.5 w-3.5" />}
                {entry.name}
              </button>
            );
          })}
          {collections === null && <span className="text-[0.7rem] text-[var(--wb-ink-mute)]">Sæki söfn…</span>}
          <button
            type="button"
            role="radio"
            aria-checked={making}
            disabled={disabled}
            className={`inline-flex min-h-10 items-center gap-1 rounded-full border border-dashed px-3 text-[0.75rem] font-bold ${
              making
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
                : 'border-[var(--wb-label)] text-[var(--wb-label)]'
            }`}
            onClick={() => onChange({ ...value, newCollectionName: value.newCollectionName ?? '' })}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Nýtt safn
          </button>
        </div>
        {making && (
          <input
            className={FIELD}
            placeholder="Nafn á nýja safninu"
            value={value.newCollectionName ?? ''}
            onChange={(event) => onChange({ ...value, newCollectionName: event.target.value })}
            disabled={disabled}
            autoFocus
            aria-label="Nafn á nýja safninu"
          />
        )}
      </div>
      <label className="block space-y-1">
        <span className={LABEL}>Flokkur</span>
        <CategorySelect
          className={`${FIELD} min-h-10 font-sans`}
          value={value.category}
          onChange={(category) => onChange({ ...value, category })}
        />
        {value.category?.auto && (
          <span className="block text-[0.65rem] text-[var(--wb-ink-mute)]">
            Sjálfvirk tillaga ({categoryLabel(value.category.category)}) — veldu annan flokk ef hún er röng.
          </span>
        )}
      </label>
    </div>
  );
}

/** Hvort hægt sé að vista: nýtt safn þarf nafn. */
export function saveTargetReady(target: SaveTarget): boolean {
  return target.newCollectionName === undefined || target.newCollectionName.trim().length > 0;
}
