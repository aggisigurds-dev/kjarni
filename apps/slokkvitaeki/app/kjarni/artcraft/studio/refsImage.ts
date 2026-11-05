"use client";

import { clampMotionFrames, motionFrameCount } from "./refs";

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("Gat ekki farið á ramma"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onErr);
    video.currentTime = Math.max(0, time);
  });
}

/** Pull evenly spaced stills from a short motion clip. */
export async function extractVideoFrames(file: File, count?: number): Promise<string[]> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Veldu stutt videó (MP4 eða WebM).");
  }
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Gat ekki lesið videóið"));
    });
    const n = clampMotionFrames(count ?? motionFrameCount(video.duration));
    const canvas = document.createElement("canvas");
    const max = 768;
    const vw = video.videoWidth || 512;
    const vh = video.videoHeight || 512;
    const scale = Math.min(1, max / Math.max(vw, vh));
    canvas.width = Math.max(8, Math.round((vw * scale) / 8) * 8);
    canvas.height = Math.max(8, Math.round((vh * scale) / 8) * 8);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað ramma");
    const frames: string[] = [];
    const span = Math.max(0, video.duration - 0.05);
    for (let i = 0; i < n; i++) {
      await seek(video, n === 1 ? 0 : (i / (n - 1)) * span);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.82));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
