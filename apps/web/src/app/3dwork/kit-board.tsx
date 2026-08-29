'use client';

/**
 * 2D part chooser — like a Drive / Explorer window, then open the picks in 3dwork.
 *
 * Folders and 3MF pictures only. Click to tick one or many. Open in 3dwork
 * downloads those files and starts the bench. The 3D table does not run here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Folder, HardDrive, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_NAME,
  driveDownload,
  driveFolderMeta,
  driveListFolder,
  drivePeek3mfThumbnail,
  formatDriveBytes,
  readStoredToken,
  type DriveItem,
} from '@/lib/3dwork/drive';
import { classifyPart } from '@/lib/3dwork/project';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL } from './ui';

const isMeshFile = (name: string) => /\.(stl|3mf)$/i.test(name);
const is3mfName = (name: string) => /\.3mf$/i.test(name);

interface Crumb {
  id: string;
  name: string;
}

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
  driveOpen?: boolean;
}) {
  const [token, setToken] = useState('');
  const [folderId, setFolderId] = useState(DEFAULT_DRIVE_FOLDER_ID);
  const [crumbs, setCrumbs] = useState<Crumb[]>([
    { id: DEFAULT_DRIVE_FOLDER_ID, name: DEFAULT_DRIVE_FOLDER_NAME },
  ]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshToken = () => setToken(readStoredToken());

  useEffect(() => {
    refreshToken();
  }, []);

  useEffect(() => {
    if (!driveOpen) refreshToken();
  }, [driveOpen]);

  const loadFolder = useCallback(
    async (id: string, access = token) => {
      if (!access) {
        toast.error('Connect Google Drive first.');
        return;
      }
      setBusy('Listing folder…');
      try {
        const meta = await driveFolderMeta(access, id);
        const listed = await driveListFolder(access, id);
        setFolderId(id);
        setItems(listed);
        setSelected(new Set());
        setCrumbs((current) => {
          const index = current.findIndex((crumb) => crumb.id === id);
          if (index >= 0) return current.slice(0, index + 1);
          return [...current, { id, name: meta.name }];
        });
        setThumbs({});
        setBusy('Pictures…');
        const next: Record<string, string> = {};
        let cursor = 0;
        const workers = Array.from({ length: 3 }, async () => {
          while (cursor < listed.length) {
            const index = cursor++;
            const item = listed[index];
            if (!item.isMesh) continue;
            if (item.thumbnailLink) next[item.id] = item.thumbnailLink;
            if (!is3mfName(item.name) || !item.size) continue;
            try {
              const image = await drivePeek3mfThumbnail(access, item.id, item.size);
              if (image) next[item.id] = image;
            } catch {
              // Name badge is enough — Open in 3dwork still works.
            }
          }
        });
        await Promise.all(workers);
        setThumbs({ ...next });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not list Drive.');
      } finally {
        setBusy(null);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) void loadFolder(folderId, token);
    // First load only — later opens go through loadFolder directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const folderName = crumbs[crumbs.length - 1]?.name ?? '';

  const openMeshes = async (meshes: DriveItem[]) => {
    if (meshes.length === 0) {
      toast.error('Tick a part first.');
      return;
    }
    if (!token) {
      toast.error('Connect Google Drive first.');
      return;
    }
    setBusy(`Downloading ${meshes.length} part${meshes.length === 1 ? '' : 's'}…`);
    try {
      const tags: Record<string, { slotId: string; kitId: string }> = {};
      const files: File[] = [];
      for (const item of meshes) {
        const file = await driveDownload(token, item.id, item.name);
        files.push(file);
        tags[file.name] = classifyPart(item.name, folderName);
      }
      await Promise.resolve(onOpenIn3dwork(files, tags));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not download those parts.');
    } finally {
      setBusy(null);
    }
  };

  const openLocalFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter((file) => isMeshFile(file.name));
    if (files.length === 0) {
      toast.error('Pick an STL or 3MF file.');
      return;
    }
    const tags: Record<string, { slotId: string; kitId: string }> = {};
    for (const file of files) tags[file.name] = classifyPart(file.name);
    setBusy(`Opening ${files.length} file${files.length === 1 ? '' : 's'}…`);
    try {
      await Promise.resolve(onOpenIn3dwork(files, tags));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (item: DriveItem) => {
    if (item.isFolder) {
      void loadFolder(item.id);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const shown = items.filter((item) =>
    filter.trim() ? item.name.toLowerCase().includes(filter.trim().toLowerCase()) : true
  );
  const pickCount = [...selected].filter((id) => items.some((item) => item.id === id && item.isMesh))
    .length;
  const blocked = Boolean(busy) || opening;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">2D kits</h2>
          <p className="text-[0.7rem] text-slate-500">
            Same as Explorer: folders and pictures. Tick the parts you want, then open them in
            3dwork.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.3mf"
          multiple
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
          disabled={blocked}
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
              onClick={() => void loadFolder(folderId)}
              disabled={blocked}
            >
              Reload
            </button>
            <button
              type="button"
              className={ACTION_PRIMARY}
              onClick={() =>
                void openMeshes(items.filter((item) => item.isMesh && selected.has(item.id)))
              }
              disabled={pickCount === 0 || blocked}
            >
              Open in 3dwork{pickCount ? ` · ${pickCount}` : ''}
            </button>
          </>
        )}
      </div>

      {token ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[0.7rem] text-slate-500">
            {crumbs.map((crumb, index) => (
              <span key={crumb.id} className="flex items-center gap-1">
                {index > 0 ? <span>/</span> : null}
                <button
                  type="button"
                  className="font-bold text-slate-700 hover:text-emerald-700"
                  onClick={() => void loadFolder(crumb.id)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
          <input
            className={`${FIELD} max-w-[12rem]`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter name"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!token ? (
          <p className="px-1 py-6 text-sm text-slate-500">
            Connect Drive once. This window then looks like your{' '}
            <strong>Top model 3</strong> folder — barrel, gw15, iron wolf, and the loose Valken /
            trigger / mag files — as pictures. Tick a few, then Open in 3dwork. WebGL stays off
            until that click.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">{busy ? busy : 'Nothing in this folder.'}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {shown.map((item) => {
              const ticked = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    onDoubleClick={() => {
                      if (item.isMesh) void openMeshes([item]);
                    }}
                    title={
                      item.isFolder
                        ? `Open folder ${item.name}`
                        : `Tick ${item.name} — double-click opens only this file`
                    }
                    disabled={blocked && !item.isFolder}
                    className={`flex h-full w-full flex-col overflow-hidden rounded border text-left ${
                      ticked
                        ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-400'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="flex aspect-square items-center justify-center bg-slate-50">
                      {item.isFolder ? (
                        <Folder className="h-14 w-14 text-amber-400" strokeWidth={1.25} />
                      ) : thumbs[item.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbs[item.id]}
                          alt=""
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <span className="font-mono text-[0.65rem] font-bold uppercase text-slate-400">
                          {item.name.replace(/^.*\./, '')}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 px-1.5 py-1.5">
                      <div className="line-clamp-2 text-[0.7rem] font-semibold leading-tight text-slate-800">
                        {item.name}
                      </div>
                      <div className="mt-0.5 text-[0.6rem] text-slate-400">
                        {item.isFolder ? 'Folder' : formatDriveBytes(item.size)}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {busy || opening ? (
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-[0.75rem] text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {busy || 'Opening in 3dwork…'}
        </div>
      ) : token ? (
        <div className={`${LABEL} border-t border-slate-200 px-3 py-1.5`}>
          {shown.filter((item) => item.isFolder).length} folders ·{' '}
          {shown.filter((item) => item.isMesh).length} parts · {pickCount} ticked · pictures only
        </div>
      ) : null}
    </div>
  );
}
