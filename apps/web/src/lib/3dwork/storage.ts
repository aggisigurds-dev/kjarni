/**
 * Browser-local persistence.
 *
 * Everything here stays on the machine: project metadata and the raw triangle
 * data both live in IndexedDB, which handles multi-megabyte meshes that would
 * blow the localStorage quota. Every call degrades to a no-op when IndexedDB is
 * unavailable, so the bench still works in-memory.
 */

import type { Project } from './project';

const DB_NAME = 'kjarni-3dwork';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const GEOMETRY = 'geometry';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(GEOMETRY)) db.createObjectStore(GEOMETRY);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
  });

  // A failed open must not be cached, or every later call inherits the failure.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = action(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      })
  );
}

export async function saveProject(project: Project): Promise<void> {
  try {
    await run(PROJECTS, 'readwrite', (store) => store.put({ ...project, updatedAt: Date.now() }));
  } catch {
    // Storage is a convenience here, never a precondition for editing.
  }
}

export async function listProjects(): Promise<Project[]> {
  try {
    const projects = await run<Project[]>(PROJECTS, 'readonly', (store) => store.getAll());
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await run(PROJECTS, 'readwrite', (store) => store.delete(id));
  } catch {
    /* ignore */
  }
}

export async function saveGeometry(partId: string, soup: Float32Array): Promise<void> {
  try {
    // Copy into a standalone buffer: a view into a larger buffer would store
    // the whole thing.
    await run(GEOMETRY, 'readwrite', (store) => store.put(soup.slice(), partId));
  } catch {
    /* ignore */
  }
}

export async function loadGeometry(partId: string): Promise<Float32Array | null> {
  try {
    const stored = await run<Float32Array | undefined>(GEOMETRY, 'readonly', (store) =>
      store.get(partId)
    );
    return stored ? new Float32Array(stored) : null;
  } catch {
    return null;
  }
}

export async function deleteGeometry(partId: string): Promise<void> {
  try {
    await run(GEOMETRY, 'readwrite', (store) => store.delete(partId));
  } catch {
    /* ignore */
  }
}
