/** Vafra-hjálparföll fyrir myndbönd: lýsigögn, nákvæm leit að ramma, rammi
 *  sem mynd, og samskeyting klipptra búta (canvas + MediaRecorder). */

import { isBlankFrame } from "./frameCheck";

export type VideoMeta = { duration: number; width: number; height: number };

function makeVideo(src: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.src = src;
  return v;
}

function waitFor(v: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      v.removeEventListener(event, ok);
      v.removeEventListener("error", bad);
      resolve();
    };
    const bad = () => {
      v.removeEventListener(event, ok);
      v.removeEventListener("error", bad);
      reject(new Error("Vafrinn gat ekki lesið myndbandið"));
    };
    v.addEventListener(event, ok);
    v.addEventListener("error", bad);
  });
}

/** Færir myndbandið á tíma `t` og bíður þar til ramminn er tilbúinn. */
export async function seekVideo(v: HTMLVideoElement, t: number, force = false): Promise<void> {
  const target = Math.max(0, Math.min(t, (v.duration || t) - 0.001));
  if (!force && Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2) return;
  const done = waitFor(v, "seeked");
  v.currentTime = target;
  await done;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Bíður eftir að ramminn sé í raun afkóðaður og sýndur (ekki bara „seeked“).
 *  requestVideoFrameCallback þar sem hann er til; annars stutt bið. */
async function framePresented(v: HTMLVideoElement, timeoutMs = 700): Promise<void> {
  const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
    .requestVideoFrameCallback;
  if (typeof rvfc === "function") {
    await Promise.race([new Promise<void>((r) => rvfc.call(v, () => r())), sleep(timeoutMs)]);
  } else {
    await sleep(120);
  }
}

/** Myndband utan síðunnar er ekki alltaf afkóðað í síma — sett ósýnilegt inn. */
function attachHidden(v: HTMLVideoElement): void {
  v.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(v);
}

function frameLooksBlank(c: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 32;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) return false;
  pctx.drawImage(c, 0, 0, 32, 32);
  return isBlankFrame(pctx.getImageData(0, 0, 32, 32).data);
}

export async function loadVideoMeta(blob: Blob): Promise<VideoMeta> {
  const url = URL.createObjectURL(blob);
  const v = makeVideo(url);
  try {
    await waitFor(v, "loadedmetadata");
    let duration = v.duration;
    // Sum MediaRecorder-myndbönd segja Infinity þar til leitað er aftast.
    if (!Number.isFinite(duration)) {
      const done = waitFor(v, "seeked");
      v.currentTime = 1e7;
      await done;
      duration = v.duration;
    }
    return { duration: Number.isFinite(duration) ? duration : 0, width: v.videoWidth, height: v.videoHeight };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Ramminn á tíma `t` sem mynd (JPEG sjálfgefið). Auður rammi (svartur eða
 *  gegnsær — Chrome á Android) er aldrei skilaður: reynt aftur með því að
 *  spila myndbandið örstutt svo afkóðarinn vakni, og annars villa. */
export async function extractFrameAt(blob: Blob, t: number, type = "image/jpeg", quality = 0.92): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const v = makeVideo(url);
  attachHidden(v);
  try {
    await waitFor(v, "loadeddata");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað ramma");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        // Vekja afkóðarann: spila örstutt, stöðva, leita aftur á sama stað.
        try {
          await v.play();
          await sleep(150 * attempt);
        } catch {
          /* sjálfvirk spilun bönnuð — leitin ein verður að duga */
        }
        v.pause();
      }
      await seekVideo(v, t, attempt > 0);
      await framePresented(v);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      if (!frameLooksBlank(c)) {
        return await new Promise((resolve, reject) =>
          c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað ramma"))), type, quality),
        );
      }
    }
    throw new Error("Vafrinn skilaði auðum ramma úr myndbandinu — ekkert sent. Reyndu aftur eða veldu annan stað.");
  } finally {
    v.pause();
    v.removeAttribute("src");
    v.load();
    v.remove();
    URL.revokeObjectURL(url);
  }
}

export function pickRecorderMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return "video/webm";
}

export type StitchPart = { blob: Blob; inT: number; outT: number };

