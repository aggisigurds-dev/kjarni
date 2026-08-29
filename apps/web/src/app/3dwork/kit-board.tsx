'use client';

/**
 * 2D kit board — pick parts as pictures, then open them in 3dwork.
 *
 * Drive will not preview STL/3MF. This board lists the Top model 3 folder as
 * rows (body, barrel, grip, …) and columns (Unconnected, Iron Wolf, Guardwolf,
 * Shotgun, Pistol, Evo). Nothing is meshed until Open in 3dwork.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HardDrive, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_DRIVE_FOLDER_ID,
  driveCollectMeshes,
  driveDownload,
  drivePeek3mfThumbnail,
  formatDriveBytes,
  readStoredToken,
} from '@/lib/3dwork/drive';
import {
  DEFAULT_SLOTS,
  GUN_KITS,
  UNCONNECTED_KIT,
  classifyPart,
  type CatalogPart,
} from '@/lib/3dwork/project';
import { is3mf } from '@/lib/3dwork/threemf';
import { ACTION_GHOST, ACTION_PRIMARY, LABEL } from './ui';

const CELL_LIMIT = 5;
const KIT_COLUMNS = [UNCONNECTED_KIT, ...GUN_KITS];

export function KitBoard({
  onConnectDrive,
  onOpenIn3dwork,
  opening,
  driveOpen,
}: {
  onConnectDrive: () => void;
  onOpenIn3dwork: (
    files: File[],
    tags: Record<string, { slotId: string; kitId: string }>
  ) => void | Promise<void>;
  opening?: boolean;
  /** When the Drive dialog closes, re-read the stored token. */
  driveOpen?: boolean;
}) {
  const [token, setToken] = useState('');
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refreshToken = () => setToken(readStoredToken());

  useEffect(() => {
    refreshToken();
  }, []);

  useEffect(() => {
    if (!driveOpen) refreshToken();
  }, [driveOpen]);

  const loadCatalog = useCallback(
    async (access = token) => {
      if (!access) {
        toast.error('Connect Google Drive first.');
        return;
      }
      setBusy('Listing Drive parts…');
      try {
        const collected = await driveCollectMeshes(access, DEFAULT_DRIVE_FOLDER_ID);
        const entries: CatalogPart[] = collected.map(({ item, parentName }) => {
          const classified = classifyPart(item.name, parentName);
          return {
            driveId: item.id,
            name: item.name,
            size: item.size,
            slotId: classified.slotId,
            kitId: classified.kitId,
            parentName,
            thumbnail: item.thumbnailLink ?? undefined,
          };
        });
        setCatalog(entries);
        setBusy(`Pictures for ${entries.filter((entry) => is3mf(entry.name)).length} 3MF files…`);
        const withPics = [...entries];
        let cursor = 0;
        const workers = Array.from({ length: 3 }, async () => {
          while (cursor < withPics.length) {
            const index = cursor++;
            const entry = withPics[index];
            if (!is3mf(entry.name) || !entry.size) continue;
            try {
              const image = await drivePeek3mfThumbnail(access, entry.driveId, entry.size);
              if (image) withPics[index] = { ...entry, thumbnail: image };
            } catch {
              // Leave the cell as a name badge — Open in 3dwork still works.
            }
          }
        });
        await Promise.all(workers);
        setCatalog([...withPics]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not list Drive.');
      } finally {
        setBusy(null);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token && catalog.length === 0) void loadCatalog(token);
  }, [token, catalog.length, loadCatalog]);

  const pickCount = Object.keys(picks).length;

  const pick = (slotId: string, driveId: string) => {
    setPicks((current) => {
      if (current[slotId] === driveId) {
        const next = { ...current };
        delete next[slotId];
        return next;
      }
      return { ...current, [slotId]: driveId };
    });
  };

  const pickKit = (kitId: string) => {
    const next: Record<string, string> = {};
    for (const slot of DEFAULT_SLOTS) {
      const first = catalog.find(
        (entry) => entry.slotId === slot.id && (entry.kitId || '') === kitId
      );
      if (first) next[slot.id] = first.driveId;
    }
    setPicks(next);
    toast.message(
      Object.keys(next).length
        ? `Picked ${Object.keys(next).length} ${KIT_COLUMNS.find((kit) => kit.id === kitId)?.name ?? ''} parts — still 2D.`
        : 'Nothing in that column yet.'
    );
  };

  const openEntries = async (chosen: CatalogPart[]) => {
    if (!token) {
      toast.error('Connect Google Drive first.');
      return;
    }
    if (chosen.length === 0) {
      toast.error('Pick a part first.');
      return;
    }
    setBusy(`Downloading ${chosen.length} part${chosen.length === 1 ? '' : 's'}…`);
    try {
      const tags: Record<string, { slotId: string; kitId: string }> = {};
      const files: File[] = [];
      for (const entry of chosen) {
        const file = await driveDownload(token, entry.driveId, entry.name);
        files.push(file);
        tags[file.name] = { slotId: entry.slotId, kitId: entry.kitId };
      }
      await Promise.resolve(onOpenIn3dwork(files, tags));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not download those parts.');
    } finally {
      setBusy(null);
    }
  };

  const openIn3dwork = () => {
    const chosen = catalog.filter((entry) => picks[entry.slotId] === entry.driveId);
    void openEntries(chosen);
  };

  const unslotted = useMemo(
    () => catalog.filter((entry) => !entry.slotId),
    [catalog]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">2D kits</h2>
          <p className="text-[0.7rem] text-slate-500">
            Pictures only. Pick one option per row, then open the gun in 3dwork.
          </p>
        </div>
        {!token ? (
          <button type="button" className={ACTION_PRIMARY} onClick={onConnectDrive}>
            <HardDrive className="h-3.5 w-3.5" />
            Connect Drive
          </button>
        ) : (
          <>
            <button
              type="button"
              className={ACTION_GHOST}
              onClick={() => void loadCatalog()}
              disabled={Boolean(busy)}
            >
              Reload Drive
            </button>
            <button
              type="button"
              className={ACTION_PRIMARY}
              onClick={() => void openIn3dwork()}
              disabled={pickCount === 0 || Boolean(busy) || opening}
            >
              Open in 3dwork{pickCount ? ` · ${pickCount}` : ''}
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!token ? (
          <p className="px-4 py-8 text-sm text-slate-500">
            Connect Drive once. This board then fills from <strong>Top model 3</strong> — Iron Wolf,
            Guardwolf, shotgun, pistol, Evo — as pictures only. Meshes stay on Drive until you open
            one part, or a whole pick, in 3dwork.
          </p>
        ) : (
          <table className="min-w-[720px] w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-20 bg-white px-2 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">
                  Part
                </th>
                {KIT_COLUMNS.map((kit) => (
                  <th key={kit.id || 'unconnected'} className="px-1 py-2">
                    <button
                      type="button"
                      className={`${LABEL} hover:text-emerald-700`}
                      onClick={() => pickKit(kit.id)}
                      title={`Pick this column’s first option on every row`}
                    >
                      {kit.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEFAULT_SLOTS.map((slot) => (
                <tr key={slot.id} className="border-b border-slate-100 align-top">
                  <th className="sticky left-0 bg-white px-2 py-2 text-[0.75rem] font-bold text-slate-700">
                    {slot.name}
                  </th>
                  {KIT_COLUMNS.map((kit) => {
                    const cell = catalog.filter(
                      (entry) =>
                        entry.slotId === slot.id && (entry.kitId || '') === kit.id
                    );
                    const shown = cell.slice(0, CELL_LIMIT);
                    return (
                      <td key={`${slot.id}-${kit.id || 'u'}`} className="px-1 py-1.5">
                        {shown.length === 0 ? (
                          <span className="text-[0.65rem] text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {shown.map((entry) => {
                              const selected = picks[slot.id] === entry.driveId;
                              return (
                                <div
                                  key={entry.driveId}
                                  className={`w-[84px] overflow-hidden rounded border text-left ${
                                    selected
                                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400'
                                      : 'border-slate-200 bg-slate-50'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => pick(slot.id, entry.driveId)}
                                    title={`Pick ${entry.name} for this row`}
                                    className="block w-full"
                                  >
                                    <div className="flex h-14 items-center justify-center bg-slate-100">
                                      {entry.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={entry.thumbnail}
                                          alt=""
                                          className="h-full w-full object-contain"
                                        />
                                      ) : (
                                        <span className="font-mono text-[0.55rem] font-bold uppercase text-slate-400">
                                          {entry.name.replace(/^.*\./, '')}
                                        </span>
                                      )}
                                    </div>
                                    <div className="truncate px-1 py-0.5 text-[0.58rem] font-semibold text-slate-700">
                                      {entry.name}
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full border-t border-slate-200 py-0.5 text-[0.52rem] font-extrabold uppercase tracking-wide text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300"
                                    disabled={Boolean(busy) || opening}
                                    onClick={() => void openEntries([entry])}
                                    title="Download only this file and open it on the 3D bench"
                                  >
                                    → 3D
                                  </button>
                                </div>
                              );
                            })}
                            {cell.length > CELL_LIMIT ? (
                              <span className="self-center text-[0.6rem] text-slate-400">
                                +{cell.length - CELL_LIMIT}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {unslotted.length > 0 && (
          <div className="border-t border-slate-200 px-3 py-2">
            <div className={`${LABEL} mb-1.5`}>Not sure which row</div>
            <p className="mb-2 text-[0.65rem] text-slate-500">
              Name did not match a slot. Open one in 3dwork to mesh-fix it, or leave it off the
              grid.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {unslotted.slice(0, 24).map((entry) => (
                <li key={entry.driveId}>
                  <button
                    type="button"
                    className="max-w-[12rem] truncate rounded border border-slate-200 px-2 py-1 text-left text-[0.65rem] text-slate-600 hover:border-emerald-400 hover:text-emerald-800 disabled:text-slate-400"
                    title={`${entry.parentName} / ${entry.name} — open this file in 3dwork`}
                    disabled={Boolean(busy) || opening}
                    onClick={() => void openEntries([entry])}
                  >
                    {entry.name}
                    <span className="ml-1 text-slate-400">{formatDriveBytes(entry.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {busy || opening ? (
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-[0.75rem] text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {busy || 'Opening in 3dwork…'}
        </div>
      ) : catalog.length > 0 ? (
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-1.5 text-[0.65rem] text-slate-400">
          <Layers className="h-3.5 w-3.5" />
          {catalog.length} files on the board · {pickCount} picked · meshes stay on Drive until Open
          in 3dwork
        </div>
      ) : null}
    </div>
  );
}
