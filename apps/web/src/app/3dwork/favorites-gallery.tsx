'use client';

/**
 * The favourites shelf as a gallery: every favourite with its picture, to be
 * dropped into the build on the bench, or taken off the shelf.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layers, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { listFavorites, removeFavorite, type Favorite } from '@/lib/3dwork/favorites';
import { formatCount } from '@/lib/3dwork/format';
import { ACTION_GHOST, ACTION_PRIMARY, PANEL } from './ui';

interface FavoritesGalleryProps {
  open: boolean;
  onClose: () => void;
  /** Put this favourite on the bench. */
  onAdd: (favorite: Favorite) => void | Promise<void>;
  /** Save the part selected on the bench to the shelf, when there is one. */
  onSaveSelected?: () => Promise<void>;
  selectedName?: string | null;
  busy?: boolean;
}

export function FavoritesGallery({
  open,
  onClose,
  onAdd,
  onSaveSelected,
  selectedName,
  busy,
}: FavoritesGalleryProps) {
  const [cards, setCards] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  // Bumped after a save or removal so the shelf is read again.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading('Fetching the shelf…');
    void listFavorites()
      .then((list) => {
        if (!cancelled) setCards(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not fetch favorites.');
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, generation]);

  const remove = useCallback(async (favorite: Favorite) => {
    setLoading(`Taking ${favorite.name} off the shelf…`);
    try {
      await removeFavorite(favorite.id);
      setCards((current) => current.filter((entry) => entry.id !== favorite.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove that favorite.');
    } finally {
      setLoading(null);
    }
  }, []);

  const saveSelected = useCallback(async () => {
    if (!onSaveSelected) return;
    await onSaveSelected();
    setGeneration((value) => value + 1);
  }, [onSaveSelected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${PANEL} flex max-h-[min(42rem,90dvh)] w-full max-w-2xl flex-col p-4`}>
        <div className="mb-2 flex items-start gap-2">
          <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Favorites</h2>
            <p className="text-[0.7rem] text-slate-500">
              Parts kept on Supabase outside any build — the same shelf on every computer. Add one
              to this build, or save the selected part here for the next one.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {loading}
            </div>
          ) : cards.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              Nothing on the shelf yet. Select a part on the bench and save it to favorites.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cards.map((favorite) => (
                <li
                  key={favorite.id}
                  className="flex flex-col overflow-hidden rounded border border-slate-300 bg-slate-50"
                >
                  <div className="flex h-28 items-center justify-center bg-slate-200">
                    {favorite.thumbnail ? (
                      // A data URL rendered in-browser; next/image would only add a hop.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={favorite.thumbnail} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <Layers className="h-8 w-8 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 px-2 pt-1.5">
                    <div className="truncate text-[0.75rem] font-bold text-slate-800" title={favorite.name}>
                      {favorite.name}
                    </div>
                    <div className="font-mono text-[0.6rem] text-slate-500">
                      {formatCount(favorite.triangles)} tri ·{' '}
                      {new Date(favorite.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 p-1.5">
                    <button
                      type="button"
                      className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded bg-emerald-600 px-2 text-[0.68rem] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                      onClick={() => void onAdd(favorite)}
                      disabled={busy}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to build
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:text-rose-600 disabled:opacity-40"
                      onClick={() => void remove(favorite)}
                      disabled={busy}
                      title="Take off the shelf"
                      aria-label={`Remove ${favorite.name} from favorites`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className={ACTION_GHOST} onClick={onClose} disabled={busy}>
            Close
          </button>
          {onSaveSelected ? (
            <button
              type="button"
              className={ACTION_PRIMARY}
              onClick={() => void saveSelected()}
              disabled={busy || !selectedName}
              title={selectedName ? `Save ${selectedName} to favorites` : 'Select a part on the bench first'}
            >
              <Star className="mr-1 inline h-3.5 w-3.5" />
              {selectedName ? `Save “${selectedName}”` : 'Save selected part'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
