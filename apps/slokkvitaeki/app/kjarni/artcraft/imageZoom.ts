/** Pan/zoom math for the result-image lightbox (ImageZoom.tsx) — pure,
 * no DOM, so the "keep the point under the cursor/pinch stationary"
 * invariant is directly testable. Transform model: the image is rendered
 * with `transform: translate(x, y) scale(scale)` and `transform-origin:
 * 0 0`, so a point at container-relative screen position (px, py) sits
 * over image-local position ((px - x) / scale, (py - y) / scale). */

export type ZoomState = { scale: number; x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

export const RESET_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** New state after zooming by `factor` anchored at container-relative
 * point (px, py) — that point stays under the cursor/pinch-center. */
export function zoomAround(state: ZoomState, factor: number, px: number, py: number): ZoomState {
  const nextScale = clampZoom(state.scale * factor);
  if (nextScale === state.scale) return state;
  const ratio = nextScale / state.scale;
  return {
    scale: nextScale,
    x: px - (px - state.x) * ratio,
    y: py - (py - state.y) * ratio,
  };
}

/** Smooth, frame-rate-independent factor for one wheel event. Negative
 * deltaY (scroll up / away from the user) zooms in. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.pow(1.0022, -deltaY);
}

/** Keeps the scaled image from drifting entirely out of view: when it's
 * bigger than the container on an axis, that axis's translate is clamped
 * so the image still covers the container; when it's smaller or equal,
 * the image is centered on that axis. */
export function clampPan(state: ZoomState, containerWidth: number, containerHeight: number): ZoomState {
  const contentWidth = containerWidth * state.scale;
  const contentHeight = containerHeight * state.scale;

  const x =
    contentWidth <= containerWidth
      ? (containerWidth - contentWidth) / 2
      : Math.min(0, Math.max(containerWidth - contentWidth, state.x));
  const y =
    contentHeight <= containerHeight
      ? (containerHeight - contentHeight) / 2
      : Math.min(0, Math.max(containerHeight - contentHeight, state.y));

  return { scale: state.scale, x, y };
}

export type Point = { x: number; y: number };

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Toggles between the resting state and a fixed zoomed-in level, anchored
 * at (px, py) — used for double-click/double-tap. */
export function toggleZoom(state: ZoomState, px: number, py: number, zoomedScale = 2.5): ZoomState {
  if (state.scale > MIN_ZOOM + 0.01) return RESET_ZOOM;
  return zoomAround(state, zoomedScale / state.scale, px, py);
}
