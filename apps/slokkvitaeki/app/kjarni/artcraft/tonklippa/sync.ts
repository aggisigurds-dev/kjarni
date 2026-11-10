/** Samstilling Tónklippu við skýið: tækið er alltaf heimildin sem unnið er á;
 *  hér fer afritið upp (safnið, lögin, myndir, rútínur) og það sem vantar
 *  kemur niður. */

import { KEY_PATTERN, cloudDelete, cloudGetBlob, cloudGetJson, cloudList, cloudPutBlob, cloudPutJson, newLockerKey, projectPath, trackPath } from "./cloud";
import { MAX_CLOUD_BYTES, normalizeDoc, sameDoc, type LibraryDoc, type Media, type Skater } from "./library";
import {
  changeUploaded,
  deleteMediaBlob,
  deleteProject,
  deleteSongBlob,
  forgetDelete,
  isSynced,
  listProjects,
  loadDoc,
  loadMediaBlob,
  loadPhoto,
  loadProject,
  loadSongBlob,
  loadUploaded,
  markSynced,
  mergeIntoDoc,
  pendingDeletes,
  putProject,
  saveMediaBlob,
  savePhoto,
  saveSongBlob,
  type ProjectRecord,
  type TrackMeta,
} from "./store";

/** Það sem liggur í skýinu fyrir hverja rútínu. */
type CloudProject =
  | { id: string; deleted: true; updatedAt: number }
  | {
      id: string;
      deleted?: false;
      name: string;
      updatedAt: number;
      length: number;
      arrangement: ProjectRecord["arrangement"];
      tracks: TrackMeta[];
      skaterId?: string;
      videoId?: string;
      videoOffset?: number;
    };

const KEY_STORAGE = "tonklippa_lykill_v1";
export const KEY_PARAM = "k";

/** Safnið (lög, bútar, iðkendur) er eitt skjal við hlið rútínanna; „x-“ er
 *  frátekið svo það ruglist aldrei saman við auðkenni rútínu. */
const DOC_ID = "x-safn";
const songPath = (songId: string) => trackPath("safn", songId);
const photoPath = (skaterId: string) => trackPath("myndir", skaterId);
const mediaPath = (mediaId: string) => trackPath("midlar", mediaId);

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
  const href = `/coach/manifest.webmanifest?${KEY_PARAM}=${key}`;
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

/** Safnið: skrár sem vantar í skýið fara upp, skjalið er sameinað við það sem
 *  er í skýinu (atriði fyrir atriði), og eydd lög hverfa úr báðum stöðum.
 *  Skilar sameinaða skjalinu. */
export async function syncDoc(key: string): Promise<LibraryDoc> {
  const local = await loadDoc();
  const up = await loadUploaded();
  for (const s of local.songs) {
    const path = songPath(s.id);
    if (up.has(path)) continue;
    const blob = await loadSongBlob(s.id);
    if (!blob) continue;
    await cloudPutBlob(key, path, blob);
    await changeUploaded([path]);
  }
  for (const k of local.skaters) {
    if (!k.photoAt) continue;
    const mark = `${photoPath(k.id)}@${k.photoAt}`;
    if (up.has(mark)) continue;
    const photo = await loadPhoto(k.id);
    if (!photo || photo.at < k.photoAt) continue;
    await cloudPutBlob(key, photoPath(k.id), photo.blob);
    await changeUploaded([mark]);
  }

  for (const m of local.media) {
    const path = mediaPath(m.id);
    if (up.has(path) || m.size > MAX_CLOUD_BYTES) continue;
    const blob = await loadMediaBlob(m.id);
    if (!blob) continue;
    await cloudPutBlob(key, path, blob);
    await changeUploaded([path]);
  }

  const raw = await cloudGetJson<unknown>(key, projectPath(DOC_ID));
  const remote = normalizeDoc(raw);
  const merged = await mergeIntoDoc(remote);
  if (!raw || !sameDoc(merged, remote)) await cloudPutJson(key, projectPath(DOC_ID), merged);

  // Lög sem hefur verið eytt: skráin fer úr tækinu og (ef við vitum af henni) úr skýinu.
  const live = new Set(merged.songs.map((s) => s.id));
  const dead = merged.gone.map((g) => g.id).filter((id) => !live.has(id));
  const drop = dead.map(songPath).filter((p) => up.has(p));
  if (drop.length) {
    await cloudDelete(key, drop);
    await changeUploaded([], drop);
  }
  for (const id of dead) await deleteSongBlob(id).catch(() => undefined);
  // Sama fyrir myndir og myndbönd sem hefur verið eytt.
  const liveMedia = new Set(merged.media.map((m) => m.id));
  const deadMedia = merged.gone.map((g) => g.id).filter((id) => !liveMedia.has(id));
  const dropMedia = deadMedia.map(mediaPath).filter((p) => up.has(p));
  if (dropMedia.length) {
    await cloudDelete(key, dropMedia);
    await changeUploaded([], dropMedia);
  }
  for (const id of deadMedia) await deleteMediaBlob(id).catch(() => undefined);
  return merged;
}

