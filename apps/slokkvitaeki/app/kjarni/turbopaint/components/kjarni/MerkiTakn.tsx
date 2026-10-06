"use client";

// Tákn úr merkjasafninu sem lítil mynd í listum (tækjalisti, Merki, táknaslá) — teiknuð með SAMA strigakóða og í
// Teikning-glugganum (merkjasafn.ts teiknaTakn), eins og 434 teiknaISpan: platan fyllir ~90% reitsins svo hvíti kraginn
// og skugginn komist fyrir.

import { useEffect, useRef } from "react";
import { lykillTakns, teiknaLykil } from "../../lib/board/merkjasafn";

export function MerkiTakn({
  lykill,
  symbolId,
  size = 20,
  litur,
  className,
}: {
  lykill?: string;
  symbolId?: string;
  size?: number;
  litur?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lyk = lykill ?? lykillTakns(symbolId) ?? "annad";
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const px = Math.round(size * dpr);
    c.width = px;
    c.height = px;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.scale(dpr, dpr);
    teiknaLykil(ctx, lyk, size / 2, size / 2, size * 0.9, 0, litur);
  }, [lyk, size, litur]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      data-merki={lyk}
      className={className ?? "block shrink-0"}
      style={{ width: size, height: size }}
    />
  );
}
