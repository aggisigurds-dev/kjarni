"use client";

/** Bylgjuformsmyndir Tónklippu: tímalína rútínunnar (bútar, hápunktar,
 *  marklengd) og lagið sjálft með handföngum til að velja kaflann. */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type RefObject,
} from "react";
import { Flag } from "lucide-react";
import { MIN_SEAM, formatTime, layout, type Arrangement } from "./arrange";
import { columnPeaks, type Peaks } from "./analyze";
import type { TrackView } from "./tracks";

/** Litur hvers lags (bakgrunnur búts, bylgja) — á dökkum grunni. */
export const TRACK_COLORS = [
  { bg: "rgba(255, 95, 162, 0.22)", wave: "#ff7ab4" },
  { bg: "rgba(79, 216, 255, 0.2)", wave: "#63deff" },
  { bg: "rgba(182, 240, 74, 0.17)", wave: "#bdf25a" },
  { bg: "rgba(162, 107, 255, 0.26)", wave: "#b995ff" },
  { bg: "rgba(255, 207, 92, 0.2)", wave: "#ffd369" },
  { bg: "rgba(75, 227, 207, 0.2)", wave: "#5fe8d5" },
];

export function trackColor(index: number) {
  return TRACK_COLORS[((index % TRACK_COLORS.length) + TRACK_COLORS.length) % TRACK_COLORS.length];
}

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function prepare(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(w * dpr));
  const ch = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  peaks: Peaks,
  t0: number,
  t1: number,
  x0: number,
  x1: number,
  mid: number,
  amp: number,
  color: string,
) {
  const cols = Math.max(0, Math.round(x1 - x0));
  if (cols < 1) return;
  const pk = columnPeaks(peaks, t0, t1, cols);
  ctx.fillStyle = color;
  for (let i = 0; i < cols; i++) {
    const h = Math.max(1, pk[i] * amp * 2);
    ctx.fillRect(x0 + i, mid - h / 2, 1, h);
  }
}

// ------------------------------------------------------------------ tímalína

type TimelineProps = {
  arr: Arrangement;
  tracks: Map<string, TrackView>;
  trackIndex: Map<string, number>;
  sel: number;
  /** Sekúndur yfir alla breiddina. */
  span: number;
  playheadRef: RefObject<HTMLDivElement | null>;
  onSeek: (t: number, final: boolean) => void;
  onSelect: (index: number) => void;
  onMarkerMove: (id: string, t: number) => void;
  onMarkerTap: (id: string) => void;
};

const LANE = 26;
const RULER = 18;

