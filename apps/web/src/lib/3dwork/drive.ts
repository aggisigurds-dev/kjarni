import { peek3mfThumbnailFromRanges } from './threemf';

/**
 * Google Drive helpers for the 3dwork parts browser.
 *
 * Drive itself will not preview STL / 3MF. We list the folder, pull a
 * thumbnail out of a 3MF when the slicer left one, and otherwise mesh a
 * small file just enough to draw a picture.
 */

export const DEFAULT_DRIVE_FOLDER_ID = '1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ';
export const DEFAULT_DRIVE_FOLDER_NAME = 'Top model 3';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export const CLIENT_ID_KEY = 'kjarni_3dwork_google_client';
export const TOKEN_KEY = 'kjarni_3dwork_drive_token';
export const FOLDER_KEY = 'kjarni_3dwork_drive_folder';

/**
 * Company Web OAuth client (public by design — same class of id as GIS
 * `client_id` in the browser). Override with NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 * Authorized JavaScript origins on this client must include the 3dwork URL.
 */
export const DEFAULT_GOOGLE_CLIENT_ID =
  '708215000553-77htigi4tkqdr00bfak0j2e539h9bc2d.apps.googleusercontent.com';

/** Auto-mesh a file for a preview only when it is this small. */
export const PREVIEW_BYTES = 12 * 1024 * 1024;

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  thumbnailLink: string | null;
  isFolder: boolean;
  isMesh: boolean;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Last folder id in a Drive URL — mobile nested paths put the parent first. */
export function parseDriveId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw) && !raw.includes('/')) return raw;

  try {
    const url = new URL(raw);
    const openId = url.searchParams.get('id');
    if (openId && /^[a-zA-Z0-9_-]{20,}$/.test(openId)) return openId;

    const file = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (file) return file[1];

    const folders = url.pathname.match(/\/folders\/([a-zA-Z0-9_/-]+)/);
    if (folders) {
      const parts = folders[1].split('/').filter((part) => /^[a-zA-Z0-9_-]{20,}$/.test(part));
      if (parts.length) return parts[parts.length - 1];
    }
  } catch {
    return null;
  }
  return null;
}

export function isMeshName(name: string): boolean {
  return /\.(stl|3mf)$/i.test(name);
}

export function formatDriveBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function defaultGoogleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || DEFAULT_GOOGLE_CLIENT_ID;
}

export function readStoredClientId(): string {
  if (typeof window === 'undefined') return defaultGoogleClientId();
  return window.localStorage.getItem(CLIENT_ID_KEY)?.trim() || defaultGoogleClientId();
}

export function storeClientId(id: string) {
  window.localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

export function readStoredToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(TOKEN_KEY) ?? '';
}

export function storeToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function readRememberedFolder(): string {
  if (typeof window === 'undefined') return DEFAULT_DRIVE_FOLDER_ID;
  return localStorage.getItem(FOLDER_KEY) || DEFAULT_DRIVE_FOLDER_ID;
}

export function rememberFolder(id: string) {
  localStorage.setItem(FOLDER_KEY, id);
}

interface DriveFileJson {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  parents?: string[];
}

function toItem(file: DriveFileJson): DriveItem | null {
  if (!file.id || !file.name) return null;
  const isFolder = file.mimeType === FOLDER_MIME;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType ?? '',
    size: file.size ? Number(file.size) : null,
    modifiedTime: file.modifiedTime ?? null,
    thumbnailLink: file.thumbnailLink ?? null,
    isFolder,
    isMesh: !isFolder && isMeshName(file.name),
  };
}

async function driveGet<T>(
  token: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${DRIVE_API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    clearToken();
    throw new Error('Google Drive sign-in expired. Connect again.');
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 180) || `Drive request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function driveItemMeta(
  token: string,
  id: string
): Promise<DriveItem & { parentId: string | null }> {
  const file = await driveGet<DriveFileJson>(token, `/files/${id}`, {
    fields: 'id,name,mimeType,size,modifiedTime,thumbnailLink,parents',
    supportsAllDrives: 'true',
  });
  const item = toItem(file);
  if (!item) throw new Error('Drive did not return that file.');
  return { ...item, parentId: file.parents?.[0] ?? null };
}

export async function driveFolderMeta(
  token: string,
  id: string
): Promise<{ id: string; name: string; parentId: string | null }> {
  const file = await driveGet<DriveFileJson>(token, `/files/${id}`, {
    fields: 'id,name,mimeType,parents',
    supportsAllDrives: 'true',
  });
  return {
    id: file.id ?? id,
    name: file.name ?? 'Folder',
    parentId: file.parents?.[0] ?? null,
  };
}

export async function driveListFolder(token: string, folderId: string): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let pageToken = '';
  for (let page = 0; page < 8; page++) {
    const data = await driveGet<{ files?: DriveFileJson[]; nextPageToken?: string }>(
      token,
      '/files',
      {
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
        pageSize: '100',
        orderBy: 'folder,name',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      }
    );
    for (const file of data.files ?? []) {
      const item = toItem(file);
      if (item && (item.isFolder || item.isMesh)) items.push(item);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return items;
}

/** Root folder plus two levels of subfolders — enough for iron wolf / Iron wolf v2. */
export async function driveCollectMeshes(
  token: string,
  rootId: string
): Promise<{ item: DriveItem; parentName: string }[]> {
  const out: { item: DriveItem; parentName: string }[] = [];
  const rootMeta = await driveFolderMeta(token, rootId);
  const root = await driveListFolder(token, rootId);
  for (const item of root) {
    if (item.isMesh) out.push({ item, parentName: rootMeta.name });
    if (!item.isFolder) continue;
    const children = await driveListFolder(token, item.id);
    for (const child of children) {
      if (child.isMesh) out.push({ item: child, parentName: item.name });
      if (!child.isFolder) continue;
      const grand = await driveListFolder(token, child.id);
      for (const file of grand) {
        if (file.isMesh) out.push({ item: file, parentName: `${item.name} / ${child.name}` });
      }
    }
  }
  return out;
}

export async function driveRange(
  token: string,
  id: string,
  start: number,
  endInclusive: number
): Promise<Uint8Array> {
  const response = await fetch(`${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Range: `bytes=${start}-${endInclusive}`,
    },
  });
  if (response.status === 401) {
    clearToken();
    throw new Error('Google Drive sign-in expired. Connect again.');
  }
  if (!response.ok && response.status !== 206) {
    throw new Error(`Could not read bytes from Drive (${response.status})`);
  }
  if (response.status === 200) {
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 8 * 1024 * 1024) {
      await response.body?.cancel();
      throw new Error('Drive sent the whole file instead of a slice.');
    }
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function drivePeek3mfThumbnail(
  token: string,
  id: string,
  fileSize: number
): Promise<string | undefined> {
  return peek3mfThumbnailFromRanges(fileSize, (start, end) => driveRange(token, id, start, end));
}

export async function driveDownload(token: string, id: string, name: string): Promise<File> {
  const response = await fetch(`${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    clearToken();
    throw new Error('Google Drive sign-in expired. Connect again.');
  }
  if (!response.ok) throw new Error(`Could not download ${name}`);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}
