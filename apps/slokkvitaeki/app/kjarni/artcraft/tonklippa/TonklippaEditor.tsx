"use client";

/** Tónklippa — ritillinn á öllum skjánum: tímalína rútínunnar efst, spilun,
 *  og fjögur spjöld (bútur, lög, hápunktar, lengd og vistun). Allt hljóð er
 *  unnið í vafranum; ekkert er sent neitt. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Copy, Download, Film, Flag, Library, Maximize2, Minus, Music, Pause, Play, Plus, Redo2, Scissors, Share, SkipBack, Sparkles, SquareSplitHorizontal, Star, Target, Trash2, Undo2, Video, X } from "lucide-react";
import {
  GAIN_MAX,
  GAIN_MIN,
  MIN_PART,
  TEMPO_MAX,
  TEMPO_MIN,
  addMarker,
  addPart,
  alignToMarker,
  duplicatePart,
  fitTempo,
  formatTime,
  layout,
  lengthStatus,
  locate,
  movePart,
  parseTime,
  partLength,
  removeMarker,
  removePart,
  removeTrack,
  safeFileName,
  setEnd,
  setFx,
  setGain,
  setRegion,
  setStart,
  setTempo,
  setXfade,
  slip,
  snapTo,
  splitAt,
  totalLength,
  trimToLength,
  updateMarker,
  type Arrangement,
  type Marker,
  type Part,
  type SeamFx,
} from "./arrange";
import { STEADY_ENOUGH, liveliestWindow } from "./analyze";
import { ElementField } from "./ElementField";
import { MAX_CLOUD_BYTES, MAX_CLOUD_LABEL, type Clip, type Media, type Song } from "./library";
import { bestMatches } from "./match";
import { SongPicker } from "./Parts";
import { Player, RATE, mixToBuffer, saveBlob, trackWindowBuffer } from "./audio";
import { encodeMp3 } from "./mp3";
import { renderMix, type Mix, type StretchCache } from "./render";
import { saveProject } from "./store";
import type { CloudSync, SyncState } from "./sync";
import { breathe, newId, type TrackView } from "./tracks";
import { SourceView, TimelineView, clampViewport, trackColor, type SourceHandle, type SourceViewport } from "./Wave";
import { encodeWav } from "./wav";
import "./tonklippa.css";

type Props = {
  projectId: string;
  initialName: string;
  initialArr: Arrangement;
  initialTracks: TrackView[];
  /** Iðkandinn sem rútínan er fyrir (ef einhver). */
  skaterId?: string;
  skaterName?: string;
  /** Safnið: lög og uppáhaldsbútar sem má sækja í, og leiðir til að bæta í það. */
  songs: Song[];
  clips: Clip[];
  importSong: (file: File) => Promise<TrackView>;
  openSong: (songId: string) => Promise<TrackView>;
  onSaveClip: (clip: Clip) => void;
  /** Upptaka af dansinum sem spilast undir tónlistinni, og hvar í henni dansinn byrjar. */
  initialVideoId?: string;
  initialVideoOffset?: number;
  media: Media[];
  onAddVideo: (file: File) => Promise<Media | null>;
  onOpenMedia: (m: Media) => Promise<Blob | null>;
  onDeleteMedia: (m: Media) => void;
  /** Skýjasamstillingin (null ef hún er ekki í boði) og staða hennar. */
  sync: CloudSync | null;
  syncState: SyncState;
  onClose: () => void;
};

type Panel = "butur" | "log" | "merki" | "myndband" | "vista";
type Rendered = { key: string; buffer: AudioBuffer; mix: Mix };
type Format = "mp3-192" | "mp3-320" | "wav";

