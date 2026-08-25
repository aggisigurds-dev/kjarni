/**
 * Server-side GitHub access for 3dwork cloud saves.
 *
 * Token comes from a cookie (user pasted a PAT) or from GITHUB_3DWORK_TOKEN
 * so a Vercel env var can make every browser share one private repo.
 */

import { cookies } from 'next/headers';
import type { CloudManifest, CloudProjectIndexEntry } from './github-sync';

const COOKIE = 'kjarni_3dwork_gh';
const API = 'https://api.github.com';
const DEFAULT_REPO = '3dwork-bench';
const ACCEPT = 'application/vnd.github+json';
const API_VERSION = '2022-11-28';

export interface GithubConnection {
  token: string;
  owner: string;
  repo: string;
  login: string;
  mode: 'user' | 'shared';
}

interface CookiePayload {
  token: string;
  owner: string;
  repo: string;
  login: string;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: ACCEPT,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'kjarni-3dwork',
  };
}

async function gh<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(token), ...init.headers },
    cache: 'no-store',
  });
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data, text };
}

export async function readConnection(): Promise<GithubConnection | null> {
  const envToken = process.env.GITHUB_3DWORK_TOKEN?.trim();
  const envRepo = process.env.GITHUB_3DWORK_REPO?.trim();

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CookiePayload;
      if (parsed.token && parsed.owner && parsed.repo) {
        return {
          token: parsed.token,
          owner: parsed.owner,
          repo: parsed.repo,
          login: parsed.login || parsed.owner,
          mode: 'user',
        };
      }
    } catch {
      /* ignore malformed cookie */
    }
  }

  if (!envToken) return null;
  const [owner, repo] = (envRepo || `placeholder/${DEFAULT_REPO}`).split('/');
  if (envRepo && owner && repo) {
    return { token: envToken, owner, repo, login: owner, mode: 'shared' };
  }

  const me = await gh<{ login: string }>(envToken, '/user');
  if (!me.ok || !me.data?.login) return null;
  return {
    token: envToken,
    owner: me.data.login,
    repo: DEFAULT_REPO,
    login: me.data.login,
    mode: 'shared',
  };
}

export function connectionCookie(payload: CookiePayload): {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
  };
} {
  return {
    name: COOKIE,
    value: JSON.stringify(payload),
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    },
  };
}

export async function clearUserConnection(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function connectWithToken(
  token: string,
  ownerHint?: string
): Promise<GithubConnection> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a GitHub token.');

  const me = await gh<{ login: string }>(trimmed, '/user');
  const owner = (me.ok && me.data?.login) || ownerHint?.trim() || '';
  if (!owner) {
    throw new Error(
      'GitHub would not return your username. Type it in the Owner field and try again.'
    );
  }

  const repo = DEFAULT_REPO;
  const created = await gh<{ message?: string }>(trimmed, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repo,
      private: true,
      auto_init: true,
      description: 'kjarni 3dwork cloud saves — the bench on every computer',
    }),
  });
  if (!created.ok && created.status !== 422) {
    const probe = await gh(trimmed, `/repos/${owner}/${repo}`);
    if (!probe.ok) {
      throw new Error(
        `Could not create ${owner}/${repo}. Create that private repo, then connect again.`
      );
    }
  }

  return { token: trimmed, owner, repo, login: owner, mode: 'user' };
}

interface ContentFile {
  sha: string;
  content?: string;
  encoding?: string;
  size?: number;
}

