/** Vafrahlið Tónklippu: afkóðun lagaskráa og spilun. Allt hljóð er unnið á
 *  44,1 kHz og geymt sem 16 bita sýni (helmingi minna minni en fleytitölur —
 *  skiptir máli í síma með nokkur lög opin). */

import type { Mix, TrackAudio } from "./render";

export const RATE = 44100;
export const MAX_TRACK_SECONDS = 20 * 60;

type OfflineCtor = typeof OfflineAudioContext;

function offlineCtor(): OfflineCtor {
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!ctor) throw new Error("Vafrinn styður ekki hljóðvinnslu (Web Audio vantar)");
  return ctor;
}

export async function decodeToTrack(file: Blob): Promise<TrackAudio> {
  const data = await file.arrayBuffer();
  const ctx = new (offlineCtor())(2, 1, RATE);
  const buf = await new Promise<AudioBuffer>((resolve, reject) => {
    const fail = () => reject(new Error("Gat ekki lesið hljóðskrána — prófaðu MP3, M4A eða WAV"));
    try {
      // Eldri Safari styður bara svarhringingarnar; nýrri vafrar skila líka loforði.
      const p = ctx.decodeAudioData(data, resolve, fail) as unknown as Promise<AudioBuffer> | undefined;
      p?.then?.(resolve, fail);
    } catch {
      fail();
    }
  });
  if (!buf.length) throw new Error("Hljóðskráin er tóm");
  if (buf.duration > MAX_TRACK_SECONDS) throw new Error("Lagið er of langt (hámark 20 mínútur)");
  const channels: Int16Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    const src = buf.getChannelData(c);
    const dst = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      dst[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : Math.round(v * 32767);
    }
    channels.push(dst);
  }
  return { sampleRate: buf.sampleRate, channels, scale: 1 / 32768 };
}

type AudioCtor = typeof AudioContext;

/** Einn spilari fyrir allt: spilar AudioBuffer frá tilteknum stað og segir
 *  hvar hann er staddur. */
export class Player {
  private ctx: AudioContext | null = null;
  private node: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private until = 0;
  private token = 0;

  context(): AudioContext {
    if (!this.ctx) {
      const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
      const ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!ctor) throw new Error("Vafrinn styður ekki hljóðspilun (Web Audio vantar)");
      this.ctx = new ctor();
      // iPhone: án þessa þegir Web Audio þegar hljóðrofinn á símanum er á „hljóðlaust“.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) {
        try {
          session.type = "playback";
        } catch {
          /* eldri iOS */
        }
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get playing(): boolean {
    return !!this.node;
  }

  /** Staðurinn (sek) í því sem er að spilast. */
  get time(): number {
    if (!this.node || !this.ctx) return this.offset;
    return Math.min(this.until, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  play(buffer: AudioBuffer, from: number, to: number | undefined, onEnded: () => void): void {
    this.stop();
    const ctx = this.context();
    const start = Math.max(0, Math.min(from, buffer.duration));
    const end = Math.max(start, Math.min(to ?? buffer.duration, buffer.duration));
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const token = ++this.token;
    node.onended = () => {
      if (this.token !== token) return;
      this.offset = end;
      this.node = null;
      onEnded();
    };
    this.node = node;
    this.offset = start;
    this.until = end;
    this.startedAt = ctx.currentTime;
    node.start(0, start, Math.max(0.01, end - start));
  }

  stop(): void {
    const node = this.node;
    if (!node) return;
    this.offset = this.time;
    this.token++;
    this.node = null;
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* þegar stöðvað */
    }
    node.disconnect();
  }

  close(): void {
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

export function mixToBuffer(ctx: BaseAudioContext, mix: Mix): AudioBuffer {
  const n = Math.max(1, mix.channels[0].length);
  const buf = ctx.createBuffer(2, n, mix.sampleRate);
  buf.getChannelData(0).set(mix.channels[0]);
  buf.getChannelData(1).set(mix.channels[1]);
  return buf;
}

/** Gluggi úr laginu sjálfu til að hlusta á (frá `from`, mest `seconds`). */
export function trackWindowBuffer(ctx: BaseAudioContext, track: TrackAudio, from: number, seconds: number): AudioBuffer {
  const len = track.channels[0]?.length ?? 0;
  const first = Math.max(0, Math.min(len, Math.round(from * track.sampleRate)));
  const n = Math.max(1, Math.min(len - first, Math.round(seconds * track.sampleRate)));
  const buf = ctx.createBuffer(2, n, track.sampleRate);
  for (let c = 0; c < 2; c++) {
    const src = track.channels[Math.min(c, track.channels.length - 1)];
    const dst = buf.getChannelData(c);
    for (let i = 0; i < n; i++) dst[i] = src[first + i] * track.scale;
  }
  return buf;
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
