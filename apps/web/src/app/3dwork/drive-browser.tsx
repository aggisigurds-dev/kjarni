'use client';

import { useCallback, useEffect, useState } from 'react';
import { Folder, HardDrive, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_NAME,
  DRIVE_SCOPE,
  PREVIEW_BYTES,
  clearToken,
  driveDownload,
  driveFolderMeta,
  driveItemMeta,
  driveListFolder,
  drivePeek3mfThumbnail,
  driveRange,
  formatDriveBytes,
  parseDriveId,
  readRememberedFolder,
  readStoredClientId,
  readStoredToken,
  rememberFolder,
  storeClientId,
  storeToken,
  type DriveItem,
} from '@/lib/3dwork/drive';
import { extract3mfThumbnail, is3mf, parse3mf } from '@/lib/3dwork/threemf';
import { parseStl, peekBinaryStlTriangles } from '@/lib/3dwork/stl';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL } from './ui';
import { renderThumbnail } from './thumbnail';

interface Crumb {
  id: string;
  name: string;
}

interface Preview {
  id: string;
  name: string;
  image?: string;
  note: string;
  file?: File;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string; error_description?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kjarni-gis]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.kjarniGis = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(script);
  });
}

export function DriveBrowser({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (files: File[], folderHint?: string) => void;
}) {
  const [clientId, setClientId] = useState('');
  const [token, setToken] = useState('');
  const [link, setLink] = useState('');
  const [folderId, setFolderId] = useState(DEFAULT_DRIVE_FOLDER_ID);
  const [crumbs, setCrumbs] = useState<Crumb[]>([
    { id: DEFAULT_DRIVE_FOLDER_ID, name: DEFAULT_DRIVE_FOLDER_NAME },
  ]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setClientId(readStoredClientId());
    setToken(readStoredToken());
    setFolderId(readRememberedFolder());
  }, []);

  const openFolder = useCallback(
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
        rememberFolder(id);
        setItems(listed);
        setPicked(new Set());
        setCrumbs((current) => {
          const index = current.findIndex((crumb) => crumb.id === id);
          if (index >= 0) return current.slice(0, index + 1);
          return [...current, { id, name: meta.name }];
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not open that folder.');
      } finally {
        setBusy(null);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) void openFolder(folderId, token);
    // First load only — later opens go through openFolder directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const connect = async () => {
    const id = clientId.trim();
    if (!id) {
      toast.error('Paste a Google OAuth client ID first (Web application).');
      return;
    }
    storeClientId(id);
    setBusy('Waiting for Google…');
    try {
      await loadGis();
      await new Promise<void>((resolve, reject) => {
        const client = window.google?.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error_description || response.error || 'Sign-in cancelled'));
              return;
            }
            storeToken(response.access_token);
            setToken(response.access_token);
            resolve();
          },
        });
        if (!client) {
          reject(new Error('Google sign-in is not available in this browser.'));
          return;
        }
        client.requestAccessToken({ prompt: '' });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () => {
    clearToken();
    setToken('');
    setItems([]);
    setPreview(null);
  };

  const goLink = async () => {
    const id = parseDriveId(link);
    if (!id) {
      toast.error('That does not look like a Drive folder or file link.');
      return;
    }
    if (!token) {
      toast.error('Connect Google Drive first.');
      return;
    }
    setBusy('Opening link…');
    try {
      const meta = await driveItemMeta(token, id);
      if (meta.isFolder) {
        await openFolder(meta.id);
        return;
      }
      if (!meta.isMesh) {
        toast.error('That file is not an STL or 3MF.');
        return;
      }
      if (meta.parentId) await openFolder(meta.parentId);
      await loadPreview(meta);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open that link.');
    } finally {
      setBusy(null);
    }
  };

  const loadPreview = async (item: DriveItem) => {
    if (item.isFolder) {
      void openFolder(item.id);
      return;
    }
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    if (!token) return;
    const cached = thumbs[item.id] || item.thumbnailLink || undefined;
    setPreview({
      id: item.id,
      name: item.name,
      image: cached,
      note: cached ? 'Looking for a sharper picture…' : 'Looking for a picture Drive will not show…',
    });
    setBusy(`Opening ${item.name}…`);
    try {
      let image = cached;
      let note = `${formatDriveBytes(item.size)} · add it to the bench when you like what you see`;
      let file: File | undefined;

      if (is3mf(item.name)) {
        if (item.size && item.size > 256 * 1024) {
          image = (await drivePeek3mfThumbnail(token, item.id, item.size)) || image;
        }
        if (image && image !== cached) {
          note = 'Slicer thumbnail from the 3MF — this is the part, not a guess.';
          setThumbs((current) => ({ ...current, [item.id]: image! }));
        } else if (!image && item.size && item.size <= PREVIEW_BYTES) {
          file = await driveDownload(token, item.id, item.name);
          const buffer = await file.arrayBuffer();
          image = await extract3mfThumbnail(buffer);
          if (image) {
            note = 'Slicer thumbnail from the 3MF — this is the part, not a guess.';
            setThumbs((current) => ({ ...current, [item.id]: image! }));
          } else {
            const meshes = await parse3mf(buffer);
            const soup = meshes[0]?.soup;
            if (soup) {
              image = renderThumbnail(soup, '#64748b');
              note = `${meshes.length} object${meshes.length === 1 ? '' : 's'} in the file`;
              if (image) setThumbs((current) => ({ ...current, [item.id]: image! }));
            }
          }
        } else if (!image) {
          note = `${formatDriveBytes(item.size)} — no embedded picture, and too heavy to mesh just to look. Add it to the bench.`;
        } else {
          note = 'Slicer thumbnail from the 3MF — this is the part, not a guess.';
        }
      } else if (item.size && item.size <= PREVIEW_BYTES) {
        file = await driveDownload(token, item.id, item.name);
        const raw = parseStl(await file.arrayBuffer());
        image = renderThumbnail(raw.positions, '#64748b');
        note = `${raw.triangles.toLocaleString()} triangles`;
        if (image) setThumbs((current) => ({ ...current, [item.id]: image! }));
      } else {
        const header = await driveRange(token, item.id, 0, 83);
        const triangles = peekBinaryStlTriangles(header.slice().buffer, item.size ?? undefined);
        note = triangles
          ? `${formatDriveBytes(item.size)} STL · ${triangles.toLocaleString()} triangles. Drive cannot preview this — add it to the bench.`
          : `${formatDriveBytes(item.size)} STL — Drive cannot preview this. Add it to the bench to see it.`;
      }

      setPreview({ id: item.id, name: item.name, image, note, file });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open that file.');
    } finally {
      setBusy(null);
    }
  };

  const addPicked = async () => {
    const meshes = items.filter((item) => item.isMesh && picked.has(item.id));
    if (meshes.length === 0) {
      toast.error('Tick a part first.');
      return;
    }
    setBusy(`Adding ${meshes.length} part${meshes.length === 1 ? '' : 's'}…`);
    try {
      const files: File[] = [];
      for (const item of meshes) {
        files.push(await driveDownload(token, item.id, item.name));
      }
      onImport(files, crumbs[crumbs.length - 1]?.name);
      toast.success(`Opening ${files.length} part${files.length === 1 ? '' : 's'} in 3dwork.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add those files.');
    } finally {
      setBusy(null);
    }
  };

  const addToBench = async (item: DriveItem, already?: File) => {
    if (!token && !already) return;
    setBusy(`Adding ${item.name}…`);
    try {
      const file = already ?? (await driveDownload(token, item.id, item.name));
      onImport([file], crumbs[crumbs.length - 1]?.name);
      toast.success(`Adding ${item.name} to the bench.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that file.');
    } finally {
      setBusy(null);
    }
  };

  const shown = items.filter((item) =>
    filter.trim() ? item.name.toLowerCase().includes(filter.trim().toLowerCase()) : true
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded border border-slate-300 bg-white sm:h-[min(88dvh,820px)]">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <HardDrive className="h-4 w-4 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">Google Drive parts</h2>
            <p className="truncate text-[0.7rem] text-slate-500">
              Tick one or more parts, then add them. Drive will not preview STL or 3MF — this window
              will.
            </p>
          </div>
          {token ? (
            <button type="button" className={ACTION_GHOST} onClick={disconnect}>
              Disconnect
            </button>
          ) : null}
          <button type="button" className={ACTION_GHOST} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-2 border-b border-slate-200 px-3 py-2">
          {!token ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="block min-w-0">
                <span className={`${LABEL} mb-1 block`}>Google OAuth client ID</span>
                <input
                  className={FIELD}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="….apps.googleusercontent.com"
                  autoComplete="off"
                />
              </label>
              <button type="button" className={`${ACTION_PRIMARY} sm:self-end`} onClick={() => void connect()}>
                Connect Drive
              </button>
              <p className="text-[0.7rem] text-slate-500 sm:col-span-2">
                Connect Drive signs you in with Google (read-only). If Google says the origin is
                not allowed, add{' '}
                <code className="font-mono">
                  {typeof window !== 'undefined' ? window.location.origin : 'this site'}
                </code>{' '}
                under that Web client → Authorized JavaScript origins.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={FIELD}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void goLink();
                }}
                placeholder="Paste a Drive folder link — or leave it and open Top model 3"
              />
              <button type="button" className={ACTION_GHOST} onClick={() => void goLink()}>
                Open link
              </button>
              <input
                className={`${FIELD} sm:max-w-[12rem]`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter name"
              />
            </div>
          )}
          {crumbs.length > 0 && token ? (
            <div className="flex flex-wrap items-center gap-1 text-[0.7rem] text-slate-500">
              {crumbs.map((crumb, index) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  {index > 0 ? <span>/</span> : null}
                  <button
                    type="button"
                    className="font-bold text-slate-700 hover:text-emerald-700"
                    onClick={() => void openFolder(crumb.id)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
              <span className="pl-2 text-slate-400">
                {shown.filter((item) => item.isMesh).length} mesh
                {shown.filter((item) => item.isMesh).length === 1 ? '' : 'es'}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!token ? (
              <p className="text-sm text-slate-500">
                Connect once, then this opens <strong>Top model 3</strong> — barrel, gw15, iron wolf,
                and the loose Valken / Tippmann / grip files Drive refuses to preview.
              </p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-slate-500">{busy ? busy : 'Nothing in this folder.'}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void loadPreview(item)}
                      className={`flex h-full w-full flex-col overflow-hidden rounded border text-left ${
                        picked.has(item.id)
                          ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-400'
                          : preview?.id === item.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-slate-400'
                      }`}
                    >
                      <div className="flex aspect-square items-center justify-center bg-slate-100">
                        {item.isFolder ? (
                          <Folder className="h-10 w-10 text-amber-500" />
                        ) : thumbs[item.id] || item.thumbnailLink ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbs[item.id] || item.thumbnailLink || ''}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="font-mono text-[0.65rem] font-bold uppercase text-slate-400">
                            {item.name.replace(/^.*\./, '')}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 px-2 py-1.5">
                        <div className="truncate text-[0.7rem] font-bold text-slate-800">{item.name}</div>
                        <div className="text-[0.65rem] text-slate-500">
                          {item.isFolder ? 'Folder' : formatDriveBytes(item.size)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="flex min-h-[220px] w-full shrink-0 flex-col border-t border-slate-200 bg-slate-50 p-3 md:w-72 md:border-l md:border-t-0">
            {preview ? (
              <>
                <div className="mb-2 truncate text-sm font-bold text-slate-900">{preview.name}</div>
                <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                  {preview.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.image} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="px-3 text-center text-[0.7rem] text-slate-500">No picture yet</span>
                  )}
                </div>
                <p className="mb-3 text-[0.7rem] leading-relaxed text-slate-600">{preview.note}</p>
                <button
                  type="button"
                  className={ACTION_PRIMARY}
                  onClick={() => {
                    const item = items.find((entry) => entry.id === preview.id);
                    if (item) void addToBench(item, preview.file);
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Add to bench
                </button>
                {picked.size > 0 ? (
                  <button
                    type="button"
                    className={`${ACTION_GHOST} mt-2`}
                    onClick={() => void addPicked()}
                  >
                    Open {picked.size} selected in 3dwork
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-[0.7rem] leading-relaxed text-slate-500">
                Tap a file to preview it. 3MF files often already contain a picture from Bambu /
                Prusa — that is what you get here, instantly, instead of a grey Drive icon.
              </p>
            )}
          </aside>
        </div>

        {busy ? (
          <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-[0.75rem] text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {busy}
          </div>
        ) : null}
      </div>
    </div>
  );
}
