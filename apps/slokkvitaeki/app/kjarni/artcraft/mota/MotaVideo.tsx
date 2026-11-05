"use client";

/** Myndbandshamur Móta — sama útlit og myndahamurinn: myndbandið á öllum
 *  skjánum, tímalína með bútum, tól neðst.
 *
 *  - „Hreyfa mynd“ býr til fyrsta bút úr myndinni (Wan 2.2 eða Kling 2.1).
 *  - „Framhald héðan“ tekur rammann þar sem spilunarhausinn er (sjálfgefið
 *    sekúndu fyrir enda), klippir þar og bætir nýjum bút við — fyrsta ramma
 *    hans er sleppt svo hann komi ekki tvisvar við samskeytin.
 *  - „Klippa hér“, „Eyða bút“, afturkalla/endurgera, „Mynd úr ramma“ og
 *    „Vista“ (samsett í eitt myndband í vafranum). */

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import SendTo from "../SendTo";
import { uploadForReplicate } from "../uploadToStorage";
import { DEFAULT_WAN_SETTINGS, generateWanVideo } from "../skyjahreyfimynd/wan";
import { DEFAULT_KLING_SETTINGS, generateKlingVideo } from "../skyjahreyfimynd/kling";
import { extractFrameAt, loadVideoMeta, reframeImage, seekVideo, stitchSegments } from "../video/frames";
import { continueAt, defaultContinueTime, formatSeconds, globalTime, locate, segmentLength, totalLength, type Segment } from "../video/timeline";
import {
  ASPECT_CHOICES,
  LENGTHS,
  expectedSeconds,
  lengthsFor,
  nearestAspect,
  outputFps,
  reframePlan,
  type AspectId,
  type FitMode,
  type VideoModelId,
  VIDEO_PROMPTS_KEY,
  defaultVideoPromptSlots,
  normalizeVideoPromptSlots,
  type VideoPromptSlot,
} from "../video/presets";
import { throttleDelaySeconds } from "./aiPresets";
import { motaFileName } from "./detail";
import { Icon } from "./icons";
import "./editor.css";

type VClip = Segment & { id: string; blob: Blob; url: string; thumb: string; prompt: string };

export type MotaVideoProps = {
  active: boolean;
  initialImage?: Blob | null;
  initialVideo?: Blob | null;
  name: string;
  onClose: () => void;
  /** Skipta yfir í myndaham, með ramma úr myndbandinu ef hann fylgir. */
  onImageMode: (frame?: Blob) => void;
};

type Panel = "create" | "export" | null;

let clipCounter = 0;

async function makeClip(blob: Blob, prompt: string): Promise<VClip> {
  const meta = await loadVideoMeta(blob);
  const thumbBlob = await extractFrameAt(blob, Math.min(0.2, meta.duration / 2), "image/jpeg", 0.7).catch(() => null);
  return {
    id: `c${++clipCounter}`,
    blob,
    url: URL.createObjectURL(blob),
    thumb: thumbBlob ? URL.createObjectURL(thumbBlob) : "",
    prompt,
    duration: meta.duration,
    inT: 0,
    outT: meta.duration,
  };
}

function waitLoaded(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error("Gat ekki spilað bútinn"));
    };
    const cleanup = () => {
      v.removeEventListener("loadeddata", ok);
      v.removeEventListener("error", bad);
    };
    v.addEventListener("loadeddata", ok);
    v.addEventListener("error", bad);
  });
}