/** Sendir lýsingu einnar rútínu upp (lögin sjálf fara með safninu). */
export async function pushProject(key: string, id: string): Promise<void> {
  const rec = await loadProject(id);
  if (!rec || isSynced(rec)) return;
  const body: CloudProject = {
    id: rec.id,
    name: rec.name,
    updatedAt: rec.updatedAt,
    length: rec.length,
    arrangement: rec.arrangement,
    tracks: rec.tracks.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
    ...(rec.skaterId ? { skaterId: rec.skaterId } : {}),
    ...(rec.videoId ? { videoId: rec.videoId, videoOffset: rec.videoOffset ?? 0 } : {}),
  };
  await cloudPutJson(key, projectPath(rec.id), body);
  await markSynced(rec.id, rec.updatedAt);
}

/** Eyðir rútínu úr skýinu; eftir stendur merki um eyðinguna svo önnur tæki
 *  fjarlægi hana líka. */
async function pushDelete(key: string, id: string, at: number): Promise<void> {
  await cloudPutJson(key, projectPath(id), { id, deleted: true, updatedAt: at } satisfies CloudProject);
  await forgetDelete(id);
}

/** Full samstilling: safnið, eyðingar upp, nýrri útgáfur niður, óvistað upp. */
export async function syncAll(key: string): Promise<LibraryDoc> {
  const doc = await syncDoc(key);
  for (const d of await pendingDeletes()) await pushDelete(key, d.id, d.at);
  const local = new Map((await listProjects()).map((r) => [r.id, r]));
  for (const entry of await cloudList(key, "p")) {
    const id = entry.name.replace(/\.json$/, "");
    if (id.startsWith("x-")) continue;
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
        tracks: remote.tracks.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
        ...(remote.skaterId ? { skaterId: remote.skaterId } : {}),
        ...(remote.videoId ? { videoId: remote.videoId, videoOffset: remote.videoOffset ?? 0 } : {}),
        syncedAt: remote.updatedAt,
      });
    }
  }
  for (const rec of await listProjects()) if (!isSynced(rec)) await pushProject(key, rec.id);
  return doc;
}

/** Lagaskrá: úr tækinu, annars sótt úr skýinu og geymd í tækinu. */
export async function fetchSongBlob(key: string | null, songId: string): Promise<Blob | null> {
  const local = await loadSongBlob(songId).catch(() => undefined);
  if (local) return local;
  if (!key) return null;
  const remote = await cloudGetBlob(key, songPath(songId));
  if (remote) {
    await saveSongBlob(songId, remote).catch(() => undefined);
    await changeUploaded([songPath(songId)]).catch(() => undefined);
  }
  return remote;
}

/** Mynd eða myndband: úr tækinu, annars sótt úr skýinu (ef það komst þangað) og geymt í tækinu. */
export async function fetchMediaBlob(key: string | null, media: Media): Promise<Blob | null> {
  const local = await loadMediaBlob(media.id).catch(() => undefined);
  if (local) return local;
  if (!key || media.size > MAX_CLOUD_BYTES) return null;
  const remote = await cloudGetBlob(key, mediaPath(media.id));
  if (!remote) return null;
  const blob = new Blob([remote], { type: media.type || remote.type });
  await saveMediaBlob(media.id, blob).catch(() => undefined);
  await changeUploaded([mediaPath(media.id)]).catch(() => undefined);
  return blob;
}

/** Prófílmynd iðkanda: úr tækinu ef hún er ný, annars úr skýinu. */
export async function fetchPhoto(key: string | null, skater: Skater): Promise<Blob | null> {
  if (!skater.photoAt) return null;
  const local = await loadPhoto(skater.id).catch(() => undefined);
  if (local && local.at >= skater.photoAt) return local.blob;
  if (!key) return local?.blob ?? null;
  const remote = await cloudGetBlob(key, photoPath(skater.id)).catch(() => null);
  if (!remote) return local?.blob ?? null;
  const photo = new Blob([remote], { type: "image/jpeg" });
  await savePhoto(skater.id, photo, skater.photoAt).catch(() => undefined);
  await changeUploaded([`${photoPath(skater.id)}@${skater.photoAt}`]).catch(() => undefined);
  return photo;
}

export type SyncState = "synced" | "syncing" | "offline";

/** Heldur skýinu í takt á meðan unnið er: `touch` eftir hverja vistun,
 *  sent upp skömmu síðar; reynt aftur ef netið vantar. */
export class CloudSync {
  private dirty = new Set<string>();
  private docDirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  state: SyncState = "synced";

  constructor(
    private readonly key: string,
    private readonly onState: (state: SyncState) => void,
    private readonly onDoc: (doc: LibraryDoc) => void,
  ) {}

  private set(state: SyncState) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }

  /** Rútínu var breytt. */
  touch(projectId: string, delay = 2500): void {
    if (this.stopped) return;
    this.dirty.add(projectId);
    this.set("syncing");
    this.schedule(delay);
  }

  /** Safninu (lögum, bútum, iðkendum) var breytt. */
  touchDoc(delay = 1500): void {
    if (this.stopped) return;
    this.docDirty = true;
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
      while (this.docDirty || this.dirty.size) {
        if (this.docDirty) {
          this.docDirty = false;
          try {
            this.onDoc(await syncDoc(this.key));
          } catch (err) {
            this.docDirty = true;
            throw err;
          }
          continue;
        }
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
