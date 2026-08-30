/**
 * Marks ↔ company Supabase. Same pattern as TurboPaint / 3dwork: no login,
 * one home board, last-write-wins.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MARKS_BOARD_ID, isMarksDoc, type MarksDoc } from './model';

const COMPANY_URL = 'https://osfdzskyvisifcwyjkuk.supabase.co';
const COMPANY_KEY = 'sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f';
const TABLE = 'marks_boards';

function configuredUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw || /localhost|127\.0\.0\.1/.test(raw)) return undefined;
  return raw.replace(/\/$/, '');
}

const SUPABASE_URL = configuredUrl() ?? COMPANY_URL;
const SUPABASE_KEY = configuredUrl()
  ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    COMPANY_KEY
  : COMPANY_KEY;

let client: SupabaseClient | null = null;

export function getMarksSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
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
  return isMarksDoc(data.doc) ? data.doc : null;
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