export default function MotaVideo({ active, initialImage, initialVideo, name, onClose, onImageMode }: MotaVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [clips, setClipsState] = useState<VClip[]>([]);
  const clipsRef = useRef<VClip[]>([]);
  const pastRef = useRef<VClip[][]>([]);
  const futureRef = useRef<VClip[][]>([]);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const shownIdRef = useRef<string | null>(null);
  const seekingRef = useRef(false);
  const wantRef = useRef(0);
  const [panel, setPanel] = useState<Panel>(initialVideo ? null : "create");
  // Fimm eigin hreyfiprompt (breytanleg, vistuð í vafranum). Reiturinn sýnir
  // virka hólfið og hver breyting vistast í það.
  const [slots, setSlots] = useState<VideoPromptSlot[]>(defaultVideoPromptSlots);
  const [activeSlot, setActiveSlot] = useState(0);
  const [editingLabel, setEditingLabel] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIDEO_PROMPTS_KEY);
      if (raw) setSlots(normalizeVideoPromptSlots(JSON.parse(raw)));
    } catch {
      /* vafri án geymslu — sjálfgefin hólf */
    }
  }, []);
  function updateSlot(i: number, patch: Partial<VideoPromptSlot>) {
    setSlots((prev) => {
      const next = prev.map((sl, j) => (j === i ? { ...sl, ...patch } : sl));
      try {
        window.localStorage.setItem(VIDEO_PROMPTS_KEY, JSON.stringify(next));
      } catch {
        /* geymsla full eða lokuð */
      }
      return next;
    });
  }
  const prompt = slots[activeSlot]?.prompt ?? "";
  const [model, setModel] = useState<VideoModelId>("wan");
  const [lengthId, setLengthId] = useState("wan5");
  const [resolution, setResolution] = useState<"720p" | "480p">("720p");
  const [busy, setBusy] = useState<string | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);
  const runRef = useRef(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exported, setExported] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  // Hlutföll myndbandsins: myndin er klippt (eða fyllt) í valið hlutfall áður
  // en hún fer á Wan/Kling — líkönin fylgja hlutföllum myndarinnar.
  const [aspectId, setAspectId] = useState<AspectId>("orig");
  const [fit, setFit] = useState<FitMode>("cover");
  const [framedUrl, setFramedUrl] = useState("");
  const dirtyRef = useRef(false);
  const closingRef = useRef<null | (() => void)>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const total = totalLength(clips);

  function setClips(next: VClip[]) {
    clipsRef.current = next;
    setClipsState(next);
    setExported(null);
  }

  function commit(next: VClip[]) {
    pastRef.current.push(clipsRef.current);
    futureRef.current = [];
    setClips(next);
    dirtyRef.current = true;
  }

  function showToast(text: string, ms = 3000) {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), ms);
  }

  // Byrjunarmynd (Hreyfa mynd) eða byrjunarmyndband.
  useEffect(() => {
    if (initialImage) {
      const u = URL.createObjectURL(initialImage);
      setImageUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [initialImage]);

  // Forsýn af rammanum með völdu hlutfalli.
  useEffect(() => {
    const ratio = ASPECT_CHOICES.find((a) => a.id === aspectId)?.ratio ?? null;
    if (!initialImage || !ratio) {
      setFramedUrl("");
      return;
    }
    let alive = true;
    let url = "";
    void reframeImage(initialImage, (w, h) => reframePlan(w, h, ratio, fit, 1024), "image/jpeg", 0.85)
      .then((r) => {
        if (!alive) return;
        url = URL.createObjectURL(r.blob);
        setFramedUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [initialImage, aspectId, fit]);

  useEffect(() => {
    if (!initialVideo) return;
    let alive = true;
    void makeClip(initialVideo, "")
      .then((c) => {
        if (!alive) return;
        setClips([c]);
        void showAt(defaultContinueTime(c.duration));
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Gat ekki opnað myndbandið"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideo]);

  // Bakk-takki (Android) og skrunlás meðan hamurinn er virkur.
  useEffect(() => {
    if (!active) {
      pause();
      return;
    }
    window.history.pushState({ motaVideo: true }, "");
    const onPop = () => {
      if (!activeRef.current) return;
      const next = closingRef.current;
      closingRef.current = null;
      if (next) next();
      else void toImageMode();
    };
    window.addEventListener("popstate", onPop);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      html.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /** Fer af þessum ham í gegnum history.back() svo bakk-sagan haldist rétt. */
  function leave(action: () => void) {
    if (window.history.state?.motaVideo) {
      closingRef.current = action;
      window.history.back();
    } else action();
  }

  // ------------------------------------------------------------------ spilun

  async function loadClipAt(index: number, local: number) {
    const v = videoRef.current;
    const c = clipsRef.current[index];
    if (!v || !c) return;
    if (shownIdRef.current !== c.id) {
      shownIdRef.current = c.id;
      v.src = c.url;
      await waitLoaded(v);
    }
    await seekVideo(v, local);
  }

  /** Sýnir rammann á tíma `time` (ein leit í einu; nýjasta gildið vinnur). */
  async function showAt(time: number) {
    const cl = clipsRef.current;
    const clamped = Math.max(0, Math.min(totalLength(cl), time));
    tRef.current = clamped;
    setT(clamped);
    wantRef.current = clamped;
    if (seekingRef.current || cl.length === 0) return;
    seekingRef.current = true;
    try {
      while (true) {
        const target = wantRef.current;
        const { index, local } = locate(clipsRef.current, target);
        await loadClipAt(index, local);
        if (wantRef.current === target) break;
      }
    } catch {
      /* forsýn */
    } finally {
      seekingRef.current = false;
    }
  }

  function pause() {
    playingRef.current = false;
    setPlaying(false);
    videoRef.current?.pause();
  }

  async function play() {
    const cl = clipsRef.current;
    const v = videoRef.current;
    if (!v || cl.length === 0) return;
    if (tRef.current >= totalLength(cl) - 0.05) tRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    const start = locate(cl, tRef.current);
    let index = start.index;
    await loadClipAt(index, start.local);
    if (!playingRef.current) return;
    await v.play().catch(() => {});
    let lastUi = 0;
    const tick = async () => {
      if (!playingRef.current) return;
      const list = clipsRef.current;
      const c = list[index];
      if (!c) return pause();
      const now = v.currentTime;
      tRef.current = globalTime(list, index, now);
      if (performance.now() - lastUi > 66) {
        lastUi = performance.now();
        setT(tRef.current);
      }
      if (v.ended || now >= c.outT - 0.02) {
        if (index + 1 < list.length) {
          index += 1;
          await loadClipAt(index, list[index].inT);
          if (!playingRef.current) return;
          await v.play().catch(() => {});
        } else {
          tRef.current = totalLength(list);
          setT(tRef.current);
          pause();
          return;
        }
      }
      requestAnimationFrame(() => void tick());
    };
    requestAnimationFrame(() => void tick());
  }

  function scrubFrom(e: RPointerEvent<HTMLDivElement>) {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || total <= 0) return;
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (playingRef.current) pause();
    void showAt(f * total);
  }

  function stepFrame(dir: 1 | -1) {
    pause();
    void showAt(tRef.current + dir / 16);
  }

  // ------------------------------------------------------------------ búa til

  const length = LENGTHS.find((l) => l.id === lengthId) ?? lengthsFor(model)[0];

  async function generate(kind: "start" | "continue") {
    if (busy) return;
    const run = ++runRef.current;
    const status = (text: string) => {
      if (runRef.current === run) setBusy(text);
    };
    setBusyCancel(true);
    status("Undirbý…");
    pause();
    try {
      const cl = clipsRef.current;
      const at = tRef.current;
      let frame: Blob;
      if (kind === "start") {
        if (!initialImage) throw new Error("Engin mynd til að hreyfa");
        const ratio = ASPECT_CHOICES.find((a) => a.id === aspectId)?.ratio ?? null;
        frame = ratio
          ? (await reframeImage(initialImage, (w, h) => reframePlan(w, h, ratio, fit, 1920), "image/jpeg", 0.93)).blob
          : initialImage;
      } else {
        const { index, local } = locate(cl, at);
        status(`Tek rammann á ${formatSeconds(at)} s…`);
        frame = await extractFrameAt(cl[index].blob, local, "image/jpeg", 0.95);
      }
      const bmp = await createImageBitmap(frame);
      const aspect = nearestAspect(bmp.width, bmp.height);
      bmp.close();
      status("Sendi rammann…");
      const imageUrl = await uploadForReplicate(frame, "reference-images");
      const onStatus = (p: { status?: string; elapsedSeconds?: number; percent?: number }) =>
        status(
          `${model === "kling" ? "Kling 2.1" : "Wan 2.2"} býr til ${formatSeconds(expectedSeconds(length))} s bút… ` +
            (p.percent != null ? `${Math.round(p.percent)}% · ` : "") +
            `${Math.round(p.elapsedSeconds ?? 0)} s`,
        );
      let blob: Blob | null = null;
      for (let attempt = 0; !blob; attempt++) {
        try {
          blob =
            model === "kling"
              ? await generateKlingVideo(
                  { ...DEFAULT_KLING_SETTINGS, prompt: prompt.trim(), duration: length.duration ?? 5, aspectRatio: aspect },
                  imageUrl,
                  { onStatus },
                )
              : await generateWanVideo(
                  {
                    ...DEFAULT_WAN_SETTINGS,
                    prompt: prompt.trim(),
                    numFrames: length.numFrames ?? 81,
                    framesPerSecond: length.fps ?? 16,
                    interpolateOutput: !!length.interpolate,
                    resolution,
                    aspectRatio: aspect,
                  },
                  imageUrl,
                  { onStatus },
                );
        } catch (err) {
          const wait = throttleDelaySeconds(err instanceof Error ? err.message : String(err));
          if (wait == null || attempt >= 3) throw err;
          for (let left = wait; left > 0; left--) {
            if (runRef.current !== run) return;
            status(`Replicate biður um bið (lítil inneign) — reyni aftur eftir ${left} sek…`);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        if (runRef.current !== run) return;
      }
      status("Opna bútinn…");
      const clip = await makeClip(blob, prompt.trim());
      if (runRef.current !== run) return;
      const next = kind === "start" ? [clip] : continueAt(clipsRef.current, at, clip, outputFps(length));
      commit(next);
      setPanel(null);
      // Spila frá 1,5 s fyrir samskeytin svo framhaldið sjáist strax.
      const seam = globalTime(next, next.length - 1, next[next.length - 1].inT);
      tRef.current = Math.max(0, seam - (kind === "start" ? 0 : 1.5));
      showToast(kind === "start" ? "Bútur tilbúinn" : `Framhald komið — klippt við ${formatSeconds(at)} s`);
      void play();
    } catch (err) {
      if (runRef.current === run) {
        const msg = err instanceof Error ? err.message : "Mistókst";
        showToast(
          throttleDelaySeconds(msg) != null
            ? "Replicate takmarkar köll núna (inneign undir $5). Bíddu smá og reyndu aftur, eða bættu inneign á Replicate."
            : msg,
          7000,
        );
      }
    } finally {
      if (runRef.current === run) {
        setBusy(null);
        setBusyCancel(false);
      }
    }
  }

  function stopWaiting() {
    runRef.current++;
    setBusy(null);
    setBusyCancel(false);
    showToast("Hætt að bíða — Replicate klárar samt bútinn og rukkar fyrir hann");
  }

  // ------------------------------------------------------------------ klippa

  function trimHere() {
    const cl = clipsRef.current;
    if (cl.length === 0) return;
    const { index, local } = locate(cl, tRef.current);
    if (local - cl[index].inT < 0.1) {
      showToast("Færðu spilunarhausinn aftar — of lítið eftir af bútnum");
      return;
    }
    commit(cl.slice(0, index + 1).map((c, i) => (i === index ? { ...c, outT: local } : c)));
    void showAt(totalLength(clipsRef.current));
    showToast(`Klippt við ${formatSeconds(tRef.current)} s`);
  }

  function deleteClip() {
    const cl = clipsRef.current;
    if (cl.length === 0) return;
    const { index } = locate(cl, tRef.current);
    const next = cl.filter((_, i) => i !== index);
    commit(next);
    shownIdRef.current = null;
    void showAt(Math.min(tRef.current, totalLength(next)));
  }

  function undo() {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(clipsRef.current);
    setClips(prev);
    shownIdRef.current = null;
    void showAt(Math.min(tRef.current, totalLength(prev)));
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(clipsRef.current);
    setClips(next);
    shownIdRef.current = null;
    void showAt(Math.min(tRef.current, totalLength(next)));
  }

  // ------------------------------------------------------------------ vista

  async function exportVideo(): Promise<Blob> {
    if (exported) return exported;
    const cl = clipsRef.current;
    if (cl.length === 0) throw new Error("Ekkert myndband");
    const only = cl.length === 1 && cl[0].inT <= 0.001 && cl[0].outT >= cl[0].duration - 0.001;
    if (only) return cl[0].blob;
    pause();
    setBusy("Set myndbandið saman…");
    try {
      const { blob } = await stitchSegments(
        cl.map((c) => ({ blob: c.blob, inT: c.inT, outT: c.outT })),
        (f) => setBusy(`Set myndbandið saman… ${Math.round(f * 100)}%`),
      );
      setExported(blob);
      return blob;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    try {
      const blob = await exportVideo();
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Nýtt nafn í hvert sinn — áður skrifaði hver vistun yfir þá síðustu.
      a.download = motaFileName(name || "myndband", ext);
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      dirtyRef.current = false;
      showToast(`Vistað · ${formatSeconds(total)} s`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Vistun mistókst");
    }
  }

  async function frameToImage() {
    const cl = clipsRef.current;
    try {
      if (cl.length === 0) {
        leave(() => onImageMode());
        return;
      }
      const { index, local } = locate(cl, tRef.current);
      const frame = await extractFrameAt(cl[index].blob, local, "image/png", 1);
      leave(() => onImageMode(frame));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gat ekki tekið ramma");
    }
  }

  function toImageMode() {
    // Bakk eða „Mynd“: aftur í myndaham án þess að taka ramma.
    onImageMode();
  }

  function requestClose() {
    if (dirtyRef.current && !window.confirm("Loka? Myndband sem ekki hefur verið vistað tapast.")) return;
    leave(onClose);
  }

  // ------------------------------------------------------------------ útlit

  const located = clips.length ? locate(clips, t) : null;
  const atEnd = located ? clips[located.index].outT - located.local : 0;
  const tools: Array<{ id: string; label: string; icon: string; hint: string; disabled?: boolean; run: () => void }> = [
    ...(clips.length === 0
      ? [{ id: "start", label: "Hreyfa mynd", icon: "sparkle", hint: "Búa til myndband úr myndinni", disabled: !initialImage, run: () => setPanel("create") }]
      : [{ id: "continue", label: "Framhald héðan", icon: "redo", hint: "Nýr bútur sem byrjar á rammanum þar sem spilunarhausinn er", run: () => setPanel("create") }]),
    { id: "trim", label: "Klippa hér", icon: "scissors", hint: "Allt á eftir spilunarhausnum dettur út", disabled: clips.length === 0, run: trimHere },
    { id: "delete", label: "Eyða bút", icon: "close", hint: "Eyðir bútnum þar sem spilunarhausinn er", disabled: clips.length === 0, run: deleteClip },
    { id: "frame", label: "Mynd úr ramma", icon: "image", hint: "Opnar rammann í myndaham", disabled: clips.length === 0, run: () => void frameToImage() },
    { id: "save", label: "Vista", icon: "download", hint: "Setur bútana saman í eitt myndband", disabled: clips.length === 0, run: () => void save() },
  ];

  const ui = (
    <div className="mx-root" style={{ display: active ? undefined : "none" }} role="application" aria-label="Móta — myndbandshamur">
      <header className="mx-top">
        <button type="button" className="mx-icon-btn" onClick={requestClose} aria-label="Loka">
          <Icon name="back" />
        </button>
        <div className="mx-mode" role="tablist" aria-label="Hamur">
          <button type="button" role="tab" aria-selected={false} onClick={() => void frameToImage()}>
            Mynd
          </button>
          <button type="button" role="tab" aria-selected className="on">
            Myndband
          </button>
        </div>
        <div className="mx-spacer" />
        <button type="button" className="mx-save" onClick={() => void save()} disabled={!!busy || clips.length === 0}>
          Vista
        </button>
        <button type="button" className="mx-icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Fleira" aria-expanded={menuOpen}>
          <Icon name="more" />
        </button>
        {menuOpen && (
          <div className="mx-menu" role="menu">
            <div className="mx-menu-send">
              {exported ? (
                <SendTo blob={exported} mediaType="video" sourceTool="mota" sourceToolName="Móta" name={`${name.replace(/\.[^.]+$/, "")}-mota.mp4`} />
              ) : (
                <button type="button" role="menuitem" disabled={clips.length === 0} onClick={() => void exportVideo().catch((e) => showToast(String(e)))}>
                  Senda í annað tól…
                </button>
              )}
            </div>
            <button type="button" role="menuitem" onClick={requestClose}>
              Loka
            </button>
          </div>
        )}
      </header>

      <div className="mx-stage mv-stage" onPointerDown={() => setMenuOpen(false)}>
        {clips.length > 0 ? (
          <video
            ref={videoRef}
            className="mv-video"
            muted
            playsInline
            preload="auto"
            onClick={() => (playing ? pause() : void play())}
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="mv-video" src={framedUrl || imageUrl} alt="Myndin sem á að hreyfa" />
        ) : (
          <video ref={videoRef} className="mv-video" muted playsInline />
        )}
        {clips.length > 0 && !playing && !busy && (
          <button type="button" className="mv-play" onClick={() => void play()} aria-label="Spila">
            ▶
          </button>
        )}
        {toast && <div className="mx-toast">{toast}</div>}
        {clips.length > 0 && (
          <div className="mx-float left" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={undo} disabled={!pastRef.current.length || !!busy} aria-label="Afturkalla">
              <Icon name="undo" size={22} />
            </button>
            <button type="button" onClick={redo} disabled={!futureRef.current.length || !!busy} aria-label="Endurgera">
              <Icon name="redo" size={22} />
            </button>
          </div>
        )}
        {busy && (
          <div className="mx-busy" role="status">
            <span className="mx-spinner" />
            <span>{busy}</span>
            {busyCancel && (
              <button type="button" className="mx-chip" onClick={stopWaiting}>
                Hætta að bíða
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="mx-panel">
        {clips.length > 0 && (
          <div className="mv-transport">
            <button type="button" className="mv-btn" onClick={() => (playing ? pause() : void play())} aria-label={playing ? "Stöðva" : "Spila"}>
              {playing ? "❚❚" : "▶"}
            </button>
            <div
              ref={trackRef}
              className="mv-track"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubFrom(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons || e.pointerType === "touch") scrubFrom(e);
              }}
              role="slider"
              aria-label="Tímalína"
              aria-valuemin={0}
              aria-valuemax={Math.round(total * 10) / 10}
              aria-valuenow={Math.round(t * 10) / 10}
            >
              {clips.map((c, i) => (
                <div
                  key={c.id}
                  className={`mv-seg${located?.index === i ? " on" : ""}`}
                  style={{ flexGrow: segmentLength(c), backgroundImage: c.thumb ? `url(${c.thumb})` : undefined }}
                  title={c.prompt || `Bútur ${i + 1}`}
                />
              ))}
              <div className="mv-head" style={{ left: `${total > 0 ? (t / total) * 100 : 0}%` }} />
            </div>
            <span className="mv-time">
              {formatSeconds(t)} / {formatSeconds(total)}
            </span>
          </div>
        )}

        {panel === "create" && (
          <div className="mx-controls">
            {clips.length > 0 && (
              <div className="mx-chips">
                <button type="button" className="mx-chip" onClick={() => stepFrame(-1)} aria-label="Einn ramma fyrr">
                  ◀
                </button>
                <button type="button" className="mx-chip" onClick={() => stepFrame(1)} aria-label="Einn ramma seinna">
                  ▶
                </button>
                <button
                  type="button"
                  className="mx-chip"
                  onClick={() => {
                    pause();
                    void showAt(Math.max(0, totalLength(clipsRef.current) - 1));
                  }}
                >
                  1 s fyrir enda
                </button>
                <span className="mx-hint" style={{ alignSelf: "center" }}>
                  {atEnd > 0.05 ? `síðustu ${formatSeconds(atEnd)} s bútsins detta út` : "frá enda bútsins"}
                </span>
              </div>
            )}
            {clips.length === 0 && initialImage && (
              <div className="mx-chips scroll">
                {ASPECT_CHOICES.map((a) => (
                  <button key={a.id} type="button" className={`mx-chip${aspectId === a.id ? " on" : ""}`} onClick={() => setAspectId(a.id)}>
                    {a.label}
                  </button>
                ))}
                {aspectId !== "orig" && (
                  <>
                    <span style={{ width: 8 }} />
                    <button type="button" className={`mx-chip${fit === "cover" ? " on" : ""}`} onClick={() => setFit("cover")}>
                      Klippa
                    </button>
                    <button type="button" className={`mx-chip${fit === "contain" ? " on" : ""}`} onClick={() => setFit("contain")}>
                      Fylla
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="mx-chips scroll" role="tablist" aria-label="Mín prompt">
              {slots.map((sl, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={activeSlot === i}
                  className={`mx-chip${activeSlot === i ? " on" : ""}`}
                  onClick={() => {
                    setActiveSlot(i);
                    setEditingLabel(false);
                  }}
                >
                  {sl.label}
                </button>
              ))}
              <button
                type="button"
                className={`mx-chip${editingLabel ? " on" : ""}`}
                aria-pressed={editingLabel}
                onClick={() => setEditingLabel((v) => !v)}
              >
                ✎ Heiti
              </button>
            </div>
            {editingLabel && (
              <div className="mx-prompt-row">
                <input
                  className="mx-input"
                  value={slots[activeSlot]?.label ?? ""}
                  maxLength={24}
                  aria-label="Heiti hólfsins"
                  placeholder="Heiti hólfsins"
                  onChange={(e) => updateSlot(activeSlot, { label: e.target.value })}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) updateSlot(activeSlot, { label: defaultVideoPromptSlots()[activeSlot].label });
                  }}
                />
                <button
                  type="button"
                  className="mx-run small ghost"
                  onClick={() => {
                    updateSlot(activeSlot, defaultVideoPromptSlots()[activeSlot]);
                    setEditingLabel(false);
                  }}
                >
                  Sjálfgefið
                </button>
              </div>
            )}
            <div className="mx-prompt-row">
              <textarea
                className="mx-input mx-textarea"
                rows={2}
                value={prompt}
                aria-label={`Prompt í „${slots[activeSlot]?.label ?? ""}“ — vistast sjálfkrafa`}
                placeholder="Hvað á að gerast? (enska virkar best) — vistast í hólfið"
                onChange={(e) => updateSlot(activeSlot, { prompt: e.target.value })}
              />
            </div>
            <div className="mx-chips scroll">
              {(["wan", "kling"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mx-chip${model === m ? " on" : ""}`}
                  onClick={() => {
                    setModel(m);
                    setLengthId(lengthsFor(m)[0].id);
                  }}
                >
                  {m === "wan" ? "Wan 2.2" : "Kling 2.1"}
                </button>
              ))}
              <span style={{ width: 8 }} />
              {lengthsFor(model).map((l) => (
                <button key={l.id} type="button" className={`mx-chip${lengthId === l.id ? " on" : ""}`} onClick={() => setLengthId(l.id)}>
                  {l.label}
                </button>
              ))}
              {model === "wan" && (
                <>
                  <span style={{ width: 8 }} />
                  {(["720p", "480p"] as const).map((r) => (
                    <button key={r} type="button" className={`mx-chip${resolution === r ? " on" : ""}`} onClick={() => setResolution(r)}>
                      {r}
                    </button>
                  ))}
                </>
              )}
            </div>
            <button
              type="button"
              className="mx-run"
              disabled={!!busy || !prompt.trim() || (clips.length === 0 && !initialImage)}
              onClick={() => void generate(clips.length === 0 ? "start" : "continue")}
            >
              {clips.length === 0 ? `Hreyfa myndina (${length.label})` : `Halda áfram frá ${formatSeconds(t)} s (${length.label})`}
            </button>
          </div>
        )}

        <div className="mx-tools" role="toolbar" aria-label="Myndbandstól">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={`mx-tool${(tool.id === "start" || tool.id === "continue") && panel === "create" ? " on" : ""}`}
              onClick={() => {
                if ((tool.id === "start" || tool.id === "continue") && panel === "create") setPanel(null);
                else tool.run();
              }}
              disabled={!!busy || tool.disabled}
              title={tool.hint}
            >
              <Icon name={tool.icon} size={26} />
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(ui, document.body);
}
