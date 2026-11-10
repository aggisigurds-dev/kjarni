/** Samstilling Tónklippu við skýið: tækið er alltaf heimildin sem unnið er á;
 *  hér fer afritið upp (rútínur + lög) og það sem vantar kemur niður. */

import { KEY_PATTERN, cloudDelete, cloudGetBlob, cloudGetJson, cloudList, cloudPutBlob, cloudPutJson, newLockerKey, projectPath, trackPath } from "./cloud";
import {
  deleteProject,
  forgetDelete,
  isSynced,
  listProjects,
  loadProject,
  loadTrackBlob,
  markSynced,
  pendingDeletes,
  putProject,
  saveTrackBlob,
  type ProjectRecord,
  type TrackMeta,
} from "./store";

/** Það sem liggur í skýinu fyrir hverja rútínu. */
type CloudProject =
  | { id: string; deleted: true; updatedAt: number }
  | { id: string; deleted?: false; name: string; updatedAt: number; length: number; arrangement: ProjectRecord["arrangement"]; tracks: TrackMeta[] };

const KEY_STORAGE = "tonklippa_lykill_v1";
export const KEY_PARAM = "k";

/** Lykill skúffunnar: úr slóðinni (?k=…), annars úr tækinu, annars nýr.
 *  Lykillinn er hafður í slóðinni svo „Setja á heimaskjá“ á iPhone taki hann
 *  með — uppsett app og Safari deila ekki geymslu, en fá þá sömu skúffu. */
export function resolveLockerKey(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(KEY_PARAM);
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY_STORAGE);
  } catch {
    /* einkagluggi */
  }
  const key = fromUrl && KEY_PATTERN.test(fromUrl) ? fromUrl : stored && KEY_PATTERN.test(stored) ? stored : newLockerKey();
  try {
    window.localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* einkagluggi */
  }
  if (fromUrl !== key) {
    url.searchParams.set(KEY_PARAM, key);
    window.history.replaceState(window.history.state, "", url);
  }
  applyManifestKey(key);
  return key;
}

/** Lætur manifest-tengilinn bera lykilinn, svo „Setja á heimaskjá“ taki hann
 *  með. Next getur sett tengilinn inn (eða endurnýjað hann) eftir fyrstu
 *  teikningu, svo þetta er endurtekið nokkrum sinnum eftir ræsingu. */
export function applyManifestKey(key: string): void {
  const href = `/tonklippa/manifest.webmanifest?${KEY_PARAM}=${key}`;
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]');
  if (!links.length) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((link) => {
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  });
}

/** Sendir eina rútínu upp: lög sem vantar í skýið og svo lýsinguna. */
export async function pushProject(key: string, id: string): Promise<void> {
  const rec = await loadProject(id);
  if (!rec || isSynced(rec)) return;
  const uploaded: string[] = [];
  const tracks: TrackMeta[] = [];
  for (const t of rec.tracks) {
    if (!t.cloud) {
      const blob = await loadTrackBlob(rec.id, t.id);
      if (blob) {
        await cloudPutBlob(key, trackPath(rec.id, t.id), blob);
        uploaded.push(t.id);
      }
    }
    tracks.push({ id: t.id, name: t.name, duration: t.duration });
  }
  const body: CloudProject = { id: rec.id, name: rec.name, updatedAt: rec.updatedAt, length: rec.length, arrangement: rec.arrangement, tracks };
  await cloudPutJson(key, projectPath(rec.id), body);
  await markSynced(rec.id, rec.updatedAt, uploaded);
}

/** Eyðir rútínu úr skýinu: lögin fara, og eftir stendur merki um eyðinguna
 *  svo önnur tæki fjarlægi hana líka. */
async function pushDelete(key: string, id: string, at: number): Promise<void> {
  const files = await cloudList(key, `t/${id}`);
  await cloudDelete(key, files.map((f) => trackPath(id, f.name)));
  await cloudPutJson(key, projectPath(id), { id, deleted: true, updatedAt: at } satisfies CloudProject);
  await forgetDelete(id);
}

/** Full samstilling: eyðingar upp, nýrri útgáfur niður, óvistað upp. */
export async function syncAll(key: string): Promise<void> {
  for (const d of await pendingDeletes()) await pushDelete(key, d.id, d.at);
  const local = new Map((await listProjects()).map((r) => [r.id, r]));
  for (const entry of await cloudList(key, "p")) {
    const id = entry.name.replace(/\.json$/, "");
    const mine = local.get(id);
    // Sama útgáfa og síðast var send eða sótt: óþarfi að sækja lýsinguna aftur.
    if (mine?.syncedAt && entry.updatedAt && Math.abs(entry.updatedAt - mine.syncedAt) < 120_000 && isSynced(mine)) continue;
    const remote = await cloudGetJson<CloudProject>(key, projectPath(id));
    if (!remote) continue;
    if (remote.deleted) {
      if (mine && mine.updatedAt <= remote.updatedAt) await deleteProject(id);
      continue;
    }
    if (!mine || remote.updatedAt > mine.updatedAt) {
      await putProject({
        id,
        name: remote.name,
        updatedAt: remote.updatedAt,
        length: remote.length,
        arrangement: remote.arrangement,
        tracks: remote.tracks.map((t) => ({ id: t.id, name: t.name, duration: t.duration, cloud: true })),
        syncedAt: remote.updatedAt,
      });
    }
  }
  for (const rec of await listProjects()) if (!isSynced(rec)) await pushProject(key, rec.id);
}

/** Lagaskrá rútínu: úr tækinu, annars sótt úr skýinu og geymd í tækinu. */
export async function fetchTrackBlob(key: string | null, projectId: string, trackId: string): Promise<Blob | null> {
  const local = await loadTrackBlob(projectId, trackId).catch(() => undefined);
  if (local) return local;
  if (!key) return null;
  const remote = await cloudGetBlob(key, trackPath(projectId, trackId));
  if (remote) await saveTrackBlob(projectId, trackId, remote).catch(() => undefined);
  return remote;
}

export type SyncState = "synced" | "syncing" | "offline";

/** Heldur skýinu í takt á meðan unnið er: `touch` eftir hverja vistun,
 *  sent upp skömmu síðar; reynt aftur ef netið vantar. */
export class CloudSync {
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  state: SyncState = "synced";

  constructor(
    private readonly key: string,
    private readonly onState: (state: SyncState) => void,
  ) {}

  private set(state: SyncState) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }

  touch(projectId: string, delay = 2500): void {
    if (this.stopped) return;
    this.dirty.add(projectId);
    this.set("syncing");
    this.schedule(delay);
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Sendir allt sem bíður núna (t.d. þegar ritlinum er lokað eða netið kemur aftur). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.dirty.size) {
        const id = this.dirty.values().next().value as string;
        this.dirty.delete(id);
        try {
          await pushProject(this.key, id);
        } catch (err) {
          this.dirty.add(id);
          throw err;
        }
      }
      this.set("synced");
    } catch {
      this.set("offline");
      if (!this.stopped) this.schedule(20_000);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
