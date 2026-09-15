/**
 * The favourites shelf: parts kept on Supabase outside any build, so a part
 * saved from one build can be dropped into another, on any computer.
 *
 * The shelf is one row of the projects table, `prj_favorites`, holding a
 * project document whose parts are the favourites — no table of its own, the
 * same geometry bucket, the same manifest of fingerprints. Unlike a build it
 * keeps each part's thumbnail in the document, because a favourite is looked
 * at far more often than it is loaded. A favourite taken off the shelf is only
 * hidden, so a slip loses nothing.
 */

import { buildManifest, type CloudManifest } from './github-sync';
import { createProject, identityTransform, type Part, type Project } from './project';
import {
  FAVORITES_ID,
  getWork3dSupabase,
  loadCloudGeometry,
  WORK3D_BUCKET,
  WORK3D_TABLE,
} from './supabase-sync';

export const FAVORITES_NAME = '★ Favorites';

/** A shelf card: what the gallery shows, and enough to put the part on a bench. */
export interface Favorite {
  id: string;
  name: string;
  color: string;
  triangles: number;
  thumbnail?: string;
  versionId: string;
  materialId: string;
  finishId?: string;
  addedAt: number;
}

/** What a part brings to the shelf, besides its mesh. */
export interface FavoriteCard {
  name: string;
  color: string;
  materialId: string;
  finishId?: string;
  thumbnail?: string;
}

/** The table keeps a document under 1 MB; the shelf refuses a card past this. */
const SHELF_LIMIT = 1_000_000;

/** Ids of the shape the bucket policy allows: `ver_<base36>`. */
const shelfId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function emptyShelf(): Project {
  return { ...createProject(FAVORITES_NAME, FAVORITES_ID), assembly: false };
}

/** The shelf's part for a card and its mesh, in the part's own coordinates. */
export function shelfPart(card: FavoriteCard, soup: Float32Array, now = Date.now()): Part {
  const triangles = Math.floor(soup.length / 9);
  const versionId = shelfId('ver');
  return {
    id: shelfId('part'),
    name: card.name,
    fileName: '',
    slotId: '',
    color: card.color,
    finishId: card.finishId,
    visible: true,
    transform: identityTransform(),
    triangles,
    materialId: card.materialId,
    notes: '',
    versions: [
      { id: versionId, label: 'v1 favorite', note: 'Saved to favorites', triangles, createdAt: now },
    ],
    activeVersionId: versionId,
    thumbnail: card.thumbnail,
    addedAt: now,
  };
}

/** The cards on the shelf, newest first; one taken off the shelf is skipped. */
export function favoritesOf(shelf: Project): Favorite[] {
  return shelf.parts
    .filter((part) => part.visible)
    .map((part) => ({
      id: part.id,
      name: part.name,
      color: part.color,
      triangles: part.triangles,
      thumbnail: part.thumbnail,
      versionId: part.activeVersionId,
      materialId: part.materialId,
      finishId: part.finishId,
      addedAt: part.addedAt,
    }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

function client() {
  const sb = getWork3dSupabase();
  if (!sb) throw new Error('Favorites are only available in the browser.');
  return sb;
}

async function fetchShelf(): Promise<{ shelf: Project; manifest: CloudManifest }> {
  const { data, error } = await client()
    .from(WORK3D_TABLE)
    .select('project, manifest')
    .eq('id', FAVORITES_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const shelf = data
    ? { ...emptyShelf(), ...(data.project as Project), id: FAVORITES_ID, name: FAVORITES_NAME }
    : emptyShelf();
  return { shelf, manifest: (data?.manifest as CloudManifest | null) ?? {} };
}

async function storeShelf(shelf: Project, manifest: CloudManifest): Promise<void> {
  const document = { ...shelf, updatedAt: Date.now() };
  if (JSON.stringify(document).length > SHELF_LIMIT) {
    throw new Error('The favorites shelf is full — take a few favorites off it first.');
  }
  const { error } = await client()
    .from(WORK3D_TABLE)
    .upsert({
      id: FAVORITES_ID,
      name: FAVORITES_NAME,
      project: document,
      manifest,
      part_count: shelf.parts.filter((part) => part.visible).length,
      deleted: false,
      updated_at: new Date(document.updatedAt).toISOString(),
    });
  if (error) throw new Error(error.message);
}

export async function listFavorites(): Promise<Favorite[]> {
  const { shelf } = await fetchShelf();
  return favoritesOf(shelf);
}

/** Put a part on the shelf: its mesh into the bucket, its card into the document. */
export async function addFavorite(card: FavoriteCard, soup: Float32Array): Promise<Favorite> {
  const { shelf, manifest } = await fetchShelf();
  const part = shelfPart(card, soup);
  const { error } = await client()
    .storage.from(WORK3D_BUCKET)
    .upload(`${FAVORITES_ID}/${part.activeVersionId}.bin`, soup.slice().buffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    });
  if (error) throw new Error(error.message);
  await storeShelf(
    { ...shelf, parts: [...shelf.parts, part] },
    { ...manifest, ...buildManifest([[part.activeVersionId, soup]]) }
  );
  return favoritesOf({ ...shelf, parts: [part] })[0];
}

/** Take a favourite off the shelf. It is hidden, not erased, so a slip loses nothing. */
export async function removeFavorite(id: string): Promise<void> {
  const { shelf, manifest } = await fetchShelf();
  await storeShelf(
    {
      ...shelf,
      parts: shelf.parts.map((part) => (part.id === id ? { ...part, visible: false } : part)),
    },
    manifest
  );
}

/** The mesh of a favourite, from the bucket; null when the bucket has no such file. */
export function loadFavoriteGeometry(versionId: string): Promise<Float32Array | null> {
  return loadCloudGeometry(FAVORITES_ID, versionId);
}
