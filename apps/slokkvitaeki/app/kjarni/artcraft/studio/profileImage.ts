"use client";

import { sheetLayout } from "./profile";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki lesið andlitsmynd"));
    img.src = src;
  });
}

export async function shrinkFace(dataUrl: string, max = 512): Promise<string> {
  const img = await load(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export async function faceSheet(faces: string[], cell = 256): Promise<string | null> {
  if (faces.length === 0) return null;
  const { cols, rows } = sheetLayout(faces.length);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) return faces[0] || null;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgs = await Promise.all(faces.slice(0, cols * rows).map((src) => load(src).catch(() => null)));
  imgs.forEach((img, i) => {
    if (!img) return;
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, x, y, cell, cell);
  });
  return canvas.toDataURL("image/jpeg", 0.9);
}
