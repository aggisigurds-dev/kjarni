"use client";

/** THE COACH — þjálfaraappið (á /coach, má setja á heimaskjá): forsíða,
 *  skipulag (dagatal og verkefni), iðkendur, rútínur og safn, og Tónklippu-
 *  ritillinn ofan á. Unnið er í tækinu
 *  (virkar án nets) og allt afritast í skýið í lokaða skúffu sem lykill
 *  tækisins opnar. */

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Cloud, CloudOff, Download, Ellipsis, Film, Flag, House, Library, Link2, ListMusic, LoaderCircle, Music, Plus, RefreshCw, Scissors, Share, Trash2, Users, X } from "lucide-react";
import { emptyArrangement, formatTime, normalizeArrangement, type Arrangement, type Marker, type Part } from "./arrange";
import { ymd } from "./calendar";
import { confidentCover, searchCovers } from "./covers";
import { EventSheet, HomeTab, PlanTab, blankEvent } from "./Coach";
import {
  MAX_CLOUD_BYTES,
  clearDone,
  emptyDoc,
  mergeDocs,
  patchSong,
  putClip,
  putEvent,
  putMedia,
  putSkater,
  putSong,
  putTodo,
  removeClip,
  removeEvent,
  removeMedia,
  removeSkater,
  removeSong,
  removeTodo,
  type Clip,
  type CoachEvent,
  type LibraryDoc,
  type Media,
  type Skater,
  type Song,
} from "./library";
import { bestMatches } from "./match";
import { fitPhoto } from "./Media";
import { Avatar, SongPicker } from "./Parts";
import {
  deleteMediaBlob,
  deletePhoto,
  deleteProject,
  deleteSongBlob,
  isSynced,
  listProjects,
  loadDoc,
  mergeIntoDoc,
  saveMediaBlob,
  saveProject,
  savePhoto,
  saveSongBlob,
  type ProjectRecord,
} from "./store";
import { CloudSync, KEY_PARAM, applyManifestKey, fetchMediaBlob, fetchPhoto, fetchSongBlob, resolveLockerKey, syncAll, type SyncState } from "./sync";
import { LibraryTab, SkaterSheet, SkatersTab, blankSkater, fitsFor, squarePhoto } from "./Tabs";
import { buildTrackView, newId, songSummary, trackNameFromFile, type TrackView } from "./tracks";
import TonklippaEditor, { AUDIO_ACCEPT, VIDEO_ACCEPT } from "./TonklippaEditor";
import "./tonklippa.css";

type Open = { id: string; name: string; arr: Arrangement; tracks: TrackView[]; skaterId?: string; videoId?: string; videoOffset?: number; key: number };
type Tab = "heim" | "skipulag" | "idkendur" | "rutinur" | "safn";
/** Hvað á að gera við skrárnar sem verða valdar næst. */
type Intent = { kind: "routine"; skaterId?: string } | { kind: "library" } | { kind: "resolve"; done: (song: Song | null) => void };

const HINT_KEY = "tonklippa_heimaskjar_falid";
const CACHE_MAX = 4;

