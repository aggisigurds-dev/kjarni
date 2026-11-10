/** MP3 úr fleytitölurásum (LAME í WebAssembly, sótt fyrst þegar flutt er út).
 *  Kóðað í bútum svo viðmótið frjósi ekki. */

export type Mp3Bitrate = 128 | 192 | 256 | 320;

export async function encodeMp3(
  channels: [Float32Array, Float32Array],
  sampleRate: number,
  kbps: Mp3Bitrate = 192,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const { createMp3Encoder } = await import("./mp3wasm");
  const enc = await createMp3Encoder();
  enc.configure({ sampleRate, channels: 2, bitrate: kbps });
  const [left, right] = channels;
  const n = left.length;
  const step = sampleRate * 2;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (let at = 0; at < n; at += step) {
    // Kóðarinn endurnýtir úttaksminnið, svo hver bútur er afritaður strax.
    const out = enc.encode([left.subarray(at, at + step), right.subarray(at, at + step)]).slice();
    chunks.push(out);
    bytes += out.length;
    onProgress?.(Math.min(1, (at + step) / n));
    await new Promise((r) => setTimeout(r, 0));
  }
  const tail = enc.finalize().slice();
  chunks.push(tail);
  bytes += tail.length;
  const mp3 = new Uint8Array(bytes);
  let at = 0;
  for (const c of chunks) {
    mp3.set(c, at);
    at += c.length;
  }
  return mp3;
}
