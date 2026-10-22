"use client";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki lesið ramma"));
    img.src = src;
  });
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** Draw frames onto a canvas and record a looping WebM. */
export async function stitchWebm(frames: string[], fps: number): Promise<Blob> {
  if (frames.length === 0) throw new Error("Engir rammar til að sauma");
  const mime = pickMime();
  if (!mime) throw new Error("Vafrinn styður ekki WebM-upptöku");
  const first = await load(frames[0]);
  const width = first.naturalWidth || first.width || 512;
  const height = first.naturalHeight || first.height || 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað ramma");
  const stream = canvas.captureStream(Math.max(1, fps));
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("WebM-upptaka mistókst"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });
  recorder.start();
  const delay = Math.round(1000 / Math.max(1, fps));
  for (const src of frames) {
    const img = src === frames[0] ? first : await load(src);
    ctx.drawImage(img, 0, 0, width, height);
    await new Promise((r) => setTimeout(r, delay));
  }
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return done;
}