/** Litur rútínukortsins, fastur fyrir hvert auðkenni. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export default function TonklippaApp() {
  const audioInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const intent = useRef<Intent>({ kind: "routine" });
  const keyRef = useRef<string | null>(null);
  const syncRef = useRef<CloudSync | null>(null);
  const pulling = useRef(false);
  const pullAgain = useRef(false);
  const toastTimer = useRef(0);
  const docRef = useRef<LibraryDoc>(emptyDoc());
  const cache = useRef(new Map<string, TrackView>());
  const photoAt = useRef<Record<string, number>>({});
  const player = useRef<HTMLAudioElement | null>(null);
  const playerUrl = useRef("");
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [doc, setDoc] = useState<LibraryDoc>(docRef.current);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Open | null>(null);
  const [tab, setTab] = useState<Tab>("heim");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [menu, setMenu] = useState(false);
  const [installHint, setInstallHint] = useState(false);
  const [filter, setFilter] = useState<"all" | "fav">("all");
  const [playing, setPlaying] = useState("");
  const [newFor, setNewFor] = useState<{ skaterId?: string } | null>(null);
  const [skaterOpen, setSkaterOpen] = useState<{ id: string; isNew: boolean; draft: Skater } | null>(null);
  const [eventOpen, setEventOpen] = useState<{ event: CoachEvent; isNew: boolean } | null>(null);

  const say = useCallback((text: string, ms = 3500) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), ms);
  }, []);

  const refresh = useCallback(
    () =>
      listProjects().then(
        (list) => setProjects(list),
        () => setProjects([]),
      ),
    [],
  );

  // ------------------------------------------------------------------ safnið

  /** Tekur við útgáfu safnsins úr tækinu eða skýinu (sameinað við það sem er á skjánum). */
  const adoptDoc = useCallback((incoming: LibraryDoc) => {
    const merged = mergeDocs(docRef.current, incoming);
    docRef.current = merged;
    setDoc(merged);
  }, []);

  /** Breytir safninu: strax á skjánum, svo í tækið og þaðan í skýið. */
  const updateDoc = useCallback((fn: (d: LibraryDoc) => LibraryDoc) => {
    const next = fn(docRef.current);
    if (next === docRef.current) return;
    docRef.current = next;
    setDoc(next);
    void mergeIntoDoc(next).then(
      () => syncRef.current?.touchDoc(),
      () => undefined,
    );
  }, []);

  const remember = (tv: TrackView) => {
    cache.current.delete(tv.id);
    cache.current.set(tv.id, tv);
    while (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value as string);
  };

  /** Lag úr safninu, afkóðað og greint (geymt í minni á meðan appið er opið). */
  const openSong = useCallback(
    async (songId: string): Promise<TrackView> => {
      const hit = cache.current.get(songId);
      if (hit) {
        remember(hit);
        return hit;
      }
      const song = docRef.current.songs.find((s) => s.id === songId);
      const blob = await fetchSongBlob(keyRef.current, songId);
      if (!blob) throw new Error(navigator.onLine ? "Lagið fannst hvorki í tækinu né í skýinu" : "Lagið er í skýinu — tengstu netinu til að sækja það");
      const tv = await buildTrackView(songId, song?.name ?? "Lag", blob);
      remember(tv);
      if (song && (!song.wave?.length || !song.highlights)) updateDoc((d) => patchSong(d, songId, songSummary(tv), Date.now()));
      return tv;
    },
    [updateDoc],
  );

  /** Ný skrá úr símanum: fer í safnið (nema sama lag sé þar fyrir). */
  const importSong = useCallback(
    async (file: File): Promise<TrackView> => {
      const name = trackNameFromFile(file.name);
      const fresh = await buildTrackView(newId(), name, file);
      const same = docRef.current.songs.find((s) => s.name === name && Math.abs(s.duration - fresh.duration) < 0.15);
      if (same) {
        const tv = { ...fresh, id: same.id };
        remember(tv);
        return tv;
      }
      await saveSongBlob(fresh.id, file).catch(() => say("Gat ekki geymt lagið í tækinu — það virkar samt núna", 5000));
      updateDoc((d) => putSong(d, { id: fresh.id, name, at: Date.now(), ...songSummary(fresh) }));
      remember(fresh);
      // Umslag fundið sjálfkrafa — aðeins sett ef heitið passar örugglega.
      void searchCovers(name).then((hits) => {
        const hit = confidentCover(name, hits);
        if (hit) updateDoc((d) => (d.songs.find((s) => s.id === fresh.id && !s.art && !s.cover) ? patchSong(d, fresh.id, { art: hit.art }, Date.now()) : d));
      });
      return fresh;
    },
    [say, updateDoc],
  );

  // ------------------------------------------------------------------ ský

  /** Sækir og sendir allt sem vantar á milli tækis og skýs. */
  const pull = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    if (pulling.current) {
      // Þegar í gangi: taka aðra umferð á eftir, svo ný breyting (t.d. eyðing) fari líka.
      pullAgain.current = true;
      return;
    }
    pulling.current = true;
    setSyncState("syncing");
    try {
      do {
        pullAgain.current = false;
        adoptDoc(await syncAll(key));
      } while (pullAgain.current);
      setSyncState("synced");
    } catch {
      setSyncState("offline");
    } finally {
      pulling.current = false;
      void refresh();
    }
  }, [adoptDoc, refresh]);

  useEffect(() => {
    let key: string | null = null;
    try {
      key = resolveLockerKey();
    } catch {
      key = null;
    }
    keyRef.current = key;
    const sync = key ? new CloudSync(key, setSyncState, adoptDoc) : null;
    syncRef.current = sync;
    void loadDoc()
      .then(adoptDoc, () => undefined)
      .then(refresh)
      .then(() => (key ? pull() : setSyncState("offline")));

    // Þjónustuþráðurinn lætur appið opnast án nets; MP3-kóðarinn er sóttur
    // fyrir fram svo útflutningur virki líka þá.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/coach-sw.js", { scope: "/coach" }).catch(() => undefined);
    }
    const warm = window.setTimeout(() => void import("./mp3wasm").catch(() => undefined), 5000);
    const relink = [300, 1500, 5000].map((ms) => window.setTimeout(() => key && applyManifestKey(key), ms));

    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    let hidden = false;
    try {
      hidden = window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      /* einkagluggi */
    }
    setInstallHint(ios && !standalone && !hidden);

    const online = () => {
      void sync?.flush();
      void pull();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    const audio = player;
    return () => {
      window.clearTimeout(warm);
      relink.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(toastTimer.current);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      sync?.stop();
      audio.current?.pause();
    };
  }, [adoptDoc, pull, refresh]);

  // Þegar skýið hefur náð í skottið á okkur: sýna það á kortunum.
  useEffect(() => {
    if (syncState === "synced") void refresh();
  }, [syncState, refresh]);

  // Prófílmyndir: úr tækinu, annars úr skýinu.
  useEffect(() => {
    for (const k of doc.skaters) {
      if (!k.photoAt || photoAt.current[k.id] === k.photoAt) continue;
      photoAt.current[k.id] = k.photoAt;
      void fetchPhoto(keyRef.current, k).then((blob) => {
        if (blob) setPhotos((p) => ({ ...p, [k.id]: URL.createObjectURL(blob) }));
      });
    }
  }, [doc.skaters]);

  // ------------------------------------------------------------------ hlustun í listum

  function stopPreview() {
    player.current?.pause();
    setPlaying("");
  }

  /** Spilar lag (eða bút) beint úr skránni; `seek` hoppar þótt sama lag sé í gangi. */
  async function preview(id: string, songId: string, from = 0, to?: number, seek = false) {
    const a = player.current ?? (player.current = new Audio());
    if (playing === id && !seek) {
      stopPreview();
      return;
    }
    a.pause();
    const blob = await fetchSongBlob(keyRef.current, songId).catch(() => null);
    if (!blob) {
      say(navigator.onLine ? "Lagið fannst ekki" : "Lagið er í skýinu — tengstu netinu");
      return;
    }
    if (playerUrl.current) URL.revokeObjectURL(playerUrl.current);
    playerUrl.current = URL.createObjectURL(blob);
    a.src = playerUrl.current;
    a.ontimeupdate = () => {
      if (to != null && a.currentTime >= to) stopPreview();
    };
    a.onended = () => setPlaying("");
    a.onloadedmetadata = () => {
      a.currentTime = from;
    };
    setPlaying(id);
    try {
      await a.play();
    } catch {
      setPlaying("");
    }
  }

  // ------------------------------------------------------------------ skrár

  function pickFiles(kind: "audio" | "video", what: Intent) {
    intent.current = what;
    (kind === "audio" ? audioInput : videoInput).current?.click();
  }

  async function handleFiles(files: File[]) {
    const what = intent.current;
    if (!files.length || status) {
      if (what.kind === "resolve") what.done(null);
      return;
    }
    setError("");
    const tracks: TrackView[] = [];
    const failed: string[] = [];
    for (const file of files) {
      setStatus(`Les ${file.name}…`);
      try {
        tracks.push(await importSong(file));
      } catch (err) {
        failed.push(err instanceof Error ? `${file.name}: ${err.message}` : file.name);
      }
    }
    setStatus("");
    if (failed.length) setError(failed.join(" · "));
    if (what.kind === "resolve") {
      what.done(tracks[0] ? (docRef.current.songs.find((s) => s.id === tracks[0].id) ?? null) : null);
      return;
    }
    if (!tracks.length) return;
    if (what.kind === "library") {
      say(tracks.length === 1 ? `„${tracks[0].name}“ er komið í safnið` : `${tracks.length} lög komin í safnið`);
      return;
    }
    await createRoutine(
      tracks,
      docRef.current.skaters.find((k) => k.id === what.skaterId),
    );
  }

  // ------------------------------------------------------------------ rútínur

  /** Ný rútína: lengd og hápunktar koma frá iðkandanum (ef valinn), og með
   *  einu lagi byrjar hún á kaflanum sem hittir best á hápunktana. */
  async function createRoutine(tracks: TrackView[], skater?: Skater, clip?: Clip) {
    const base = emptyArrangement();
    const targetMin = skater?.targetMin ?? base.targetMin;
    const targetMax = skater?.targetMax ?? base.targetMax;
    const want = (targetMin + targetMax) / 2;
    const each = Math.max(10, want / tracks.length);
    const times = skater?.markers.map((m) => m.t) ?? [];
    const parts: Part[] = tracks.map((tv, i) => {
      const length = Math.min(tv.duration, each);
      let start = 0;
      let end = length;
      if (clip && i === 0) {
        start = clip.start;
        end = Math.min(tv.duration, clip.end);
      } else if (tracks.length === 1 && times.length) {
        start = bestMatches(tv.analysis.highlights, times, length, tv.duration)[0]?.start ?? 0;
        end = Math.min(tv.duration, start + length);
      }
      return { id: newId(), trackId: tv.id, start, end, tempo: 1, gainDb: 0, xfade: i ? 0.5 : 0 };
    });
    const markers: Marker[] = (skater?.markers ?? []).map((m) => ({ id: newId(), t: m.t, label: m.label }));
    const arr: Arrangement = { ...base, targetMin, targetMax, parts, markers };
    const id = newId();
    const title = (clip?.name ?? tracks[0].name).slice(0, 50);
    const name = skater?.name ? `${skater.name.split(/\s+/)[0]} – ${title}` : title;
    await saveProject({
      id,
      name,
      updatedAt: Date.now(),
      length: parts.reduce((s, p) => s + (p.end - p.start), 0),
      arrangement: arr,
      tracks: tracks.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
      ...(skater ? { skaterId: skater.id } : {}),
      // Upptakan af dansinum fylgir með í ritilinn og spilast undir tónlistinni.
      ...(skater?.videoId ? { videoId: skater.videoId, videoOffset: skater.videoStart ?? 0 } : {}),
    }).catch(() => undefined);
    syncRef.current?.touch(id, 800);
    stopPreview();
    setNewFor(null);
    setSkaterOpen(null);
    setOpen({ id, name, arr, tracks, skaterId: skater?.id, videoId: skater?.videoId, videoOffset: skater?.videoStart ?? 0, key: Date.now() });
  }

  async function routineFromLibrary(songId: string, skaterId?: string, clip?: Clip) {
    if (status) return;
    setError("");
    setStatus("Opna lagið…");
    try {
      const tv = await openSong(songId);
      setStatus("");
      await createRoutine(
        [tv],
        docRef.current.skaters.find((k) => k.id === skaterId),
        clip,
      );
    } catch (err) {
      setStatus("");
      setNewFor(null);
      setError(err instanceof Error ? err.message : "Gat ekki opnað lagið");
    }
  }

  async function openProject(rec: ProjectRecord) {
    if (status) return;
    setError("");
    const tracks: TrackView[] = [];
    const missing: string[] = [];
    for (const meta of rec.tracks) {
      setStatus(`Opna ${meta.name}…`);
      try {
        tracks.push(await openSong(meta.id));
      } catch {
        missing.push(meta.name);
      }
    }
    setStatus("");
    if (missing.length) {
      setError(
        `Náði ekki í lagið: ${missing.join(", ")}. ${navigator.onLine ? "Bættu því aftur við undir „Lög“." : "Það er í skýinu — tengstu netinu og opnaðu rútínuna aftur."}`,
      );
      // Án allra laga er betra að opna ekki (og vista ekki tóma útgáfu yfir þá réttu).
      if (!navigator.onLine || missing.length === rec.tracks.length) return;
    }
    const durations = Object.fromEntries(tracks.map((t) => [t.id, t.duration]));
    stopPreview();
    setSkaterOpen(null);
    setOpen({
      id: rec.id,
      name: rec.name,
      arr: normalizeArrangement(rec.arrangement, durations),
      tracks,
      skaterId: rec.skaterId,
      videoId: rec.videoId,
      videoOffset: rec.videoOffset,
      key: Date.now(),
    });
  }

  async function removeProject(rec: ProjectRecord) {
    if (!window.confirm(`Eyða rútínunni „${rec.name}“? Hún hverfur úr símanum og úr skýinu. Lögin verða áfram í safninu.`)) return;
    await deleteProject(rec.id, !!keyRef.current).catch(() => undefined);
    await refresh();
    void pull();
  }

  // ------------------------------------------------------------------ safn og iðkendur

  function deleteSong(song: Song) {
    const used = (projects ?? []).filter((p) => p.tracks.some((t) => t.id === song.id));
    if (used.length) {
      say(`„${song.name}“ er notað í rútínunni „${used[0].name}“. Eyddu henni fyrst, eða taktu lagið úr henni.`, 6000);
      return;
    }
    if (!window.confirm(`Eyða laginu „${song.name}“ úr safninu? Bútar úr því hverfa líka.`)) return;
    if (playing === song.id) stopPreview();
    cache.current.delete(song.id);
    updateDoc((d) => removeSong(d, song.id, Date.now()));
    void deleteSongBlob(song.id).catch(() => undefined);
  }

  /** Umslög fyrir lög sem hafa ekkert: sett þegar heitið passar örugglega. */
  async function findCovers() {
    const todo = docRef.current.songs.filter((s) => !s.art && !s.cover);
    if (!todo.length) return;
    say(todo.length === 1 ? "Leita að umslagi…" : `Leita að umslögum á ${todo.length} lög…`, 8000);
    let found = 0;
    for (const s of todo) {
      const hit = confidentCover(s.name, await searchCovers(s.name));
      if (!hit) continue;
      found++;
      updateDoc((d) => patchSong(d, s.id, { art: hit.art }, Date.now()));
    }
    say(found ? `Fann umslag á ${found} af ${todo.length}. Hin má velja undir ⋯ við lagið.` : "Fann ekkert sem passar örugglega. Veldu sjálf undir ⋯ við lagið.", 6000);
  }

  async function setPhoto(skater: Skater, file: Blob | null) {
    const cur = docRef.current.skaters.find((k) => k.id === skater.id) ?? skater;
    if (!file) {
      await deletePhoto(skater.id).catch(() => undefined);
      delete photoAt.current[skater.id];
      setPhotos((p) => {
        const { [skater.id]: gone, ...rest } = p;
        if (gone) URL.revokeObjectURL(gone);
        return rest;
      });
      updateDoc((d) => putSkater(d, { ...cur, photoAt: 0, at: Date.now() }));
      return;
    }
    try {
      const blob = await squarePhoto(file);
      const at = Date.now();
      await savePhoto(skater.id, blob, at);
      photoAt.current[skater.id] = at;
      setPhotos((p) => ({ ...p, [skater.id]: URL.createObjectURL(blob) }));
      updateDoc((d) => putSkater(d, { ...cur, photoAt: at, at }));
    } catch (err) {
      say(err instanceof Error ? err.message : "Gat ekki notað myndina");
    }
  }

  function deleteSkater(skater: Skater) {
    if (!window.confirm(`Eyða ${skater.name || "iðkandanum"}? Rútínurnar verða áfram til.`)) return;
    setSkaterOpen(null);
    updateDoc((d) => removeSkater(d, skater.id, Date.now()));
    void deletePhoto(skater.id).catch(() => undefined);
  }

  /** Mynd eða myndband inn í safnið (á iðkanda eða rútínu). Myndir eru minnkaðar. */
  async function addMedia(file: File, owner: { skaterId?: string; projectId?: string }): Promise<Media | null> {
    const video = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    if (!video && !file.type.startsWith("image/")) {
      say("Veldu mynd eða myndband");
      return null;
    }
    try {
      const blob = video ? file : await fitPhoto(file);
      const id = newId();
      await saveMediaBlob(id, blob);
      const item: Media = { id, at: Date.now(), kind: video ? "myndband" : "mynd", name: file.name.slice(0, 120), size: blob.size, type: blob.type || (video ? "video/mp4" : "image/jpeg"), ...owner };
      updateDoc((d) => putMedia(d, item));
      if (item.size > MAX_CLOUD_BYTES) say("Myndbandið er of stórt fyrir skýið (yfir 48 MB) — það er geymt í þessu tæki", 6000);
      return item;
    } catch (err) {
      say(err instanceof Error && err.name === "QuotaExceededError" ? "Tækið er fullt — ekki pláss fyrir skrána" : "Gat ekki vistað skrána", 5000);
      return null;
    }
  }
  const openMedia = (m: Media) => fetchMediaBlob(keyRef.current, m);
  function deleteMedia(m: Media) {
    updateDoc((d) => removeMedia(d, m.id, Date.now()));
    void deleteMediaBlob(m.id).catch(() => undefined);
  }

  /** Lætur notandann velja skrá og skilar laginu þegar það er komið í safnið. */
  const importOne = (kind: "audio" | "video") => new Promise<Song | null>((done) => pickFiles(kind, { kind: "resolve", done }));

  // ------------------------------------------------------------------ valmynd

  async function copyDeviceLink() {
    const key = keyRef.current;
    if (!key) return;
    const link = `${window.location.origin}/coach?${KEY_PARAM}=${key}`;
    try {
      await navigator.clipboard.writeText(link);
      say("Tengill afritaður. Opnaðu hann í hinu tækinu — og ekki senda hann öðrum, hann opnar allt þitt.", 7000);
    } catch {
      window.prompt("Afritaðu tengilinn og opnaðu hann í hinu tækinu:", link);
    }
    setMenu(false);
  }

  async function shareApp() {
    const url = `${window.location.origin}/coach`;
    setMenu(false);
    try {
      if (navigator.share) await navigator.share({ title: "THE COACH", text: "Þjálfaraappið: skipulag, iðkendur og tónlist fyrir rútínur", url });
      else {
        await navigator.clipboard.writeText(url);
        say("Tengill á appið afritaður");
      }
    } catch {
      /* hætt við */
    }
  }

  const syncLabel =
    syncState === "synced" ? "Allt vistað í skýinu" : syncState === "syncing" ? "Samstilli…" : "Án nets — vistað í símanum";
  const syncBadge = (
    <span className={`tk-sync ${syncState}`} role="status">
      {syncState === "synced" ? <Cloud size={15} /> : syncState === "syncing" ? <LoaderCircle size={15} className="tk-spin" /> : <CloudOff size={15} />}
      {syncLabel}
    </span>
  );
  const skaterOf = (id?: string) => (id ? doc.skaters.find((k) => k.id === id) : undefined);
  const openSkater = skaterOpen ? (doc.skaters.find((k) => k.id === skaterOpen.id) ?? skaterOpen.draft) : null;
  const newSkater = skaterOf(newFor?.skaterId);
  const today = ymd(new Date());
  const newSkaterSheet = () => {
    const draft = blankSkater();
    updateDoc((d) => putSkater(d, draft));
    setSkaterOpen({ id: draft.id, isNew: true, draft });
  };
  const coach = {
    doc,
    photos,
    today,
    onOpenEvent: (event: CoachEvent) => setEventOpen({ event, isNew: false }),
    onAddEvent: (date: string) => setEventOpen({ event: blankEvent(date), isNew: true }),
    onTodoAdd: (text: string) => updateDoc((d) => putTodo(d, { id: newId(), at: Date.now(), text, done: false })),
    onTodoToggle: (t: { id: string; text: string; done: boolean }) => updateDoc((d) => putTodo(d, { ...t, done: !t.done, at: Date.now() })),
    onTodoDelete: (t: { id: string }) => updateDoc((d) => removeTodo(d, t.id, Date.now())),
  };
  const startNew = () => {
    // Fyrsta skiptið (ekkert safn, engir iðkendur): beint í skráaval.
    if (!doc.songs.length && !doc.skaters.length) pickFiles("audio", { kind: "routine" });
    else setNewFor({});
  };

  return (
    <div className="tk-root tk-home">
      <div className="tk-home-scroll">
        <header className="tk-home-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tk-logo" src="/coach/icon-192.png" alt="" width={52} height={52} />
          <div className="tk-brand">
            <h1>THE COACH</h1>
            <p>{tab === "heim" ? "Þjálfaraappið þitt" : tab === "skipulag" ? "Skipulag" : tab === "idkendur" ? "Iðkendur" : tab === "rutinur" ? "Tónlist fyrir rútínur" : "Tónlistarsafnið"}</p>
          </div>
          <button type="button" className="tk-iconbtn" onClick={() => setMenu(true)} aria-label="Meira">
            <Ellipsis size={22} />
          </button>
        </header>

        {error && (
          <p className="tk-error" role="alert">
            {error}
          </p>
        )}

        {tab === "heim" && (
          <HomeTab
            {...coach}
            projects={projects ?? []}
            onNewRoutine={startNew}
            onOpenProject={(rec) => void openProject(rec)}
            onOpenSkater={(k) => setSkaterOpen({ id: k.id, isNew: false, draft: k })}
            onNewSkater={newSkaterSheet}
            onGo={setTab}
          />
        )}

        {tab === "skipulag" && <PlanTab {...coach} onClearDone={() => updateDoc((d) => clearDone(d, Date.now()))} />}

        {tab === "rutinur" && (
          <>
            <button type="button" className="tk-new" onClick={startNew} disabled={!!status}>
              <span className="tk-new-plus" aria-hidden="true">
                <Plus size={30} strokeWidth={2.6} />
              </span>
              <span className="tk-new-text">
                <strong>Ný rútína</strong>
                <small>Veldu lag til að byrja</small>
              </span>
            </button>
            {!doc.songs.length && (
              <button type="button" className="tk-link" onClick={() => pickFiles("video", { kind: "routine" })} disabled={!!status}>
                <Film size={17} /> Nota hljóð úr myndbandi
              </button>
            )}

            <div className="tk-section">
              <h2>Rútínurnar mínar</h2>
              {syncBadge}
            </div>

            {projects === null ? (
              <div className="tk-skeleton" aria-hidden="true" />
            ) : projects.length === 0 ? (
              <ol className="tk-steps-intro">
                <li>
                  <Music size={22} />
                  <div>
                    <strong>Veldu lag</strong>
                    <span>MP3 eða M4A úr Skrám (Files) — eða hljóðið úr myndbandi.</span>
                  </div>
                </li>
                <li>
                  <Scissors size={22} />
                  <div>
                    <strong>Klipptu kaflann</strong>
                    <span>Hlustaðu og ýttu á „Byrja hér“ og „Enda hér“. Lengdin sést allan tímann.</span>
                  </div>
                </li>
                <li>
                  <Flag size={22} />
                  <div>
                    <strong>Merktu hápunktana</strong>
                    <span>Stökk, snúningur, lokastaða — og láttu tónlistina hitta á þá.</span>
                  </div>
                </li>
                <li>
                  <Download size={22} />
                  <div>
                    <strong>Vistaðu MP3</strong>
                    <span>Tilbúið til að spila á svellinu eða senda áfram.</span>
                  </div>
                </li>
              </ol>
            ) : (
              <ul className="tk-cards">
                {projects.map((rec) => {
                  const who = skaterOf(rec.skaterId);
                  return (
                    <li key={rec.id} style={{ ["--tk-hue" as string]: hueOf(rec.id) }}>
                      <button type="button" className="tk-card" onClick={() => void openProject(rec)} disabled={!!status}>
                        {who ? (
                          <Avatar skater={who} url={photos[who.id]} size={52} />
                        ) : (
                          <span className="tk-card-art" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                          </span>
                        )}
                        <span className="tk-card-text">
                          <strong>{rec.name}</strong>
                          <small>
                            {formatTime(rec.length)} · {rec.tracks.length === 1 ? "1 lag" : `${rec.tracks.length} lög`} ·{" "}
                            {new Date(rec.updatedAt).toLocaleDateString("is-IS", { day: "numeric", month: "short" })}
                            {!isSynced(rec) && <CloudOff size={13} className="tk-card-unsynced" aria-label="Ekki komið í skýið" />}
                          </small>
                        </span>
                      </button>
                      <button type="button" className="tk-card-del" onClick={() => void removeProject(rec)} aria-label={`Eyða rútínunni ${rec.name}`}>
                        <Trash2 size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {installHint && (
              <aside className="tk-install">
                <div>
                  <strong>Settu appið á heimaskjáinn</strong>
                  <span>
                    Ýttu á <Share size={15} className="tk-inline" aria-label="Deila" /> neðst í Safari og veldu „Setja á heimaskjá“. Þá
                    opnast THE COACH eins og hvert annað app, með öllu þínu.
                  </span>
                </div>
                <button
                  type="button"
                  className="tk-iconbtn small"
                  aria-label="Fela"
                  onClick={() => {
                    setInstallHint(false);
                    try {
                      window.localStorage.setItem(HINT_KEY, "1");
                    } catch {
                      /* einkagluggi */
                    }
                  }}
                >
                  <X size={18} />
                </button>
              </aside>
            )}
          </>
        )}

        {tab === "idkendur" && (
          <SkatersTab
            doc={doc}
            photos={photos}
            projects={projects ?? []}
            onOpen={(k) => setSkaterOpen({ id: k.id, isNew: false, draft: k })}
            onNew={newSkaterSheet}
          />
        )}

        {tab === "safn" && (
          <LibraryTab
            doc={doc}
            filter={filter}
            onFilter={setFilter}
            playing={playing}
            onPlay={(id, songId, from, to, seek) => void preview(id, songId, from, to, seek)}
            onFav={(s) => updateDoc((d) => patchSong(d, s.id, { fav: !s.fav }, Date.now()))}
            onCover={(s, cover) => updateDoc((d) => patchSong(d, s.id, { cover, art: undefined }, Date.now()))}
            onArt={(s, art) => updateDoc((d) => patchSong(d, s.id, { art }, Date.now()))}
            onLink={(s, k) =>
              updateDoc((d) => {
                const cur = d.skaters.find((x) => x.id === k.id);
                if (!cur) return d;
                const songIds = cur.songIds.includes(s.id) ? cur.songIds.filter((id) => id !== s.id) : [...cur.songIds, s.id];
                return putSkater(d, { ...cur, songIds, at: Date.now() });
              })
            }
            onFindCovers={() => void findCovers()}
            photos={photos}
            onDeleteSong={deleteSong}
            onDeleteClip={(c) => {
              if (window.confirm(`Eyða bútnum „${c.name}“?`)) updateDoc((d) => removeClip(d, c.id, Date.now()));
            }}
            onAddFile={() => pickFiles("audio", { kind: "library" })}
            onAddVideo={() => pickFiles("video", { kind: "library" })}
          />
        )}
      </div>

      <nav className="tk-tabs" aria-label="Aðalvalmynd">
        {(
          [
            ["heim", House, "Heim"],
            ["skipulag", CalendarDays, "Skipulag"],
            ["idkendur", Users, "Iðkendur"],
            ["rutinur", ListMusic, "Rútínur"],
            ["safn", Library, "Safn"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "on" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              if (id !== "safn") stopPreview();
              setTab(id);
            }}
          >
            <Icon size={21} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <input
        ref={audioInput}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void handleFiles(files);
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void handleFiles(files);
        }}
      />

      {openSkater && skaterOpen && (
        <SkaterSheet
          skater={openSkater}
          isNew={skaterOpen.isNew}
          doc={doc}
          photoUrl={photos[openSkater.id]}
          projects={projects ?? []}
          onChange={updateDoc}
          onPhoto={setPhoto}
          onOpenProject={(rec) => void openProject(rec)}
          onNewRoutine={(k) => setNewFor({ skaterId: k.id })}
          onImport={importOne}
          onAddMedia={async (k, files) => {
            const added: Media[] = [];
            for (const file of files) {
              const m = await addMedia(file, { skaterId: k.id });
              if (m) added.push(m);
            }
            return added;
          }}
          onOpenMedia={openMedia}
          onDeleteMedia={deleteMedia}
          onDelete={deleteSkater}
          onClose={() => {
            // Tómur, nýr iðkandi sem ekkert var skráð á: hverfur aftur.
            const k = docRef.current.skaters.find((x) => x.id === skaterOpen.id);
            if (skaterOpen.isNew && k && !k.name && !k.photoAt && !k.markers.length && !k.songIds.length) updateDoc((d) => removeSkater(d, k.id, Date.now()));
            setSkaterOpen(null);
          }}
        />
      )}

      {newFor && (
        <SongPicker
          title={newSkater?.name ? `Ný rútína – ${newSkater.name.split(/\s+/)[0]}` : "Ný rútína"}
          songs={doc.songs}
          clips={doc.clips}
          fit={newSkater ? fitsFor(doc.songs, newSkater.markers, newSkater.targetMin, newSkater.targetMax) : undefined}
          first={newSkater?.songIds}
          onSong={(s) => void routineFromLibrary(s.id, newFor.skaterId)}
          onClip={(c) => void routineFromLibrary(c.songId, newFor.skaterId, c)}
          onFile={() => pickFiles("audio", { kind: "routine", skaterId: newFor.skaterId })}
          onVideo={() => pickFiles("video", { kind: "routine", skaterId: newFor.skaterId })}
          onClose={() => setNewFor(null)}
        >
          {doc.skaters.length > 0 && (
            <>
              <h3>Fyrir hvern?</h3>
              <div className="tk-who">
                <button type="button" className={`tk-chip${!newFor.skaterId ? " on" : ""}`} onClick={() => setNewFor({})}>
                  Engan sérstakan
                </button>
                {doc.skaters.map((k) => (
                  <button key={k.id} type="button" className={`tk-chip who${newFor.skaterId === k.id ? " on" : ""}`} onClick={() => setNewFor({ skaterId: k.id })}>
                    <Avatar skater={k} url={photos[k.id]} size={26} /> {k.name || "Ónefndur"}
                  </button>
                ))}
              </div>
              {newSkater && (
                <p className="tk-hint">
                  Rútínan verður {formatTime(newSkater.targetMin)}–{formatTime(newSkater.targetMax)}
                  {newSkater.markers.length ? ` með ${newSkater.markers.length} hápunktum, og byrjar á þeim kafla lagsins sem hittir best á þá.` : "."}
                </p>
              )}
            </>
          )}
        </SongPicker>
      )}

      {eventOpen && (
        <EventSheet
          key={eventOpen.event.id}
          event={eventOpen.event}
          isNew={eventOpen.isNew}
          skaters={doc.skaters}
          photos={photos}
          onSave={(e) => {
            updateDoc((d) => putEvent(d, e));
            setEventOpen(null);
          }}
          onDelete={(e) => {
            updateDoc((d) => removeEvent(d, e.id, Date.now()));
            setEventOpen(null);
          }}
          onClose={() => setEventOpen(null)}
        />
      )}

      {menu && (
        <div className="tk-sheet-back" onClick={() => setMenu(false)}>
          <div className="tk-sheet" role="dialog" aria-modal="true" aria-label="Meira" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tk-sheet-item" onClick={() => void copyDeviceLink()} disabled={!keyRef.current}>
              <Link2 size={20} />
              <span>
                <strong>Opna allt mitt í öðru tæki</strong>
                <small>Afritar leynitengil — bara fyrir þig</small>
              </span>
            </button>
            <button type="button" className="tk-sheet-item" onClick={() => void shareApp()}>
              <Share size={20} />
              <span>
                <strong>Deila appinu með vini</strong>
                <small>Vinurinn fær appið tómt, ekkert af þínu</small>
              </span>
            </button>
            <button
              type="button"
              className="tk-sheet-item"
              onClick={() => {
                setMenu(false);
                void pull();
              }}
              disabled={!keyRef.current}
            >
              <RefreshCw size={20} />
              <span>
                <strong>Samstilla núna</strong>
                <small>{syncLabel}</small>
              </span>
            </button>
            <button type="button" className="tk-sheet-item tk-sheet-close" onClick={() => setMenu(false)}>
              Loka
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="tk-toast" role="status">
          {toast}
        </div>
      )}
      {status && (
        <div className="tk-busy" role="status">
          <span className="tk-spinner" />
          <span>{status}</span>
        </div>
      )}

      {open && (
        <TonklippaEditor
          key={open.key}
          projectId={open.id}
          initialName={open.name}
          initialArr={open.arr}
          initialTracks={open.tracks}
          skaterId={open.skaterId}
          skaterName={skaterOf(open.skaterId)?.name}
          songs={doc.songs}
          clips={doc.clips}
          importSong={importSong}
          openSong={openSong}
          onSaveClip={(clip) => updateDoc((d) => putClip(d, clip))}
          initialVideoId={open.videoId}
          initialVideoOffset={open.videoOffset}
          media={doc.media}
          onAddVideo={(file) => addMedia(file, { projectId: open.id })}
          onOpenMedia={openMedia}
          onDeleteMedia={deleteMedia}
          sync={syncRef.current}
          syncState={syncState}
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
