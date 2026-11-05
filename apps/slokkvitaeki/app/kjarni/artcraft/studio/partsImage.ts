"use client";

import { partBox, type BodyPart } from "./parts";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki lesið myndina"));
    img.src = src;
  });
}

/** White rectangle on black — Forge inpaint mask for one body part. */
export async function partMask(base: string, part: BodyPart): Promise<string> {
  const img = await load(base);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað maska");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const box = partBox(width, height, part);
  ctx.fillStyle = "#fff";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  return canvas.toDataURL("image/png");
}

/** Stamp a dropped photo into one body-part box. Immediate collage, then Forge can blend. */
export async function imprintOnto(base: string, stamp: string, part: BodyPart): Promise<string> {
  const [bg, fg] = await Promise.all([load(base), load(stamp)]);
  const width = bg.naturalWidth || bg.width;
  const height = bg.naturalHeight || bg.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki málað part");
  ctx.drawImage(bg, 0, 0, width, height);
  const box = partBox(width, height, part);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.globalAlpha = 0.92;
  const scale = Math.max(box.w / (fg.naturalWidth || fg.width || 1), box.h / (fg.naturalHeight || fg.height || 1));
  const dw = (fg.naturalWidth || fg.width) * scale;
  const dh = (fg.naturalHeight || fg.height) * scale;
  ctx.drawImage(fg, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
  ctx.restore();
  return canvas.toDataURL("image/png");
}