async function getFile(
  connection: GithubConnection,
  path: string
): Promise<{ sha: string; bytes: Uint8Array } | null> {
  const result = await gh<ContentFile>(
    connection.token,
    `/repos/${connection.owner}/${connection.repo}/contents/${path}`
  );
  if (result.status === 404 || !result.ok || !result.data) return null;

  if (result.data.encoding === 'base64' && result.data.content) {
    return {
      sha: result.data.sha,
      bytes: Uint8Array.from(Buffer.from(result.data.content.replace(/\n/g, ''), 'base64')),
    };
  }

  const blob = await gh<{ content?: string; encoding?: string }>(
    connection.token,
    `/repos/${connection.owner}/${connection.repo}/git/blobs/${result.data.sha}`
  );
  if (!blob.ok || blob.data?.encoding !== 'base64' || !blob.data.content) {
    return { sha: result.data.sha, bytes: new Uint8Array() };
  }
  return {
    sha: result.data.sha,
    bytes: Uint8Array.from(Buffer.from(blob.data.content.replace(/\n/g, ''), 'base64')),
  };
}

async function putFile(
  connection: GithubConnection,
  path: string,
  bytes: Uint8Array,
  message: string
): Promise<void> {
  const existing = await getFile(connection, path);
  const body: { message: string; content: string; sha?: string } = {
    message,
    content: Buffer.from(bytes).toString('base64'),
  };
  if (existing) body.sha = existing.sha;
  const result = await gh(
    connection.token,
    `/repos/${connection.owner}/${connection.repo}/contents/${path}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  if (!result.ok) {
    throw new Error(result.text.slice(0, 240) || `GitHub write failed (${result.status})`);
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function decodeJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export async function readIndex(
  connection: GithubConnection
): Promise<CloudProjectIndexEntry[]> {
  const file = await getFile(connection, 'index.json');
  if (!file) return [];
  const parsed = decodeJson<CloudProjectIndexEntry[]>(file.bytes);
  return Array.isArray(parsed) ? parsed : [];
}

export async function writeIndex(
  connection: GithubConnection,
  index: CloudProjectIndexEntry[]
): Promise<void> {
  await putFile(connection, 'index.json', encodeJson(index), '3dwork: update project list');
}

export async function readProject(
  connection: GithubConnection,
  projectId: string
): Promise<unknown | null> {
  const file = await getFile(connection, `projects/${projectId}.json`);
  return file ? decodeJson(file.bytes) : null;
}

export async function writeProject(
  connection: GithubConnection,
  projectId: string,
  project: unknown
): Promise<void> {
  await putFile(
    connection,
    `projects/${projectId}.json`,
    encodeJson(project),
    `3dwork: save ${projectId}`
  );
}

export async function readManifest(
  connection: GithubConnection,
  projectId: string
): Promise<CloudManifest | null> {
  const file = await getFile(connection, `projects/${projectId}.manifest.json`);
  return file ? decodeJson<CloudManifest>(file.bytes) : null;
}

export async function writeManifest(
  connection: GithubConnection,
  projectId: string,
  manifest: CloudManifest
): Promise<void> {
  await putFile(
    connection,
    `projects/${projectId}.manifest.json`,
    encodeJson(manifest),
    `3dwork: manifest ${projectId}`
  );
}

export async function readGeometry(
  connection: GithubConnection,
  versionId: string
): Promise<Float32Array | null> {
  const file = await getFile(connection, `geometry/${versionId}.f32`);
  if (!file || file.bytes.byteLength < 4) return null;
  const aligned = file.bytes.byteOffset % 4 === 0 ? file.bytes : file.bytes.slice();
  return new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4);
}

export async function writeGeometry(
  connection: GithubConnection,
  versionId: string,
  soup: Float32Array
): Promise<void> {
  const bytes = new Uint8Array(soup.buffer, soup.byteOffset, soup.byteLength);
  await putFile(
    connection,
    `geometry/${versionId}.f32`,
    bytes,
    `3dwork: mesh ${versionId}`
  );
}

export function publicStatus(connection: GithubConnection | null): {
  connected: boolean;
  login: string | null;
  repo: string | null;
  mode: 'user' | 'shared' | null;
} {
  if (!connection) return { connected: false, login: null, repo: null, mode: null };
  return {
    connected: true,
    login: connection.login,
    repo: `${connection.owner}/${connection.repo}`,
    mode: connection.mode,
  };
}
