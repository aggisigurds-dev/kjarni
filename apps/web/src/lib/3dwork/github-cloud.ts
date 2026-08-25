/**
 * Browser client for 3dwork ↔ GitHub. Talks to our API, never holds the PAT.
 */

import type { Project } from './project';
import {
  buildManifest,
  geometryUploads,
  projectVersionIds,
  type CloudManifest,
  type CloudProjectIndexEntry,
} from './github-sync';

export interface GithubStatus {
  connected: boolean;
  login: string | null;
  repo: string | null;
  mode: 'user' | 'shared' | null;
  projects?: CloudProjectIndexEntry[];
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!response.ok) {
    throw new Error(data.error || `GitHub sync failed (${response.status})`);
  }
  return data;
}

export async function githubStatus(): Promise<GithubStatus> {
  const response = await fetch('/api/3dwork/github', { cache: 'no-store' });
  return parseJson<GithubStatus>(response);
}

export async function githubConnect(token: string, owner?: string): Promise<GithubStatus> {
  const response = await fetch('/api/3dwork/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, owner: owner || undefined }),
  });
  return parseJson<GithubStatus>(response);
}

export async function githubDisconnect(): Promise<GithubStatus> {
  const response = await fetch('/api/3dwork/github', { method: 'DELETE' });
  return parseJson<GithubStatus>(response);
}

export async function githubListProjects(): Promise<CloudProjectIndexEntry[]> {
  const response = await fetch('/api/3dwork/github/projects', { cache: 'no-store' });
  const data = await parseJson<GithubStatus & { projects?: CloudProjectIndexEntry[] }>(response);
  return data.projects ?? [];
}

export async function githubLoadProject(
  projectId: string
): Promise<{ project: Project; geometries: Map<string, Float32Array> }> {
  const response = await fetch(`/api/3dwork/github/projects/${encodeURIComponent(projectId)}`, {
    cache: 'no-store',
  });
  const data = await parseJson<{ project: Project; manifest: CloudManifest }>(response);
  const geometries = new Map<string, Float32Array>();
  const ids = Object.keys(data.manifest ?? {});
  await Promise.all(
    ids.map(async (id) => {
      const mesh = await fetch(`/api/3dwork/github/geometry/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!mesh.ok) return;
      const buffer = await mesh.arrayBuffer();
      geometries.set(id, new Float32Array(buffer));
    })
  );
  return { project: data.project, geometries };
}

export async function githubSaveProject(
  project: Project,
  geometries: Map<string, Float32Array>
): Promise<{ updatedAt: number }> {
  const previousResponse = await fetch(
    `/api/3dwork/github/projects/${encodeURIComponent(project.id)}`,
    { cache: 'no-store' }
  );
  if (previousResponse.status === 401) {
    throw new Error('GitHub is not connected.');
  }
  let previous: CloudManifest | null = null;
  if (previousResponse.ok) {
    const existing = (await previousResponse.json()) as { manifest?: CloudManifest };
    previous = existing.manifest ?? null;
  }

  const wanted = new Map<string, Float32Array>();
  for (const id of projectVersionIds(project)) {
    const soup = geometries.get(id);
    if (soup) wanted.set(id, soup);
  }
  const manifest = buildManifest(wanted.entries());
  const uploads = geometryUploads(manifest, previous);

  for (const id of uploads) {
    const soup = wanted.get(id);
    if (!soup) continue;
    const response = await fetch(`/api/3dwork/github/geometry/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: soup.slice().buffer,
    });
    if (response.status === 413) continue;
    if (!response.ok) {
      const text = await response.text();
      let message = `Could not upload mesh ${id}`;
      try {
        message = (JSON.parse(text) as { error?: string }).error || message;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
  }

  const saved = await fetch('/api/3dwork/github/projects', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, manifest }),
  });
  const data = await parseJson<{ updatedAt: number }>(saved);
  return { updatedAt: data.updatedAt };
}