export const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac,.opus";
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,.mp4,.mov,.m4v";
const SEAMS = [0, 0.2, 0.5, 1, 2, 4];
const FX: Array<[SeamFx | undefined, string]> = [
  [undefined, "Engin"],
  ["riser", "Svúss"],
  ["impact", "Högg"],
  ["both", "Bæði"],
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const comma = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");
const audioKey = (a: Arrangement) => JSON.stringify([a.parts, a.fadeIn, a.fadeOut]);

/** Fyrsti búturinn úr nýju lagi: fyllir upp í marklengdina ef pláss er. */
export function defaultPart(arr: Arrangement, track: { id: string; duration: number }): Part {
  const room = arr.targetMax - totalLength(arr);
  const length = Math.min(track.duration, room > 8 ? room : 20);
  return { id: newId(), trackId: track.id, start: 0, end: length, tempo: 1, gainDb: 0, xfade: arr.parts.length ? 0.5 : 0 };
}

export default function TonklippaEditor({
  projectId,
  initialName,
  initialArr,
  initialTracks,
  skaterId,
  skaterName,
  songs,
  clips,
  importSong,
  openSong,
  onSaveClip,
  initialVideoId,
  initialVideoOffset,
  media,
  onAddVideo,
  onOpenMedia,
  onDeleteMedia,
  sync,
  syncState,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  const [tracks, setTracks] = useState(initialTracks);
  const [hist, setHist] = useState<{ past: Arrangement[]; now: Arrangement; future: Arrangement[] }>({
    past: [],
    now: initialArr,
    future: [],
  });
  const arr = hist.now;
  const [sel, setSel] = useState(0);
  const [panel, setPanel] = useState<Panel>(initialArr.parts.length ? "butur" : "log");
  const [playing, setPlaying] = useState<null | "mix" | "source">(null);
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [snap, setSnap] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<SourceViewport>({ t0: 0, span: 30 });
  const [format, setFormat] = useState<Format>("mp3-192");
  const [exported, setExported] = useState<{ key: string; blob: Blob; fileName: string } | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [focusMarker, setFocusMarker] = useState("");
  const [picker, setPicker] = useState(false);
  const [videoId, setVideoId] = useState(initialVideoId);
  const [videoOffset, setVideoOffset] = useState(initialVideoOffset ?? 0);
  /** Slóð á upptökuna: undefined = verið að sækja, null = ekki til í þessu tæki. */
  const [videoUrl, setVideoUrl] = useState<string | null | undefined>(undefined);
  const [videoLen, setVideoLen] = useState(0);
  const [videoSound, setVideoSound] = useState(false);
  const danceEl = useRef<HTMLVideoElement>(null);
  const danceInput = useRef<HTMLInputElement>(null);
  const priming = useRef(false);
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const videoOffsetRef = useRef(videoOffset);
  videoOffsetRef.current = videoOffset;
  const videoMeta = videoId ? media.find((m) => m.id === videoId) : undefined;
  const matchTurn = useRef<{ part: string; turn: number }>({ part: "", turn: 0 });

  const arrRef = useRef(arr);
  arrRef.current = arr;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const mergeRef = useRef<{ key: string; at: number } | null>(null);
  const playerRef = useRef<Player | null>(null);
  const renderedRef = useRef<Rendered | null>(null);
  const stretchCache = useRef<StretchCache>(new Map());
  const modeRef = useRef<null | "mix" | "source">(null);
  const playToken = useRef(0);
  const rafRef = useRef(0);
  const srcFromRef = useRef(0);
  const tRef = useRef(0);
  const spanRef = useRef(60);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const srcRef = useRef<SourceHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef(0);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const trackIndex = useMemo(() => new Map(tracks.map((t, i) => [t.id, i])), [tracks]);
  const lay = useMemo(() => layout(arr), [arr]);
  const total = lay.total;
  const span = Math.max(20, total, arr.targetMax) * 1.04;
  spanRef.current = span;
  const status = lengthStatus(total, arr.targetMin, arr.targetMax);
  const aKey = useMemo(() => audioKey(arr), [arr]);

  const selIndex = Math.min(sel, arr.parts.length - 1);
  const part: Part | undefined = selIndex >= 0 ? arr.parts[selIndex] : undefined;
  const track = part ? trackMap.get(part.trackId) : undefined;
  const color = trackColor(part ? (trackIndex.get(part.trackId) ?? 0) : 0);
  const beats = track && track.analysis.steady >= STEADY_ENOUGH && track.analysis.beats.length > 3 ? track.analysis.beats : null;
  const snapOn = snap && !!beats;

  // ------------------------------------------------------------------ saga

  function apply(next: Arrangement | ((a: Arrangement) => Arrangement), mergeKey?: string) {
    const now = Date.now();
    const last = mergeRef.current;
    const merge = !!mergeKey && last?.key === mergeKey && now - last.at < 900;
    mergeRef.current = mergeKey ? { key: mergeKey, at: now } : null;
    setHist((h) => {
      const value = typeof next === "function" ? next(h.now) : next;
      if (value === h.now) return h;
      return { past: merge && h.past.length ? h.past : [...h.past.slice(-59), h.now], now: value, future: [] };
    });
  }
  function undo() {
    mergeRef.current = null;
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h));
  }
  function redo() {
    mergeRef.current = null;
    setHist((h) => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h));
  }

  function say(text: string, ms = 3200) {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), ms);
  }

  // ------------------------------------------------------------------ spilun

  function player(): Player {
    if (!playerRef.current) playerRef.current = new Player();
    return playerRef.current;
  }

  /** Upptakan af dansinum fylgir spilhausnum: spilast með tónlistinni og
   *  stendur á réttum ramma þegar stöðvað er eða flett. */
  const syncVideo = useCallback((t: number) => {
    const v = danceEl.current;
    if (!v || !v.currentSrc) return;
    const want = Math.max(0, videoOffsetRef.current + t);
    if (modeRef.current === "mix") {
      if (v.paused) {
        if (!(want >= v.duration)) {
          v.currentTime = want;
          void v.play().catch(() => undefined);
        }
      } else if (Math.abs(v.currentTime - want) > 0.3) {
        v.currentTime = want;
      }
    } else if (!priming.current) {
      if (!v.paused) v.pause();
      const at = Number.isFinite(v.duration) ? Math.min(want, v.duration) : want;
      if (Math.abs(v.currentTime - at) > 0.04) v.currentTime = at;
    }
  }, []);

  const placeHead = useCallback(
    (t: number) => {
      tRef.current = t;
      if (headRef.current) headRef.current.style.left = `${clamp((t / spanRef.current) * 100, 0, 100)}%`;
      if (timeRef.current) timeRef.current.textContent = formatTime(t, true);
      syncVideo(t);
    },
    [syncVideo],
  );
  // Spilhausinn er færður beint (ekki í gegnum React) — rétta hann af eftir hverja teikningu.
  useLayoutEffect(() => {
    placeHead(tRef.current);
  });

  function loop() {
    const p = playerRef.current;
    if (!p || !modeRef.current) return;
    if (modeRef.current === "mix") placeHead(p.time);
    else srcRef.current?.setPlayLine(srcFromRef.current + p.time);
    rafRef.current = requestAnimationFrame(loop);
  }

  function stopAll() {
    playToken.current++;
    cancelAnimationFrame(rafRef.current);
    const p = playerRef.current;
    if (p && modeRef.current === "mix") placeHead(p.time);
    p?.stop();
    modeRef.current = null;
    srcRef.current?.setPlayLine(null);
    setPlaying(null);
  }

  async function getMix(): Promise<Rendered> {
    const a = arrRef.current;
    const key = `${audioKey(a)}|${tracksRef.current.map((t) => t.id).join(",")}`;
    const cur = renderedRef.current;
    if (cur?.key === key) return cur;
    setWorking(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const audio = new Map(tracksRef.current.map((t) => [t.id, t.audio]));
      const mix = renderMix(a, audio, RATE, stretchCache.current);
      const buffer = mixToBuffer(player().context(), mix);
      const made = { key, buffer, mix };
      renderedRef.current = made;
      return made;
    } finally {
      setWorking(false);
    }
  }

  async function playMix(from?: number, to?: number) {
    if (!arrRef.current.parts.length) return;
    const p = player();
    try {
      p.context();
    } catch (err) {
      say(err instanceof Error ? err.message : "Gat ekki spilað");
      return;
    }
    stopAll();
    const token = ++playToken.current;
    // Myndbandið er ræst strax (á meðan snertingin er enn „gild“ í iPhone);
    // það er svo rétt af þegar tónlistin fer af stað.
    const v = danceEl.current;
    if (v?.currentSrc && v.paused) {
      priming.current = true;
      void v.play().catch(() => undefined);
    }
    let made: Rendered;
    try {
      made = await getMix();
    } catch (err) {
      priming.current = false;
      say(err instanceof Error ? err.message : "Gat ekki blandað rútínuna");
      return;
    }
    priming.current = false;
    if (playToken.current !== token) return;
    const duration = made.buffer.duration;
    let start = Math.max(0, from ?? tRef.current);
    if (start >= duration - 0.05) start = 0;
    const end = to != null ? clamp(to, start, duration) : duration;
    modeRef.current = "mix";
    setPlaying("mix");
    p.play(made.buffer, start, end, () => {
      if (playToken.current !== token) return;
      cancelAnimationFrame(rafRef.current);
      modeRef.current = null;
      setPlaying(null);
      placeHead(end);
    });
    placeHead(start);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  function playSource(from: number) {
    if (!track) return;
    const p = player();
    let ctx: AudioContext;
    try {
      ctx = p.context();
    } catch (err) {
      say(err instanceof Error ? err.message : "Gat ekki spilað");
      return;
    }
    stopAll();
    const token = ++playToken.current;
    const start = clamp(from, 0, Math.max(0, track.duration - 0.1));
    const buf = trackWindowBuffer(ctx, track.audio, start, 60);
    srcFromRef.current = start;
    modeRef.current = "source";
    setPlaying("source");
    p.play(buf, 0, undefined, () => {
      if (playToken.current !== token) return;
      cancelAnimationFrame(rafRef.current);
      modeRef.current = null;
      setPlaying(null);
      srcRef.current?.setPlayLine(null);
      setCursor(Math.min(track.duration, start + buf.duration));
    });
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  /** Hvar bendillinn er í laginu núna (fylgir hlustuninni ef hún er í gangi). */
  function cursorNow(): number {
    if (modeRef.current === "source" && playerRef.current) return srcFromRef.current + playerRef.current.time;
    return cursor;
  }

  function toggleSource() {
    if (playing === "source") {
      const at = cursorNow();
      stopAll();
      setCursor(at);
    } else {
      playSource(cursor);
    }
  }

  function seek(t: number, final: boolean) {
    const at = clamp(t, 0, Math.max(total, 0));
    if (modeRef.current === "mix") {
      if (final) void playMix(at);
      else {
        cancelAnimationFrame(rafRef.current);
        placeHead(at);
      }
      return;
    }
    placeHead(at);
  }

  // Breyting á meðan spilað er: blanda aftur og halda áfram á sama stað.
  useEffect(() => {
    if (modeRef.current !== "mix") return;
    const id = window.setTimeout(() => {
      if (modeRef.current === "mix") void playMix(playerRef.current?.time ?? tRef.current);
    }, 260);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(toastTimer.current);
      playerRef.current?.close();
      playerRef.current = null;
    },
    [],
  );

  // ------------------------------------------------------------------ upptaka af dansinum

  const videoMetaId = videoMeta?.id;
  useEffect(() => {
    if (!videoMeta) {
      setVideoUrl(undefined);
      return;
    }
    let alive = true;
    let made = "";
    setVideoUrl(undefined);
    void onOpenMedia(videoMeta)
      .catch(() => null)
      .then((blob) => {
        if (!alive) return;
        if (!blob) {
          setVideoUrl(null);
          return;
        }
        made = URL.createObjectURL(blob);
        setVideoUrl(made);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoMetaId]);

  // Hlustað á hljóðið úr upptökunni: nýja tónlistin þagnar á meðan.
  useEffect(() => {
    player().setVolume(videoSound && videoUrl ? 0 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSound, videoUrl]);

  async function attachVideo(file: File) {
    stopAll();
    setBusy("Vista myndbandið…");
    await breathe();
    const added = await onAddVideo(file);
    setBusy("");
    if (!added) return;
    // Eldri upptaka sem tilheyrði bara þessari rútínu fer; upptaka iðkanda helst á prófílnum.
    if (videoMeta && videoMeta.projectId === projectId) onDeleteMedia(videoMeta);
    setVideoId(added.id);
    setVideoOffset(0);
    setPanel("myndband");
  }

  function detachVideo() {
    if (!window.confirm("Taka myndbandið úr rútínunni?")) return;
    stopAll();
    if (videoMeta && videoMeta.projectId === projectId) onDeleteMedia(videoMeta);
    setVideoId(undefined);
    setVideoOffset(0);
    setVideoSound(false);
  }

  // ------------------------------------------------------------------ vistun

  useEffect(() => {
    setSaved("saving");
    const id = window.setTimeout(() => {
      saveProject({
        id: projectId,
        name: name.trim() || "Ónefnd rútína",
        updatedAt: Date.now(),
        length: totalLength(arr),
        arrangement: arr,
        tracks: tracks.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
        ...(skaterId ? { skaterId } : {}),
        ...(videoId ? { videoId, videoOffset } : {}),
      }).then(
        () => {
          setSaved("saved");
          sync?.touch(projectId);
        },
        () => setSaved("error"),
      );
    }, 600);
    return () => window.clearTimeout(id);
  }, [arr, name, tracks, projectId, skaterId, videoId, videoOffset, sync]);

  async function close() {
    stopAll();
    try {
      await saveProject({
        id: projectId,
        name: name.trim() || "Ónefnd rútína",
        updatedAt: Date.now(),
        length: totalLength(arrRef.current),
        arrangement: arrRef.current,
        tracks: tracksRef.current.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
        ...(skaterId ? { skaterId } : {}),
        ...(videoIdRef.current ? { videoId: videoIdRef.current, videoOffset: videoOffsetRef.current } : {}),
      });
      sync?.touch(projectId, 0);
    } catch {
      /* þegar tilkynnt með „Ekki vistað“ */
    }
    onClose();
  }

  // ------------------------------------------------------------------ búturinn

  const fitRegion = useCallback((p: Part, tr: TrackView) => {
    const len = p.end - p.start;
    const s = Math.max(4, len * 1.3);
    setView(clampViewport({ span: s, t0: p.start - (s - len) / 2 }, tr.duration));
  }, []);

  const partId = part?.id;
  useEffect(() => {
    const a = arrRef.current;
    const p = a.parts.find((x) => x.id === partId);
    const tr = p ? tracksRef.current.find((t) => t.id === p.trackId) : undefined;
    if (!p || !tr) return;
    fitRegion(p, tr);
    setCursor(p.start);
  }, [partId, fitRegion]);

  const snapT = (t: number) => (snapOn && beats ? snapTo(t, beats, Infinity) : t);

  /** Færir tíma um `n` skref: slög ef smellt er á takt, annars 0,05 s (4 slög / 1 s stór skref). */
  function stepTime(t: number, dir: 1 | -1, big: boolean): number {
    if (snapOn && beats) {
      const near = snapTo(t, beats, Infinity);
      let i = 0;
      for (let k = 0; k < beats.length; k++) {
        if (beats[k] === near) {
          i = k;
          break;
        }
      }
      return beats[clamp(i + dir * (big ? 4 : 1), 0, beats.length - 1)];
    }
    return t + dir * (big ? 1 : 0.05);
  }

  function changeStart(t: number) {
    if (!part) return;
    apply((a) => setStart(a, selIndex, snapT(t)), `start:${part.id}`);
  }
  function changeEnd(t: number) {
    if (!part || !track) return;
    apply((a) => setEnd(a, selIndex, snapT(t), track.duration), `end:${part.id}`);
  }
  function startHere() {
    if (!part || !track) return;
    const t = snapT(cursorNow());
    apply((a) => {
      const p = a.parts[selIndex];
      if (!p) return a;
      // Bendillinn er aftan við endann: flytja kaflann þangað í sömu lengd.
      if (t >= p.end - MIN_PART * p.tempo) return setRegion(a, selIndex, t, t + (p.end - p.start), track.duration);
      return setStart(a, selIndex, t);
    });
  }
  function endHere() {
    if (!part || !track) return;
    const t = snapT(cursorNow());
    apply((a) => {
      const p = a.parts[selIndex];
      if (!p) return a;
      if (t <= p.start + MIN_PART * p.tempo) return setRegion(a, selIndex, t - (p.end - p.start), t, track.duration);
      return setEnd(a, selIndex, t, track.duration);
    });
  }
  function slipBy(dir: 1 | -1, big: boolean) {
    if (!part || !track) return;
    const delta = stepTime(part.start, dir, big) - part.start;
    apply((a) => slip(a, selIndex, delta, track.duration), `slip:${part.id}`);
  }
  /** Besti kaflinn: ef hápunktar dansins lenda í þessum bút er leitað að
   *  kaflanum þar sem hápunktar lagsins hitta á þá (ýtt aftur = næsti kostur);
   *  annars líflegasti kaflinn. */
  function bestHere() {
    if (!part || !track) return;
    const len = part.end - part.start;
    const from = lay.pos[selIndex];
    const span = lay.len[selIndex];
    const inside = arr.markers.map((m) => m.t - from).filter((t) => t >= 0 && t <= span);
    const options = bestMatches(track.analysis.highlights, inside, span, track.duration, part.tempo);
    let s: number;
    if (options.length) {
      const turn = matchTurn.current.part === part.id ? (matchTurn.current.turn + 1) % options.length : 0;
      matchTurn.current = { part: part.id, turn };
      const m = options[turn];
      s = m.start;
      say(
        `${options.length > 1 ? `Kostur ${turn + 1} af ${options.length}: ` : ""}${m.hits} af ${m.total} hápunktum lenda á hápunkti í laginu${options.length > 1 ? " — ýttu aftur fyrir næsta" : ""}`,
        4500,
      );
    } else {
      s = snapT(liveliestWindow(track.peaks, len));
      say(arr.markers.length ? "Engir hápunktar dansins eru í þessum bút — valdi líflegasta kaflann" : "Valdi líflegasta kaflann. Merktu hápunkta í dansinum til að láta lagið hitta á þá.", 4500);
    }
    apply((a) => setRegion(a, selIndex, s, s + len, track.duration));
    fitRegion({ ...part, start: s, end: s + len }, track);
    setCursor(s);
  }
  function saveClip() {
    if (!part || !track) return;
    const name = window.prompt("Heiti á uppáhaldsbútnum:", `${track.name} ${formatTime(part.start)}–${formatTime(part.end)}`);
    if (!name?.trim()) return;
    onSaveClip({ id: newId(), songId: track.id, name: name.trim().slice(0, 60), start: part.start, end: part.end, at: Date.now() });
    say("Búturinn er kominn í uppáhald í safninu");
  }
  function zoom(k: number) {
    if (!track) return;
    const mid = view.t0 + view.span / 2;
    const s = clampViewport({ span: view.span * k, t0: 0 }, track.duration).span;
    setView(clampViewport({ span: s, t0: mid - s / 2 }, track.duration));
  }
  function splitHere() {
    const res = splitAt(arr, tRef.current, newId());
    if (!res) {
      say("Spilhausinn þarf að vera inni í bút, minnst hálfa sekúndu frá brún");
      return;
    }
    apply(res.arr);
    setSel(res.index);
  }
  function removeSelected() {
    if (!part) return;
    apply((a) => removePart(a, selIndex));
    setSel(Math.max(0, selIndex - 1));
  }
  function moveSelected(dir: 1 | -1) {
    const to = selIndex + dir;
    if (to < 0 || to >= arr.parts.length) return;
    apply((a) => movePart(a, selIndex, to));
    setSel(to);
  }
  function playSeam() {
    if (selIndex < 1) return;
    const at = lay.pos[selIndex];
    void playMix(Math.max(0, at - 3), Math.min(total, at + 3));
  }

  // ------------------------------------------------------------------ lög

  /** Bætir laginu í rútínuna (ef það er ekki þar fyrir) og nýjum bút úr því. */
  function addTrack(tv: TrackView, region?: { start: number; end: number }) {
    setTracks((ts) => (ts.some((t) => t.id === tv.id) ? ts : [...ts, tv]));
    apply((a) => {
      const p = defaultPart(a, tv);
      return addPart(a, region ? { ...p, start: region.start, end: Math.min(tv.duration, region.end) } : p);
    });
    setSel(Number.MAX_SAFE_INTEGER);
    setPanel("butur");
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    stopAll();
    for (const file of files) {
      setBusy(`Les ${file.name}…`);
      await breathe();
      try {
        addTrack(await importSong(file));
      } catch (err) {
        say(err instanceof Error ? err.message : `Gat ekki opnað ${file.name}`, 5000);
      }
    }
    setBusy("");
  }

  async function addFromLibrary(songId: string, region?: { start: number; end: number }) {
    setPicker(false);
    stopAll();
    setBusy("Opna lagið…");
    await breathe();
    try {
      addTrack(await openSong(songId), region);
    } catch (err) {
      say(err instanceof Error ? err.message : "Gat ekki opnað lagið", 5000);
    }
    setBusy("");
  }

  function addPartFrom(tv: TrackView) {
    apply((a) => addPart(a, defaultPart(a, tv)));
    setSel(Number.MAX_SAFE_INTEGER);
    setPanel("butur");
  }

  function removeTrackById(tv: TrackView) {
    const used = arr.parts.filter((p) => p.trackId === tv.id).length;
    if (used && !window.confirm(`Taka „${tv.name}“ og ${used === 1 ? "bútinn" : `${used} búta`} úr því úr rútínunni? Lagið verður áfram í safninu.`)) return;
    stopAll();
    apply((a) => removeTrack(a, tv.id));
    setTracks((ts) => ts.filter((t) => t.id !== tv.id));
  }

  // ------------------------------------------------------------------ hápunktar

  function addMarkerHere() {
    const t = modeRef.current === "mix" && playerRef.current ? playerRef.current.time : tRef.current;
    const id = newId();
    apply((a) => addMarker(a, t, "", id));
    setFocusMarker(id);
    say(`Hápunktur á ${formatTime(t, true)}`, 1600);
  }

  function hit(m: Marker) {
    const at = locate(arr, m.t);
    const tv = at ? trackMap.get(arr.parts[at.index].trackId) : undefined;
    if (!at || !tv || m.t > total) {
      say("Enginn bútur er undir þessum hápunkti");
      return;
    }
    const res = alignToMarker(arr, m.t, tv.analysis.accents, tv.duration);
    if (!res) {
      say("Fann ekkert skýrt slag í tónlistinni nálægt þessum stað");
      return;
    }
    if (Math.abs(res.delta) < 0.012) {
      say("Sterkt slag er þegar á þessum hápunkti");
    } else {
      apply(res.arr);
      setSel(res.index);
      say(
        `Tónlistin í bút ${res.index + 1} færð um ${res.delta > 0 ? "+" : "−"}${comma(Math.abs(res.delta), 2)} s — slagið lendir nú á ${formatTime(m.t, true)}`,
        4500,
      );
    }
    window.setTimeout(() => void playMix(Math.max(0, m.t - 2), Math.min(total, m.t + 2)), 60);
  }

  async function copyMarkers() {
    const text = arr.markers.map((m) => `${formatTime(m.t, true)}  ${m.label || "Hápunktur"}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      say("Listinn afritaður");
    } catch {
      say("Gat ekki afritað listann");
    }
  }

  // ------------------------------------------------------------------ lengd og skrá

  const lastPart = arr.parts[arr.parts.length - 1];
  const lastTrack = lastPart ? trackMap.get(lastPart.trackId) : undefined;
  const fitTarget = status.state === "long" ? arr.targetMax : arr.targetMin;
  const fit = status.state === "ok" ? null : fitTempo(arr, fitTarget);

  function trimLast() {
    if (!lastTrack) return;
    const next = trimToLength(arr, fitTarget, lastTrack.duration);
    if (Math.abs(totalLength(next) - fitTarget) > 0.06) {
      say(status.state === "long" ? "Síðasti búturinn er of stuttur til að taka alla styttinguna" : "Lagið er búið — síðasti búturinn nær ekki lengra");
    }
    apply(next);
  }

  const exportReady = exported && exported.key === `${format}|${aKey}` ? exported : null;

  async function makeFile() {
    if (!arr.parts.length) return;
    stopAll();
    setBusy("Blanda rútínuna…");
    try {
      const { mix } = await getMix();
      const seconds = Math.round(mix.channels[0].length / mix.sampleRate);
      const stem = `${safeFileName(name)}-${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
      let blob: Blob;
      let fileName: string;
      if (format === "wav") {
        setBusy("Bý til WAV…");
        await breathe();
        blob = new Blob([encodeWav(mix.channels, mix.sampleRate) as BlobPart], { type: "audio/wav" });
        fileName = `${stem}.wav`;
      } else {
        const mp3 = await encodeMp3(mix.channels, mix.sampleRate, format === "mp3-320" ? 320 : 192, (f) =>
          setBusy(`Bý til MP3… ${Math.round(f * 100)}%`),
        );
        blob = new Blob([mp3 as BlobPart], { type: "audio/mpeg" });
        fileName = `${stem}.mp3`;
      }
      setExported({ key: `${format}|${audioKey(arrRef.current)}`, blob, fileName });
      if (mix.gain < 1) say(`Lækkað um ${comma(-20 * Math.log10(mix.gain))} dB svo ekkert bjagist`, 4000);
    } catch (err) {
      say(err instanceof Error ? err.message : "Gat ekki búið til skrána", 5000);
    } finally {
      setBusy("");
    }
  }

  const shareFile = exportReady ? new File([exportReady.blob], exportReady.fileName, { type: exportReady.blob.type }) : null;
  const canShare =
    !!shareFile && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [shareFile] });

  async function share() {
    if (!shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: name });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) say("Gat ekki deilt — sæktu skrána í staðinn");
    }
  }

  // ------------------------------------------------------------------ lyklaborð

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (modeRef.current) stopAll();
        else void playMix();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ útlit

  const nudge = (label: string, value: number, change: (t: number) => void) => (
    <div className="tk-field">
      <span className="tk-label">{label}</span>
      <div className="tk-steps">
        <button type="button" onClick={() => change(stepTime(value, -1, true))} aria-label={`${label}: stórt skref til baka`}>«</button>
        <button type="button" onClick={() => change(stepTime(value, -1, false))} aria-label={`${label}: lítið skref til baka`}>‹</button>
        <output>{formatTime(value, true)}</output>
        <button type="button" onClick={() => change(stepTime(value, 1, false))} aria-label={`${label}: lítið skref áfram`}>›</button>
        <button type="button" onClick={() => change(stepTime(value, 1, true))} aria-label={`${label}: stórt skref áfram`}>»</button>
      </div>
    </div>
  );

  const bpmText = (tv: TrackView) =>
    tv.analysis.steady >= STEADY_ENOUGH && tv.analysis.bpm > 0 ? `≈ ${Math.round(tv.analysis.bpm)} slög/mín` : "óreglulegur taktur";

  const view$ = (
    <div className="tk-root tk-editor" role="dialog" aria-modal="true" aria-label="Tónklippa">
      <header className="tk-top">
        <button type="button" className="tk-iconbtn" onClick={() => void close()} aria-label="Loka og vista">
          <X size={22} />
        </button>
        <div className="tk-name-box">
          <input
            className="tk-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Heiti rútínu"
            aria-label="Heiti rútínu"
            maxLength={80}
          />
          <span className={`tk-saved ${saved === "error" ? "error" : saved === "saved" ? syncState : "saving"}`}>
            {skaterName ? `${skaterName.split(/\s+/)[0]} · ` : ""}
            {saved === "error"
              ? "Ekki vistað!"
              : saved === "saving"
                ? "Vista…"
                : !sync
                  ? "Vistað í tækinu"
                  : syncState === "synced"
                    ? "Vistað í skýinu"
                    : syncState === "syncing"
                      ? "Vistað · sendi í skýið…"
                      : "Vistað í tækinu · bíður eftir neti"}
          </span>
        </div>
        <div className={`tk-total ${status.state}`} title="Lengd rútínunnar og leyfileg mörk">
          <strong>{formatTime(total, true)}</strong>
          <span>
            {formatTime(arr.targetMin)}–{formatTime(arr.targetMax)}
          </span>
        </div>
        <button type="button" className="tk-iconbtn" onClick={undo} disabled={!hist.past.length} aria-label="Afturkalla">
          <Undo2 size={20} />
        </button>
        <button type="button" className="tk-iconbtn tk-redo" onClick={redo} disabled={!hist.future.length} aria-label="Endurgera">
          <Redo2 size={20} />
        </button>
      </header>

      <section className="tk-stage">
        {arr.parts.length ? (
          <TimelineView
            arr={arr}
            tracks={trackMap}
            trackIndex={trackIndex}
            sel={selIndex}
            span={span}
            playheadRef={headRef}
            onSeek={seek}
            onSelect={(i) => {
              setSel(i);
              if (panel === "log") setPanel("butur");
            }}
            onMarkerMove={(id, t) => apply((a) => updateMarker(a, id, { t }), `marker:${id}`)}
            onMarkerTap={(id) => {
              const m = arr.markers.find((x) => x.id === id);
              if (m) seek(m.t, true);
              setFocusMarker(id);
              setPanel("merki");
            }}
          />
        ) : (
          <div className="tk-empty">
            <p>Bættu við lagi til að byrja.</p>
            <button type="button" className="tk-cta small" onClick={() => fileRef.current?.click()}>
              <Plus size={18} /> Velja lag
            </button>
          </div>
        )}
        <div className="tk-transport">
          <button type="button" className="tk-round" onClick={() => seek(0, true)} aria-label="Fara í byrjun" disabled={!arr.parts.length}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            className="tk-round play"
            onClick={() => (playing === "mix" ? stopAll() : void playMix())}
            aria-label={playing === "mix" ? "Stöðva" : "Spila rútínuna"}
            disabled={!arr.parts.length}
          >
            {playing === "mix" ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
          </button>
          <div className="tk-clock" aria-live="off">
            <span ref={timeRef}>0:00,0</span>
            <small> / {formatTime(total, true)}</small>
            {working && <i className="tk-working" aria-label="Reikna" />}
          </div>
          <span className="tk-grow" />
          <button type="button" className="tk-btn flag" onClick={addMarkerHere} disabled={!arr.parts.length} title="Merkja hápunkt í dansinum hér">
            <Flag size={16} /> Hápunktur
          </button>
        </div>
      </section>

      <div className="tk-body">
        {panel === "butur" &&
          (part && track ? (
            <div className="tk-pane">
              <div className="tk-pane-head">
                <span className="tk-dot" style={{ background: color.wave }} />
                <strong>
                  Bútur {selIndex + 1} af {arr.parts.length}
                </strong>
                <span className="tk-muted tk-ellipsis">{track.name}</span>
                <span className="tk-grow" />
                <span className="tk-len">{formatTime(partLength(part), true)}</span>
              </div>
              <SourceView
                ref={srcRef}
                track={track}
                color={color}
                start={part.start}
                end={part.end}
                cursor={cursor}
                beats={snapOn ? beats : null}
                highlights={track.analysis.highlights}
                view={view}
                onView={setView}
                onCursor={(t) => {
                  setCursor(t);
                  if (modeRef.current === "source") playSource(t);
                }}
                onStart={changeStart}
                onEnd={changeEnd}
              />
              <div className="tk-row">
                <button type="button" className={`tk-btn${playing === "source" ? " on" : ""}`} onClick={toggleSource}>
                  {playing === "source" ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  {playing === "source" ? "Stöðva" : "Hlusta á lagið"}
                </button>
                <button type="button" className="tk-btn" onClick={startHere} title="Byrja bútinn þar sem bendillinn er">
                  Byrja hér
                </button>
                <button type="button" className="tk-btn" onClick={endHere} title="Enda bútinn þar sem bendillinn er">
                  Enda hér
                </button>
                <span className="tk-grow" />
                <button type="button" className="tk-btn icon" onClick={() => zoom(1.7)} aria-label="Minnka (sjá meira af laginu)">
                  <Minus size={18} />
                </button>
                <button type="button" className="tk-btn icon" onClick={() => zoom(1 / 1.7)} aria-label="Stækka">
                  <Plus size={18} />
                </button>
                <button type="button" className="tk-btn icon" onClick={() => fitRegion(part, track)} aria-label="Sýna bútinn allan">
                  <Maximize2 size={16} />
                </button>
              </div>
              <p className="tk-hint">
                Ýttu á bylgjuna til að setja bendilinn, dragðu til að fletta og klíptu til að stækka. Handföngin tvö afmarka kaflann
                sem er notaður. Gylltu þríhyrningarnir eru hápunktar lagsins.
              </p>

              {nudge("Byrjun", part.start, changeStart)}
              {nudge("Endir", part.end, changeEnd)}
              <div className="tk-field">
                <span className="tk-label">Renna</span>
                <div className="tk-steps">
                  <button type="button" onClick={() => slipBy(-1, true)} aria-label="Renna tónlistinni langt til baka">«</button>
                  <button type="button" onClick={() => slipBy(-1, false)} aria-label="Renna tónlistinni aðeins til baka">‹</button>
                  <output className="tk-muted">færa kaflann</output>
                  <button type="button" onClick={() => slipBy(1, false)} aria-label="Renna tónlistinni aðeins áfram">›</button>
                  <button type="button" onClick={() => slipBy(1, true)} aria-label="Renna tónlistinni langt áfram">»</button>
                </div>
              </div>
              <div className="tk-row">
                {beats ? (
                  <button type="button" className={`tk-chip${snapOn ? " on" : ""}`} role="switch" aria-checked={snapOn} onClick={() => setSnap((s) => !s)}>
                    Smella á takt ({bpmText(track)})
                  </button>
                ) : (
                  <span className="tk-muted">Enginn jafn taktur fannst í laginu — klippt frjálst.</span>
                )}
                <button type="button" className="tk-chip" onClick={bestHere}>
                  <Sparkles size={15} /> Besti kaflinn
                </button>
                <button type="button" className="tk-chip" onClick={saveClip}>
                  <Star size={15} /> Vista bút
                </button>
              </div>

              <div className="tk-field">
                <span className="tk-label">Hraði</span>
                <input
                  className="tk-range"
                  type="range"
                  min={Math.round(TEMPO_MIN * 100)}
                  max={Math.round(TEMPO_MAX * 100)}
                  step={1}
                  value={Math.round(part.tempo * 100)}
                  onChange={(e) => apply((a) => setTempo(a, selIndex, Number(e.target.value) / 100), `tempo:${part.id}`)}
                  aria-label="Hraði bútsins í prósentum"
                />
                <button
                  type="button"
                  className="tk-value"
                  onClick={() => apply((a) => setTempo(a, selIndex, 1))}
                  title="Setja aftur á 100%"
                  disabled={Math.abs(part.tempo - 1) < 0.001}
                >
                  {Math.round(part.tempo * 100)}%
                </button>
              </div>
              <div className="tk-field">
                <span className="tk-label">Styrkur</span>
                <input
                  className="tk-range"
                  type="range"
                  min={GAIN_MIN}
                  max={GAIN_MAX}
                  step={1}
                  value={part.gainDb}
                  onChange={(e) => apply((a) => setGain(a, selIndex, Number(e.target.value)), `gain:${part.id}`)}
                  aria-label="Hljóðstyrkur bútsins í desíbelum"
                />
                <button type="button" className="tk-value" onClick={() => apply((a) => setGain(a, selIndex, 0))} title="Setja aftur á 0 dB" disabled={part.gainDb === 0}>
                  {part.gainDb > 0 ? "+" : part.gainDb < 0 ? "−" : ""}
                  {Math.abs(part.gainDb)} dB
                </button>
              </div>

              {selIndex > 0 && (
                <div className="tk-seam">
                  <span className="tk-label">Samskeyti við bút {selIndex}</span>
                  <div className="tk-row">
                    {SEAMS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`tk-chip${Math.abs(part.xfade - s) < 0.01 ? " on" : ""}`}
                        onClick={() => apply((a) => setXfade(a, selIndex, s))}
                      >
                        {s === 0 ? "Hreinn skurður" : `${comma(s, s < 1 ? 1 : 0)} s`}
                      </button>
                    ))}
                  </div>
                  <span className="tk-label">Áhrifshljóð á samskeytunum</span>
                  <div className="tk-row">
                    {FX.map(([fx, label]) => (
                      <button key={label} type="button" className={`tk-chip${part.fx === fx ? " on" : ""}`} onClick={() => apply((a) => setFx(a, selIndex, fx))}>
                        {label}
                      </button>
                    ))}
                    <button type="button" className="tk-btn" onClick={playSeam}>
                      <Play size={15} fill="currentColor" /> Hlusta á samskeytin
                    </button>
                  </div>
                </div>
              )}

              <div className="tk-row tk-actions">
                <button type="button" className="tk-btn" onClick={() => void playMix(lay.pos[selIndex], lay.pos[selIndex] + lay.len[selIndex])}>
                  <Play size={15} fill="currentColor" /> Spila bútinn
                </button>
                <button type="button" className="tk-btn" onClick={splitHere}>
                  <SquareSplitHorizontal size={16} /> Kljúfa við spilhaus
                </button>
                <button
                  type="button"
                  className="tk-btn"
                  onClick={() => {
                    apply((a) => duplicatePart(a, selIndex, newId()));
                    setSel(selIndex + 1);
                  }}
                >
                  <Copy size={15} /> Afrita
                </button>
                <button type="button" className="tk-btn" onClick={() => moveSelected(-1)} disabled={selIndex === 0}>
                  <ArrowLeft size={16} /> Færa
                </button>
                <button type="button" className="tk-btn" onClick={() => moveSelected(1)} disabled={selIndex >= arr.parts.length - 1}>
                  Færa <ArrowRight size={16} />
                </button>
                <button type="button" className="tk-btn danger" onClick={removeSelected}>
                  <Trash2 size={15} /> Eyða bút
                </button>
              </div>
            </div>
          ) : (
            <div className="tk-pane">
              <p className="tk-muted">Enginn bútur enn. Farðu í „Lög“ og bættu við lagi eða nýjum bút.</p>
            </div>
          ))}

        {panel === "log" && (
          <div className="tk-pane">
            {tracks.map((tv, i) => {
              const used = arr.parts.filter((p) => p.trackId === tv.id).length;
              return (
                <div className="tk-track" key={tv.id}>
                  <span className="tk-dot" style={{ background: trackColor(i).wave }} />
                  <div className="tk-track-text">
                    <strong className="tk-ellipsis">{tv.name}</strong>
                    <span>
                      {formatTime(tv.duration)} · {bpmText(tv)} · {used === 1 ? "1 bútur" : `${used} bútar`}
                    </span>
                  </div>
                  <button type="button" className="tk-btn" onClick={() => addPartFrom(tv)}>
                    <Plus size={16} /> Bútur
                  </button>
                  <button type="button" className="tk-btn icon danger" onClick={() => removeTrackById(tv)} aria-label={`Fjarlægja lagið ${tv.name}`}>
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
            <button type="button" className="tk-cta" onClick={() => setPicker(true)}>
              <Library size={18} /> Bæta við úr safninu
            </button>
            <div className="tk-cta-row">
              <button type="button" className="tk-cta ghost" onClick={() => fileRef.current?.click()}>
                <Music size={18} /> Ný skrá
              </button>
              <button type="button" className="tk-cta ghost" onClick={() => videoRef.current?.click()}>
                <Film size={18} /> Lag úr myndbandi
              </button>
            </div>
            <p className="tk-hint">
              MP3, M4A, WAV og fleiri snið — eða hljóðið úr myndbandi (t.d. skjáupptöku). Ný lög fara líka í safnið þitt, svo þú
              getur notað þau aftur. Hver bútur er kafli úr einu lagi; sama lagið má nota í marga búta.
            </p>
          </div>
        )}

        {panel === "merki" && (
          <div className="tk-pane">
            <p className="tk-hint">
              Merktu staðina í dansinum þar sem eitthvað gerist — stökk, snúningur, lokastaða. Ýttu á „Hápunktur“ á meðan þú
              hlustar. „Hitta“ rennir tónlistinni örlítið svo sterkt slag lendi nákvæmlega á hápunktinum; lengd rútínunnar breytist
              ekki.
            </p>
            {arr.markers.length === 0 && <p className="tk-muted">Engir hápunktar enn.</p>}
            {arr.markers.map((m) => (
              <div className={`tk-marker${focusMarker === m.id ? " focus" : ""}`} key={m.id}>
                <input
                  key={`${m.id}:${m.t.toFixed(2)}`}
                  className="tk-time"
                  defaultValue={formatTime(m.t, true)}
                  inputMode="decimal"
                  aria-label="Tími hápunkts"
                  onBlur={(e) => {
                    const t = parseTime(e.target.value);
                    if (t == null) e.target.value = formatTime(m.t, true);
                    else if (Math.abs(t - m.t) > 0.04) apply((a) => updateMarker(a, m.id, { t }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                <ElementField value={m.label} onChange={(label) => apply((a) => updateMarker(a, m.id, { label }), `label:${m.id}`)} />
                <button type="button" className="tk-btn icon danger" onClick={() => apply((a) => removeMarker(a, m.id))} aria-label="Eyða hápunkti">
                  <Trash2 size={17} />
                </button>
                <div className="tk-marker-actions">
                  <button type="button" className="tk-btn" onClick={() => void playMix(Math.max(0, m.t - 2), Math.min(total, m.t + 3))}>
                    <Play size={15} fill="currentColor" /> Hlusta
                  </button>
                  <button type="button" className="tk-btn" onClick={() => hit(m)} title="Láta sterkt slag í tónlistinni lenda á hápunktinum">
                    <Target size={16} /> Hitta
                  </button>
                </div>
              </div>
            ))}
            <div className="tk-row">
              <button type="button" className="tk-btn" onClick={addMarkerHere} disabled={!arr.parts.length}>
                <Flag size={16} /> Nýr hápunktur við spilhausinn
              </button>
              {arr.markers.length > 0 && (
                <button type="button" className="tk-btn" onClick={() => void copyMarkers()}>
                  <Copy size={15} /> Afrita lista
                </button>
              )}
            </div>
          </div>
        )}

        {panel === "myndband" && (
          <div className="tk-pane">
            {videoId && videoUrl ? (
              <>
                <video
                  ref={danceEl}
                  className="tk-dance"
                  src={videoUrl}
                  muted={!videoSound}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    setVideoLen(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);
                    placeHead(tRef.current);
                  }}
                />
                <p className="tk-hint">
                  Ýttu á ▶ hér fyrir ofan: upptakan spilast með nýju tónlistinni. Ýttu á „Hápunktur“ þegar eitthvað gerist í dansinum,
                  og sjáðu hvort slögin í laginu lenda á réttum stað.
                </p>
                <div className="tk-field">
                  <span className="tk-label">Dansinn byrjar</span>
                  <input
                    className="tk-range"
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(videoLen * 10) / 10)}
                    step={0.1}
                    value={Math.min(videoOffset, videoLen || videoOffset)}
                    onChange={(e) => setVideoOffset(Number(e.target.value))}
                    aria-label="Hvar í myndbandinu dansinn byrjar"
                  />
                  <span className="tk-value plain">{formatTime(videoOffset, true)}</span>
                </div>
                <div className="tk-row">
                  <button type="button" className="tk-btn" onClick={() => setVideoOffset((o) => Math.max(0, Math.round((o - 0.1) * 10) / 10))}>
                    − 0,1 s
                  </button>
                  <button type="button" className="tk-btn" onClick={() => setVideoOffset((o) => Math.round((o + 0.1) * 10) / 10)}>
                    + 0,1 s
                  </button>
                  <button type="button" className={`tk-chip${videoSound ? " on" : ""}`} role="switch" aria-checked={videoSound} onClick={() => setVideoSound((s) => !s)}>
                    Hljóðið úr myndbandinu
                  </button>
                </div>
                {videoMeta && videoMeta.size > MAX_CLOUD_BYTES && <p className="tk-muted">Myndbandið er yfir {MAX_CLOUD_LABEL} og er því bara geymt í þessu tæki.</p>}
                <div className="tk-row tk-actions">
                  <button type="button" className="tk-btn" onClick={() => danceInput.current?.click()}>
                    <Video size={16} /> Skipta um myndband
                  </button>
                  <button type="button" className="tk-btn danger" onClick={detachVideo}>
                    <Trash2 size={15} /> Taka úr rútínunni
                  </button>
                </div>
              </>
            ) : videoId && videoMeta && videoUrl === undefined ? (
              <p className="tk-muted">Sæki myndbandið…</p>
            ) : (
              <>
                {videoId && (
                  <p className="tk-status long">
                    Upptakan er ekki í þessu tæki{videoMeta && videoMeta.size > MAX_CLOUD_BYTES ? " (hún var of stór fyrir skýið)" : ""}.
                  </p>
                )}
                <p className="tk-hint">
                  Taktu upp dansinn (eða veldu upptöku) og horfðu á hann með nýju tónlistinni undir. Þá sérðu strax hvort slögin lenda á
                  stökkunum, og getur merkt hápunktana á meðan þú horfir.
                </p>
                <button type="button" className="tk-cta" onClick={() => danceInput.current?.click()}>
                  <Video size={20} /> Velja eða taka upp myndband
                </button>
              </>
            )}
          </div>
        )}

        {panel === "vista" && (
          <div className="tk-pane">
            <h3>Lengd</h3>
            <div className="tk-field">
              <span className="tk-label">Má vera</span>
              <input
                key={`min:${arr.targetMin}`}
                className="tk-time"
                defaultValue={formatTime(arr.targetMin)}
                aria-label="Stysta leyfilega lengd"
                onBlur={(e) => {
                  const v = parseTime(e.target.value);
                  if (v == null || v < 5) e.target.value = formatTime(arr.targetMin);
                  else apply((a) => ({ ...a, targetMin: Math.min(v, 1200), targetMax: Math.max(a.targetMax, Math.min(v, 1200)) }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="tk-muted">til</span>
              <input
                key={`max:${arr.targetMax}`}
                className="tk-time"
                defaultValue={formatTime(arr.targetMax)}
                aria-label="Lengsta leyfilega lengd"
                onBlur={(e) => {
                  const v = parseTime(e.target.value);
                  if (v == null || v < 5) e.target.value = formatTime(arr.targetMax);
                  else apply((a) => ({ ...a, targetMax: Math.min(v, 1200), targetMin: Math.min(a.targetMin, Math.min(v, 1200)) }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="tk-muted">(mín:sek)</span>
            </div>
            <p className={`tk-status ${status.state}`}>
              {!arr.parts.length
                ? "Engin tónlist enn."
                : status.state === "ok"
                  ? `Rútínan er ${formatTime(total, true)} — innan marka.`
                  : `Rútínan er ${formatTime(total, true)} — ${comma(status.diff)} sek of ${status.state === "long" ? "löng" : "stutt"}.`}
            </p>
            {status.state !== "ok" && arr.parts.length > 0 && (
              <div className="tk-row">
                <button type="button" className="tk-btn" onClick={trimLast}>
                  {status.state === "long" ? "Stytta síðasta bútinn" : "Lengja síðasta bútinn"}
                </button>
                <button
                  type="button"
                  className="tk-btn"
                  disabled={!fit?.ok}
                  onClick={() => fit && apply(fit.arr)}
                  title={fit?.ok ? "Tónhæðin helst óbreytt" : "Munurinn er of mikill til að laga með hraða einum"}
                >
                  {status.state === "long" ? "Hraða" : "Hægja á"} öllu um {fit ? comma(Math.abs(fit.factor - 1) * 100) : "0"}%
                </button>
              </div>
            )}

            <h3>Byrjun og endir</h3>
            <div className="tk-field">
              <span className="tk-label">Mjúk byrjun</span>
              <input
                className="tk-range"
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={arr.fadeIn}
                onChange={(e) => apply((a) => ({ ...a, fadeIn: Number(e.target.value) }), "fadeIn")}
                aria-label="Mjúk byrjun í sekúndum"
              />
              <span className="tk-value plain">{arr.fadeIn ? `${comma(arr.fadeIn)} s` : "af"}</span>
            </div>
            <div className="tk-field">
              <span className="tk-label">Mjúkur endir</span>
              <input
                className="tk-range"
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={arr.fadeOut}
                onChange={(e) => apply((a) => ({ ...a, fadeOut: Number(e.target.value) }), "fadeOut")}
                aria-label="Mjúkur endir í sekúndum"
              />
              <span className="tk-value plain">{arr.fadeOut ? `${comma(arr.fadeOut)} s` : "af"}</span>
            </div>

            <h3>Vista skrá</h3>
            <div className="tk-row" role="radiogroup" aria-label="Skráarsnið">
              {(
                [
                  ["mp3-192", "MP3"],
                  ["mp3-320", "MP3 (hæstu gæði)"],
                  ["wav", "WAV"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={format === id} className={`tk-chip${format === id ? " on" : ""}`} onClick={() => setFormat(id)}>
                  {label}
                </button>
              ))}
            </div>
            {exportReady ? (
              <div className="tk-export">
                <strong>{exportReady.fileName}</strong>
                <span className="tk-muted">{comma(exportReady.blob.size / 1024 / 1024)} MB · tilbúin</span>
                {/* Í síma (iPhone) er deiliblaðið öruggasta leiðin: Vista í Skrár, AirDrop, skilaboð. */}
                <div className="tk-cta-row">
                  {canShare && (
                    <button type="button" className="tk-cta" onClick={() => void share()}>
                      <Share size={18} /> Vista eða senda
                    </button>
                  )}
                  <button type="button" className={`tk-cta${canShare ? " ghost" : ""}`} onClick={() => saveBlob(exportReady.blob, exportReady.fileName)}>
                    <Download size={18} /> Sækja
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="tk-cta" onClick={() => void makeFile()} disabled={!arr.parts.length || !!busy}>
                Búa til skrá
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="tk-tabs" aria-label="Spjöld">
        {(
          [
            ["butur", Scissors, "Bútur"],
            ["log", Music, "Lög"],
            ["merki", Flag, "Hápunktar"],
            ["myndband", Video, "Myndband"],
            ["vista", Download, "Vista"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button key={id} type="button" className={panel === id ? "on" : ""} aria-current={panel === id ? "page" : undefined} onClick={() => setPanel(id)}>
            <Icon size={21} aria-hidden="true" />
            {label}
            {id === "merki" && arr.markers.length > 0 && <b>{arr.markers.length}</b>}
          </button>
        ))}
      </nav>

      <input
        ref={fileRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />
      <input
        ref={danceInput}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void attachVideo(file);
        }}
      />
      {picker && (
        <SongPicker
          title="Bæta við úr safninu"
          songs={songs}
          clips={clips}
          onSong={(song) => void addFromLibrary(song.id)}
          onClip={(clip) => void addFromLibrary(clip.songId, { start: clip.start, end: clip.end })}
          onClose={() => setPicker(false)}
        />
      )}
      {toast && (
        <div className="tk-toast" role="status">
          {toast}
        </div>
      )}
      {busy && (
        <div className="tk-busy" role="status">
          <span className="tk-spinner" />
          <span>{busy}</span>
        </div>
      )}
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(view$, document.body);
}
