/**
 * Marks ↔ company Supabase. Same pattern as TurboPaint / 3dwork: no login,
 * last-write-wins. Each `marks_boards` row is a site (`home` plus extra
 * `site_…` boards). Cover images live in the public `marks` bucket.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  MARKS_BOARD_ID,
  isMarksBoardId,
  isMarksDoc,
  normalizeDoc,
  persistDoc,
  siteTitle,
  type MarksDoc,
} from './model';
import { layoutMissingWindows } from './windows';

const COMPANY_URL = 'https://osfdzskyvisifcwyjkuk.supabase.co';
const COMPANY_KEY = 'sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f';
const TABLE = 'marks_boards';
export const MARKS_BUCKET = 'marks';

export const MARKS_LOCAL_PREFIX = 'kjarni-marks:';
export const MARKS_LOCAL_HOME_LEGACY = 'kjarni-marks-home';

export function marksLocalKey(id: string): string {
  return `${MARKS_LOCAL_PREFIX}${id}`;
}

function configuredUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw || /localhost|127\.0\.0\.1/.test(raw)) return undefined;
  return raw.replace(/\/$/, '');
}

export const MARKS_SUPABASE_URL = configuredUrl() ?? COMPANY_URL;
export const MARKS_SUPABASE_KEY = configuredUrl()
  ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    COMPANY_KEY
  : COMPANY_KEY;

let client: SupabaseClient | null = null;

export function getMarksSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(MARKS_SUPABASE_URL, MARKS_SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function createMarksServerClient(): SupabaseClient {
  return createClient(MARKS_SUPABASE_URL, MARKS_SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseStoredDoc(raw: unknown): MarksDoc | null {
  const normalized = normalizeDoc(raw) ?? (isMarksDoc(raw) ? raw : null);
  return normalized ? layoutMissingWindows(normalized, raw) : null;
}

export function loadMarksLocal(id: string): MarksDoc | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      localStorage.getItem(marksLocalKey(id)) ??
      (id === MARKS_BOARD_ID ? localStorage.getItem(MARKS_LOCAL_HOME_LEGACY) : null);
    if (!raw) return null;
    return parseStoredDoc(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveMarksLocal(id: string, doc: MarksDoc): void {
  localStorage.setItem(marksLocalKey(id), JSON.stringify(persistDoc(doc)));
}

export async function loadMarksBoard(id: string = MARKS_BOARD_ID): Promise<MarksDoc | null> {
  const sb = getMarksSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .select('doc, deleted')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted) return null;
  return parseStoredDoc(data.doc);
}

export async function saveMarksBoard(doc: MarksDoc, id: string = MARKS_BOARD_ID): Promise<void> {
  const sb = getMarksSupabase();
  if (!sb) throw new Error('Supabase is only available in the browser.');
  const { error } = await sb.from(TABLE).upsert({
    id,
    doc,
    deleted: false,
    updated_at: new Date(doc.updatedAt || Date.now()).toISOString(),
  });
  if (error) throw new Error(error.message);
}

export type MarksSiteListItem = {
  id: string;
  title: string;
  updatedAt: number;
};

function titleFor(id: string, doc: MarksDoc | null): string {
  return siteTitle(doc, id === MARKS_BOARD_ID ? 'Home' : 'Untitled');
}

function collectLocalSites(): MarksSiteListItem[] {
  if (typeof window === 'undefined') return [];
  const items: MarksSiteListItem[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    let id = '';
    if (key.startsWith(MARKS_LOCAL_PREFIX)) id = key.slice(MARKS_LOCAL_PREFIX.length);
    else if (key === MARKS_LOCAL_HOME_LEGACY) id = MARKS_BOARD_ID;
    if (!id || !isMarksBoardId(id)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const doc = normalizeDoc(JSON.parse(raw) as unknown);
      items.push({
        id,
        title: titleFor(id, doc),
        updatedAt: doc?.updatedAt ?? 0,
      });
    } catch {
      /* skip a bad local row */
    }
  }
  return items;
}

export async function listMarksBoards(): Promise<MarksSiteListItem[]> {
  const byId = new Map<string, MarksSiteListItem>();
  for (const row of collectLocalSites()) byId.set(row.id, row);

  const sb = getMarksSupabase();
  if (sb) {
    const { data, error } = await sb
      .from(TABLE)
      .select('id, doc, updated_at, deleted')
      .eq('deleted', false);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!isMarksBoardId(id)) continue;
      const doc = normalizeDoc(row.doc);
      const updatedAt = doc?.updatedAt ?? Date.parse(String(row.updated_at || '')) || 0;
      const existing = byId.get(id);
      if (existing && existing.updatedAt > updatedAt) continue;
      byId.set(id, { id, title: titleFor(id, doc), updatedAt });
    }
  }

  if (!byId.has(MARKS_BOARD_ID)) {
    byId.set(MARKS_BOARD_ID, { id: MARKS_BOARD_ID, title: 'Home', updatedAt: 0 });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.id === MARKS_BOARD_ID) return -1;
    if (b.id === MARKS_BOARD_ID) return 1;
    return b.updatedAt - a.updatedAt || a.title.localeCompare(b.title);
  });
}

export async function uploadMarkCover(file: Blob, fileName = 'cover.jpg'): Promise<string> {
  const sb = getMarksSupabase();
  if (!sb) throw new Error('Supabase is only available in the browser.');
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.jpg';
  const path = `covers/${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error } = await sb.storage.from(MARKS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return sb.storage.from(MARKS_BUCKET).getPublicUrl(path).data.publicUrl;
}
