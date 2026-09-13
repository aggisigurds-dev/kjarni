/** Desktop-lock for phone: keep the true computer layout, zoom with +/−. */

export const DESK_WIDTH = 1440;
export const ZOOM_KEY = "kjarni_desk_zoom";
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 1.6;
export const ZOOM_STEP = 1.18;
export const PHONE_MAX_EDGE = 850;

export function isPhoneScreen(width: number, height: number): boolean {
  return Math.min(width, height) < PHONE_MAX_EDGE;
}

export function clampZoom(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 1000) / 1000));
}

export function fitZoom(viewportWidth: number): number {
  return clampZoom(viewportWidth / DESK_WIDTH);
}

export function stepZoom(current: number, direction: 1 | -1): number {
  return clampZoom(direction > 0 ? current * ZOOM_STEP : current / ZOOM_STEP);
}

export function readStoredZoom(raw: string | null, fallback: number): number {
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? clampZoom(n) : clampZoom(fallback);
}

export function shouldLockDesktop(screenW: number, screenH: number, innerW: number): boolean {
  return isPhoneScreen(screenW, screenH) || innerW < PHONE_MAX_EDGE;
}

export function isStationDesktopPath(pathname: string): boolean {
  if (/\/kjarni\/turbopaint(\/|$)/.test(pathname)) return false;
  return /\/(kjarni|stjorn|kerfi|skjalarinn|draft)(\/|$)/.test(pathname);
}
