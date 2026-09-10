/**
 * 3dwork ↔ company Supabase (osfdzskyvisifcwyjkuk).
 *
 * This is the parts cloud: the same bench opens on a phone or another computer.
 * GitHub on this site is the kjarni *code* repo — not where meshes live.
 *
 * Geometry stays binary (Float32 soups). Project JSON drops data-URL thumbnails
 * so a row stays small. Fingerprints skip re-uploading a mesh the bucket
 * already has.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Part, Project } from './project';
import {
  buildManifest,
  geometryUploads,
  projectVersionIds,
  type CloudManifest,
  type CloudProjectIndexEntry,
} from './github-sync';

export const WORK3D_TABLE = 'work3d_projects';
export const WORK3D_BUCKET = 'work3d';

const COMPANY_URL = 'https://osfdzskyvisifcwyjkuk.supabase.co';
const COMPANY_KEY = 'sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f';

function configuredUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return undefined;
  if (/localhost|127\.0\.0\.1/.test(raw)) return undefined;
  return raw.replace(/\/$/, '');
}

function configuredKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

const SUPABASE_URL = configuredUrl() ?? COMPANY_URL;
const SUPABASE_KEY = configuredUrl() ? (configuredKey() ?? COMPANY_KEY) : COMPANY_KEY;

let client: SupabaseClient | null = null;

export function getWork3dSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Test hook — same URL the browser client will use. */
export function work3dCloudUrl(): string {
  return SUPABASE_URL;
}

export function stripPartThumbnails(part: Part): Part {
  const next: Part = { ...part };
  delete next.thumbnail;
  if (part.group?.members.length) {
    next.group = {
      ...part.group,
      members: part.group.members.map(stripPartThumbnails),
    };
  }
  return next;
}

/** Project JSON safe to upsert — no data-URL previews. */
export function cloudProjectJson(project: Project): Project {
  return {
    ...project,
    parts: project.parts.map(stripPartThumbnails),
  };
}

function geometryPath(projectId: string, versionId: string): string {
  return `${projectId}/${versionId}.bin`;
}

function asUpdatedAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export interface Work3dCloudRow {
  id: string;
  name: string;
  project: Project;
  manifest: CloudManifest;
  part_count: number;
  deleted: boolean;
  updated_at: string;
}

export async function listCloudProjects(): Promise<CloudProjectIndexEntry[]> {
  const sb = getWork3dSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from(WORK3D_TABLE)
    .select('id, name, part_count, updated_at, deleted')
    .eq('deleted', false)
    .order('updated_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) || 'Untitled blaster',
    parts: Number(row.part_count) || 0,
    updatedAt: asUpdatedAt(row.updated_at),
  }));
}

export async function saveToCloud(
  project: Project,
  geometries: Map<string, Float32Array>,
  /** Stamp for this push — defaults to now so another computer sees it as newer. */
  stamp = Date.now()
): Promise<{ updatedAt: number }> {
  const sb = getWork3dSupabase();
  if (!sb) throw new Error('Supabase is only available in the browser.');

  const wanted = new Map<string, Float32Array>();
  for (const id of projectVersionIds(project)) {
    const soup = geometries.get(id);
    if (soup) wanted.set(id, soup);
  }
  const manifest = buildManifest(wanted.entries());

  const { data: existing, error: existingError } = await sb
    .from(WORK3D_TABLE)
    .select('manifest')
    .eq('id', project.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const previous = (existing?.manifest as CloudManifest | null) ?? null;
  const uploads = geometryUploads(manifest, previous);

  for (const id of uploads) {
    const soup = wanted.get(id);
    if (!soup) continue;
    const { error } = await sb.storage.from(WORK3D_BUCKET).upload(geometryPath(project.id, id), soup.slice().buffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    });
    if (error) throw new Error(error.message);
  }

  const updatedAt = Math.max(stamp, project.updatedAt || 0);
  const { error } = await sb.from(WORK3D_TABLE).upsert({
    id: project.id,
    name: project.name,
    project: cloudProjectJson(project),
    manifest,
    part_count: project.parts.length,
    deleted: false,
    updated_at: new Date(updatedAt).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { updatedAt };
}

export async function loadFromCloud(
  projectId: string
): Promise<{ project: Project; geometries: Map<string, Float32Array> }> {
  const sb = getWork3dSupabase();
  if (!sb) throw new Error('Supabase is only available in the browser.');

  const { data, error } = await sb
    .from(WORK3D_TABLE)
    .select('id, name, project, manifest, deleted, updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted) throw new Error('That cloud build was not found.');

  // The row's stamp is the truth; the JSON's updatedAt is whatever the
  // pushing browser had in memory, often older.
  const project = { ...(data.project as Project), updatedAt: asUpdatedAt(data.updated_at) };
  const manifest = (data.manifest as CloudManifest) ?? {};
  const geometries = new Map<string, Float32Array>();
  const ids = Object.keys(manifest);
  await Promise.all(
    ids.map(async (id) => {
      const { data: file, error: fileError } = await sb.storage
        .from(WORK3D_BUCKET)
        .download(geometryPath(projectId, id));
      if (fileError || !file) return;
      const buffer = await file.arrayBuffer();
      geometries.set(id, new Float32Array(buffer));
    })
  );
  return { project: { ...project, id: projectId, name: project.name || (data.name as string) }, geometries };
}

export async function newestCloudProject(): Promise<CloudProjectIndexEntry | null> {
  const list = await listCloudProjects();
  return list[0] ?? null;
}

/** When the cloud copy of one project was last pushed, or null if it is not there. */
export async function cloudProjectStamp(projectId: string): Promise<number | null> {
  const sb = getWork3dSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from(WORK3D_TABLE)
    .select('updated_at, deleted')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted) return null;
  return asUpdatedAt(data.updated_at);
}

/**
 * Soft delete: the row stays (so nothing can resurrect it from a stale
 * computer) but every project list skips it.
 */
export async function deleteFromCloud(projectId: string): Promise<void> {
  const sb = getWork3dSupabase();
  if (!sb) return;
  const { error } = await sb
    .from(WORK3D_TABLE)
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
}

/**
 * Which of these projects were deleted on another computer. A soft-deleted row
 * is invisible to listCloudProjects, so a local copy would otherwise linger as
 * "this computer only" forever.
 */
export async function listCloudDeletedIds(ids: string[]): Promise<string[]> {
  const sb = getWork3dSupabase();
  if (!sb || ids.length === 0) return [];
  const { data, error } = await sb
    .from(WORK3D_TABLE)
    .select('id')
    .in('id', ids)
    .eq('deleted', true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}