export function TimelineView({ arr, tracks, trackIndex, sel, span, playheadRef, onSeek, onSelect, onMarkerMove, onMarkerTap }: TimelineProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { w, h } = useSize(boxRef);
  const drag = useRef<{ id: number } | null>(null);
  const markerDrag = useRef<{ id: string; pointer: number; x: number; moved: boolean } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || w < 2 || h < 2) return;
    const ctx = prepare(canvas, w, h);
    if (!ctx) return;
    const lay = layout(arr);
    const px = (t: number) => (t / span) * w;
    const top = LANE;
    const stripH = h - LANE - RULER;

    // Marklengdin: grænt belti þar sem rútínan má enda.
    const zx0 = px(arr.targetMin);
    const zx1 = px(arr.targetMax);
    ctx.fillStyle = "rgba(94, 234, 162, 0.13)";
    ctx.fillRect(zx0, top - 4, Math.max(2, zx1 - zx0), stripH + 8);
    ctx.fillStyle = "rgba(94, 234, 162, 0.8)";
    ctx.fillRect(zx0, top - 4, 1, stripH + 8);
    ctx.fillRect(zx1 - 1, top - 4, 1, stripH + 8);

    arr.parts.forEach((p, i) => {
      const tv = tracks.get(p.trackId);
      const color = trackColor(trackIndex.get(p.trackId) ?? 0);
      const x0 = px(lay.pos[i]);
      const x1 = px(lay.pos[i] + lay.len[i]);
      roundRect(ctx, x0 + 0.5, top, Math.max(1, x1 - x0 - 1), stripH, 7);
      ctx.fillStyle = color.bg;
      ctx.fill();
      if (tv) drawWave(ctx, tv.peaks, p.start, p.end, x0 + 1, x1 - 1, top + stripH / 2, stripH / 2 - 4, color.wave);
      if (i === sel) {
        roundRect(ctx, x0 + 1.5, top + 1, Math.max(1, x1 - x0 - 3), stripH - 2, 6);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
      if (x1 - x0 > 22) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "700 11px system-ui, sans-serif";
        ctx.fillText(String(i + 1), x0 + 6, top + 13);
      }
    });
    // Samskeyti: kross yfir blöndunarsvæðið.
    arr.parts.forEach((_, i) => {
      if (i === 0 || lay.half[i] <= MIN_SEAM) return;
      const a = px(lay.pos[i] - lay.half[i]);
      const b = px(lay.pos[i] + lay.half[i]);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(a, top + 3);
      ctx.lineTo(b, top + stripH - 3);
      ctx.moveTo(a, top + stripH - 3);
      ctx.lineTo(b, top + 3);
      ctx.stroke();
    });

    // Kvarði.
    const step = span > 300 ? 60 : span > 130 ? 30 : span > 45 ? 10 : 5;
    ctx.fillStyle = "#a59cc4";
    ctx.font = "10px system-ui, sans-serif";
    for (let t = 0; t <= span; t += step) {
      const x = px(t);
      ctx.fillRect(x, h - RULER, 1, 4);
      if (x + 26 < w) ctx.fillText(formatTime(t), x + 3, h - 4);
    }
  }, [arr, tracks, trackIndex, sel, span, w, h]);

  const timeAt = (clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.max(0, Math.min(span, ((clientX - r.left) / r.width) * span));
  };

  function down(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId };
    const t = timeAt(e.clientX);
    const lay = layout(arr);
    const index = arr.parts.findIndex((_, i) => t >= lay.pos[i] && t < lay.pos[i] + lay.len[i]);
    if (index >= 0) onSelect(index);
    onSeek(t, false);
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    onSeek(timeAt(e.clientX), false);
  }
  function up(e: RPointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    onSeek(timeAt(e.clientX), true);
  }

  return (
    <div ref={boxRef} className="tk-tl">
      <canvas ref={canvasRef} className="tk-tl-canvas" />
      <div className="tk-tl-hit" style={{ top: LANE }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {arr.markers.map((m) => (
        <button
          key={m.id}
          type="button"
          className="tk-flag"
          style={{ left: `${Math.min(100, (m.t / span) * 100)}%` }}
          title={`${formatTime(m.t, true)}${m.label ? ` · ${m.label}` : ""}`}
          aria-label={`Hápunktur á ${formatTime(m.t, true)}${m.label ? `: ${m.label}` : ""}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            markerDrag.current = { id: m.id, pointer: e.pointerId, x: e.clientX, moved: false };
          }}
          onPointerMove={(e) => {
            const d = markerDrag.current;
            if (!d || d.pointer !== e.pointerId) return;
            if (!d.moved && Math.abs(e.clientX - d.x) < 5) return;
            d.moved = true;
            onMarkerMove(m.id, timeAt(e.clientX));
          }}
          onPointerUp={(e) => {
            const d = markerDrag.current;
            if (!d || d.pointer !== e.pointerId) return;
            markerDrag.current = null;
            if (!d.moved) onMarkerTap(m.id);
          }}
          onPointerCancel={() => {
            markerDrag.current = null;
          }}
        >
          <Flag size={12} fill="currentColor" aria-hidden="true" />
          {m.label && <span className="tk-flag-text">{m.label}</span>}
        </button>
      ))}
      <div ref={playheadRef} className="tk-playhead" aria-hidden="true" />
    </div>
  );
}

// ------------------------------------------------------------------ lagið

export type SourceViewport = { t0: number; span: number };

export function clampViewport(v: SourceViewport, duration: number): SourceViewport {
  const span = Math.max(1, Math.min(v.span, Math.max(1, duration * 1.06)));
  const lo = -span * 0.03;
  const hi = Math.max(lo, duration - span * 0.97);
  return { t0: Math.max(lo, Math.min(hi, v.t0)), span };
}

export type SourceHandle = { setPlayLine: (t: number | null) => void };

type SourceProps = {
  track: TrackView;
  color: { bg: string; wave: string };
  start: number;
  end: number;
  /** Bendillinn (sek í laginu). */
  cursor: number;
  /** Slög til að sýna sem strik (þegar smellt er á takt). */
  beats: Float32Array | null;
  view: SourceViewport;
  onView: (v: SourceViewport) => void;
  onCursor: (t: number) => void;
  onStart: (t: number) => void;
  onEnd: (t: number) => void;
};

export const SourceView = forwardRef<SourceHandle, SourceProps>(function SourceView(
  { track, color, start, end, cursor, beats, view, onView, onCursor, onStart, onEnd },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(boxRef);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; startX: number }>());
  const gesture = useRef<{ moved: boolean; pinch: number; t0: number; span: number } | null>(null);
  const handleDrag = useRef<{ which: "start" | "end"; pointer: number } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setPlayLine(t) {
        const el = lineRef.current;
        if (!el) return;
        const v = viewRef.current;
        if (t == null) {
          el.style.display = "none";
          return;
        }
        el.style.display = "block";
        el.style.left = `${((t - v.t0) / v.span) * 100}%`;
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || w < 2 || h < 2) return;
    const ctx = prepare(canvas, w, h);
    if (!ctx) return;
    const px = (t: number) => ((t - view.t0) / view.span) * w;
    const a = Math.max(0, px(0));
    const b = Math.min(w, px(track.duration));
    // Lagið allt í daufum lit, valdi kaflinn í lit lagsins.
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(a, 0, Math.max(0, b - a), h);
    const sx = Math.max(0, px(start));
    const ex = Math.min(w, px(end));
    if (ex > sx) {
      ctx.fillStyle = color.bg;
      ctx.fillRect(sx, 0, ex - sx, h);
    }
    if (beats && view.span < 90) {
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      for (let i = 0; i < beats.length; i++) {
        const x = px(beats[i]);
        if (x < 0) continue;
        if (x > w) break;
        ctx.fillRect(Math.round(x), 0, 1, h);
      }
    }
    drawWave(ctx, track.peaks, view.t0, view.t0 + view.span, 0, w, h / 2, h / 2 - 6, "rgba(255,255,255,0.3)");
    if (ex > sx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, ex - sx, h);
      ctx.clip();
      drawWave(ctx, track.peaks, view.t0, view.t0 + view.span, 0, w, h / 2, h / 2 - 6, color.wave);
      ctx.restore();
    }
    // Tímamerki neðst.
    const step = view.span > 240 ? 60 : view.span > 100 ? 30 : view.span > 40 ? 10 : view.span > 16 ? 5 : view.span > 6 ? 2 : 1;
    ctx.fillStyle = "#a59cc4";
    ctx.font = "10px system-ui, sans-serif";
    for (let t = Math.max(0, Math.ceil(view.t0 / step) * step); t <= Math.min(track.duration, view.t0 + view.span); t += step) {
      const x = px(t);
      ctx.fillRect(x, h - 5, 1, 5);
      if (x + 26 < w) ctx.fillText(formatTime(t), x + 3, h - 3);
    }
  }, [track, color, start, end, beats, view, w, h]);

  const timeAt = (clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!r || r.width <= 0) return 0;
    return v.t0 + ((clientX - r.left) / r.width) * v.span;
  };

  function down(e: RPointerEvent<HTMLDivElement>) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, startX: e.clientX });
    const pts = [...pointers.current.values()];
    const v = viewRef.current;
    gesture.current = {
      moved: pts.length > 1 || (gesture.current?.moved ?? false),
      pinch: pts.length > 1 ? Math.abs(pts[0].x - pts[1].x) : 0,
      t0: v.t0,
      span: v.span,
    };
    for (const p of pts) p.startX = p.x;
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    const p = pointers.current.get(e.pointerId);
    const g = gesture.current;
    const r = boxRef.current?.getBoundingClientRect();
    if (!p || !g || !r || r.width <= 0) return;
    p.x = e.clientX;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.pinch > 10) {
      // Klípa: zoom í kringum miðjuna á milli fingranna.
      const dist = Math.max(10, Math.abs(pts[0].x - pts[1].x));
      const span = g.span * (g.pinch / dist);
      const midStart = (pts[0].startX + pts[1].startX) / 2 - r.left;
      const midNow = (pts[0].x + pts[1].x) / 2 - r.left;
      const anchor = g.t0 + (midStart / r.width) * g.span;
      const next = clampViewport({ span, t0: 0 }, track.duration);
      onView(clampViewport({ span: next.span, t0: anchor - (midNow / r.width) * next.span }, track.duration));
      return;
    }
    const dx = p.x - p.startX;
    if (!g.moved && Math.abs(dx) < 6) return;
    g.moved = true;
    onView(clampViewport({ span: g.span, t0: g.t0 - (dx / r.width) * g.span }, track.duration));
  }
  function up(e: RPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (g && !g.moved && e.type === "pointerup") onCursor(Math.max(0, Math.min(track.duration, timeAt(e.clientX))));
      return;
    }
    // Einn fingur eftir: halda áfram að draga frá núverandi stað.
    const v = viewRef.current;
    for (const p of pointers.current.values()) p.startX = p.x;
    gesture.current = { moved: true, pinch: 0, t0: v.t0, span: v.span };
  }

  // Músarhjól: zoom í kringum bendilinn (lárétt hjól / shift = hliðrun).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        onView(clampViewport({ span: v.span, t0: v.t0 + (d / r.width) * v.span }, track.duration));
        return;
      }
      const k = Math.exp(e.deltaY * 0.0022);
      const anchor = v.t0 + ((e.clientX - r.left) / r.width) * v.span;
      const span = clampViewport({ span: v.span * k, t0: 0 }, track.duration).span;
      onView(clampViewport({ span, t0: anchor - ((e.clientX - r.left) / r.width) * span }, track.duration));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onView, track.duration]);

  const pct = (t: number) => ((t - view.t0) / view.span) * 100;
  const handle = (which: "start" | "end") => {
    const t = which === "start" ? start : end;
    const at = pct(t);
    if (at < -4 || at > 104) return null;
    return (
      <div
        className={`tk-handle ${which}`}
        style={{ left: `${at}%` }}
        role="slider"
        aria-label={which === "start" ? "Byrjun bútsins" : "Endir bútsins"}
        aria-valuemin={0}
        aria-valuemax={Math.round(track.duration * 10) / 10}
        aria-valuenow={Math.round(t * 10) / 10}
        aria-valuetext={formatTime(t, true)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
          (which === "start" ? onStart : onEnd)(t + d);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          handleDrag.current = { which, pointer: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = handleDrag.current;
          if (!d || d.pointer !== e.pointerId) return;
          (d.which === "start" ? onStart : onEnd)(timeAt(e.clientX));
        }}
        onPointerUp={() => {
          handleDrag.current = null;
        }}
        onPointerCancel={() => {
          handleDrag.current = null;
        }}
      >
        <i aria-hidden="true" />
      </div>
    );
  };

  const cursorAt = pct(cursor);
  return (
    <div ref={boxRef} className="tk-src" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <canvas ref={canvasRef} className="tk-src-canvas" />
      {cursorAt >= 0 && cursorAt <= 100 && <div className="tk-cursor" style={{ left: `${cursorAt}%` }} aria-hidden="true" />}
      <div ref={lineRef} className="tk-playline" style={{ display: "none" }} aria-hidden="true" />
      {handle("start")}
      {handle("end")}
    </div>
  );
});
