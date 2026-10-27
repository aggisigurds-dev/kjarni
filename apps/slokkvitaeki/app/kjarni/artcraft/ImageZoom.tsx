"use client";

/** Drop-in replacement for a plain result <img> across ArtCraft — click/tap
 * opens a full-screen lightbox with mouse-wheel zoom, pinch-zoom, drag-to-pan
 * and double-click/double-tap to toggle. The pixel math lives in
 * imageZoom.ts (pure, tested without a DOM); this file is the part that
 * needs one. */

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampPan,
  distance,
  midpoint,
  RESET_ZOOM,
  toggleZoom,
  wheelZoomFactor,
  zoomAround,
  type Point,
  type ZoomState,
} from "./imageZoom";

type Props = {
  src: string;
  alt: string;
  className?: string;
};

export default function ImageZoom({ src, alt, className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img src={src} alt={alt} className={className} onClick={() => setOpen(true)} style={{ cursor: "zoom-in" }} />
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomState>(RESET_ZOOM);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const pointers = useRef<Map<number, Point>>(new Map());
  const pinchStart = useRef<{ distance: number; scale: number; mid: Point } | null>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; zoomX: number; zoomY: number } | null>(null);

  function stagePoint(clientX: number, clientY: number): Point {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function applyZoom(next: ZoomState) {
    const rect = stageRef.current?.getBoundingClientRect();
    setZoom(rect ? clampPan(next, rect.width, rect.height) : next);
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // React attaches its synthetic wheel listener as passive, so
    // e.preventDefault() inside a JSX onWheel prop silently fails (and
    // warns) — a real, non-passive DOM listener is the only way to stop
    // the page from scrolling behind the lightbox while zooming.
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const p = stagePoint(e.clientX, e.clientY);
      applyZoom(zoomAround(zoomRef.current, wheelZoomFactor(e.deltaY), p.x, p.y));
    }
    const stage = stageRef.current;
    window.addEventListener("keydown", onKey);
    stage?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      stage?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        zoomX: zoomRef.current.x,
        zoomY: zoomRef.current.y,
      };
    } else if (pointers.current.size === 2) {
      dragStart.current = null;
      const pts = [...pointers.current.values()];
      pinchStart.current = { distance: distance(pts[0], pts[1]), scale: zoomRef.current.scale, mid: midpoint(pts[0], pts[1]) };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const newDistance = distance(pts[0], pts[1]);
      const factor = (newDistance / pinchStart.current.distance) * (pinchStart.current.scale / zoomRef.current.scale);
      const mid = stagePoint(pinchStart.current.mid.x, pinchStart.current.mid.y);
      applyZoom(zoomAround(zoomRef.current, factor, mid.x, mid.y));
      return;
    }

    if (pointers.current.size === 1 && dragStart.current && zoomRef.current.scale > 1) {
      const dx = e.clientX - dragStart.current.pointerX;
      const dy = e.clientY - dragStart.current.pointerY;
      applyZoom({ scale: zoomRef.current.scale, x: dragStart.current.zoomX + dx, y: dragStart.current.zoomY + dy });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinchStart.current = null;
    dragStart.current = pointers.current.size === 1 ? dragStart.current : null;
  }

  function onDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    const p = stagePoint(e.clientX, e.clientY);
    applyZoom(toggleZoom(zoomRef.current, p.x, p.y));
  }

  return (
    <div className="ac-zoom-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="ac-zoom-close" onClick={onClose} aria-label="Loka">
        ✕
      </button>
      <div
        ref={stageRef}
        className="ac-zoom-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          className="ac-zoom-img"
          draggable={false}
          style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
        />
      </div>
      <p className="ac-zoom-hint">Scroll til að renna, dragðu til að hliðra, tvísmelltu til að núllstilla</p>
    </div>
  );
}