/** Skeytir saman klipptum bútum í eitt myndband. Hver bútur er spilaður frá
 *  inT að outT og teiknaður á striga sem MediaRecorder tekur upp — í
 *  rauntíma, svo það tekur jafnlangan tíma og myndbandið. Stærð fyrsta
 *  bútsins ræður; aðrir eru fylltir inn (cover). */
export async function stitchSegments(
  parts: StitchPart[],
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; mimeType: string }> {
  if (parts.length === 0) throw new Error("Engar klippur");
  const urls = parts.map((p) => URL.createObjectURL(p.blob));
  const videos = urls.map(makeVideo);
  try {
    await Promise.all(videos.map((v) => waitFor(v, "loadeddata")));
    // outT má vera Infinity („til enda“) — miðað við raunlengd skrárinnar.
    parts = parts.map((p, i) => {
      const d = Number.isFinite(videos[i].duration) ? videos[i].duration : p.outT;
      return { ...p, inT: Math.max(0, p.inT), outT: Math.min(p.outT, d) };
    });
    const width = videos[0].videoWidth || 1280;
    const height = videos[0].videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað myndband");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const mimeType = pickRecorderMime();
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    const total = parts.reduce((s, p) => s + Math.max(0, p.outT - p.inT), 0) || 1;
    let doneSec = 0;

    const draw = (v: HTMLVideoElement) => {
      const vw = v.videoWidth || width;
      const vh = v.videoHeight || height;
      const scale = Math.max(width / vw, height / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      ctx.drawImage(v, (width - dw) / 2, (height - dh) / 2, dw, dh);
    };

    // Fyrsti ramminn á strigann áður en upptaka byrjar.
    await seekVideo(videos[0], parts[0].inT);
    draw(videos[0]);
    recorder.start(500);

    for (let i = 0; i < parts.length; i++) {
      const v = videos[i];
      const { inT, outT } = parts[i];
      await seekVideo(v, inT);
      draw(v);
      await v.play();
      await new Promise<void>((resolve) => {
        const tick = () => {
          draw(v);
          onProgress?.(Math.min(1, (doneSec + Math.max(0, v.currentTime - inT)) / total));
          if (v.ended || v.currentTime >= outT - 0.01) {
            v.pause();
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      doneSec += Math.max(0, outT - inT);
    }
    recorder.stop();
    await stopped;
    onProgress?.(1);
    return { blob: new Blob(chunks, { type: mimeType.split(";")[0] }), mimeType };
  } finally {
    for (const v of videos) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}

/** Setur mynd í ramma með völdu hlutfalli (sjá reframePlan): klippt, eða öll
 *  myndin með óskýrri útgáfu af sjálfri sér í kring. */
export async function reframeImage(
  blob: Blob,
  plan: (w: number, h: number) => { width: number; height: number; src: { x: number; y: number; w: number; h: number }; dst: { x: number; y: number; w: number; h: number } },
  type = "image/jpeg",
  quality = 0.92,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const p = plan(bmp.width, bmp.height);
    const c = document.createElement("canvas");
    c.width = p.width;
    c.height = p.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað mynd");
    ctx.imageSmoothingQuality = "high";
    const contain = p.src.w === bmp.width && p.src.h === bmp.height && (p.dst.w < p.width - 0.5 || p.dst.h < p.height - 0.5);
    if (contain) {
      // Óskýr fylling: myndin sjálf, stækkuð yfir allan rammann.
      const s = Math.max(p.width / bmp.width, p.height / bmp.height);
      const blur = Math.max(8, Math.round(Math.max(p.width, p.height) * 0.03));
      ctx.filter = `blur(${blur}px) brightness(0.85)`;
      const bw = bmp.width * s * 1.1;
      const bh = bmp.height * s * 1.1;
      ctx.drawImage(bmp, (p.width - bw) / 2, (p.height - bh) / 2, bw, bh);
      ctx.filter = "none";
    }
    ctx.drawImage(bmp, p.src.x, p.src.y, p.src.w, p.src.h, p.dst.x, p.dst.y, p.dst.w, p.dst.h);
    const out = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað mynd"))), type, quality),
    );
    return { blob: out, width: p.width, height: p.height };
  } finally {
    bmp.close();
  }
}
