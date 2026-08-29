'use client';

/**
 * 2D kit board — pick parts as pictures, then open them in 3dwork.
 *
 * Drive will not preview STL/3MF. This board lists the Top model 3 folder as
 * rows (body, barrel, grip, …) and columns (Unconnected, Iron Wolf, Guardwolf,
 * Shotgun, Pistol, Evo). Nothing is meshed until Open in 3dwork.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HardDrive, Layers, Loader2, Upload } from 'lucide-react';
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
import { ACTION_GHOST, ACTION_PRIMARY, LABEL } from './ui';

const isMeshFile = (name: string) => /\.(stl|3mf)$/i.test(name);
const is3mfName = (name: string) => /\.3mf$/i.test(name);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setBusy(`Pictures for ${entries.filter((entry) => is3mfName(entry.name)).length} 3MF files…`);
        const withPics = [...entries];
        let cursor = 0;
        const workers = Array.from({ length: 3 }, async () => {
          while (cursor < withPics.length) {
            const index = cursor++;
            const entry = withPics[index];
            if (!is3mfName(entry.name) || !entry.size) continue;
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

  const openLocalFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter(
      (file) => isMeshFile(file.name)
    );
    if (files.length === 0) {
      toast.error('Pick an STL or 3MF file.');
      return;
    }
    const tags: Record<string, { slotId: string; kitId: string }> = {};
    for (const file of files) {
      tags[file.name] = classifyPart(file.name);
    }
    setBusy(`Opening ${files.length} file${files.length === 1 ? '' : 's'}…`);
    try {
      await Promise.resolve(onOpenIn3dwork(files, tags));
    } finally {
      setBusy(null);
    }
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
            2D only — the 3D table does not start until you open a part. Tap one file.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.3mf"
          className="hidden"
          onChange={(event) => {
            void openLocalFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className={token ? ACTION_GHOST : ACTION_PRIMARY}
          onClick={() => fileInputRef.current?.click()}
          disabled={Boolean(busy) || opening}
        >
          <Upload className="h-3.5 w-3.5" />
          Open a file…
        </button>
        {!token ? (
          <button type="button" className={ACTION_GHOST} onClick={onConnectDrive}>
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
              Open kit{pickCount ? ` · ${pickCount}` : ''}
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!token ? (
          <p className="px-4 py-8 text-sm text-slate-500">
            This page is pictures and names. WebGL stays off. <strong>Open a file…</strong> (or tap
            a Drive tile) starts the 3D bench with that one part so Fix can run. Connect Drive to
            fill the board from <strong>Top model 3</strong>.
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
                                  className={`relative w-[100px] overflow-hidden rounded border text-left ${
                                    selected
                                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400'
                                      : 'border-slate-200 bg-slate-50'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className={`absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[0.7rem] font-extrabold ${
                                      selected
                                        ? 'border-emerald-600 bg-emerald-600 text-white'
                                        : 'border-slate-300 bg-white text-slate-400 hover:border-slate-500'
                                    }`}
                                    title={`Tick to include ${entry.name} in a kit`}
                                    onClick={() => pick(slot.id, entry.driveId)}
                                  >
                                    {selected ? '✓' : ''}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void openEntries([entry])}
                                    title={`Open ${entry.name} in 3dwork`}
                                    disabled={Boolean(busy) || opening}
                                    className="block w-full text-left disabled:opacity-50"
                                  >
                                    <div className="flex h-16 items-center justify-center bg-slate-100">
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
                                    <div className="border-t border-slate-200 px-1 py-1 text-center text-[0.52rem] font-extrabold uppercase tracking-wide text-emerald-700">
                                      Open in 3dwork
                                    </div>
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
          {catalog.length} files on the board · tap one to open it · {pickCount} ticked for a kit
        </div>
      ) : null}
    </div>
  );
}
