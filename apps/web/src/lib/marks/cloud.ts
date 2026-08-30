/**
 * Marks ↔ company Supabase. Same pattern as TurboPaint / 3dwork: no login,
 * one home board, last-write-wins. Cover images live in the public `marks` bucket.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MARKS_BOARD_ID, isMarksDoc, normalizeDoc, type MarksDoc } from './model';

const COMPANY_URL = 'https://osfdzskyvisifcwyjkuk.supabase.co';
const COMPANY_KEY = 'sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f';
const TABLE = 'marks_boards';
export const MARKS_BUCKET = 'marks';

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

export async function loadMarksBoard(): Promise<MarksDoc | null> {
  const sb = getMarksSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .select('doc, deleted')
    .eq('id', MARKS_BOARD_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted) return null;
  return normalizeDoc(data.doc) ?? (isMarksDoc(data.doc) ? data.doc : null);
}

export async function saveMarksBoard(doc: MarksDoc): Promise<void> {
  const sb = getMarksSupabase();
  if (!sb) throw new Error('Supabase is only available in the browser.');
  const { error } = await sb.from(TABLE).upsert({
    id: MARKS_BOARD_ID,
    doc,
    deleted: false,
    updated_at: new Date(doc.updatedAt || Date.now()).toISOString(),
  });
  if (error) throw new Error(error.message);
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
