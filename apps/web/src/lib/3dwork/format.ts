/** Display helpers. Everything upstream is millimetres and grams. */

import { MM_PER_INCH } from './measure';

export type Unit = 'mm' | 'in';

export function formatLength(mm: number, unit: Unit = 'mm'): string {
  if (!Number.isFinite(mm)) return '—';
  if (unit === 'in') return `${(mm / MM_PER_INCH).toFixed(3)}"`;
  return `${mm.toFixed(mm < 10 ? 2 : 1)} mm`;
}

export function formatMass(grams: number): string {
  if (!Number.isFinite(grams)) return '—';
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
  if (grams < 1) return `${grams.toFixed(2)} g`;
  return `${grams.toFixed(1)} g`;
}

export function formatVolume(mm3: number): string {
  if (!Number.isFinite(mm3)) return '—';
  const cm3 = mm3 / 1000;
  if (cm3 >= 1000) return `${(cm3 / 1000).toFixed(2)} l`;
  return `${cm3.toFixed(cm3 < 10 ? 2 : 1)} cm³`;
}

export function formatArea(mm2: number): string {
  if (!Number.isFinite(mm2)) return '—';
  const cm2 = mm2 / 100;
  if (cm2 >= 10000) return `${(cm2 / 10000).toFixed(3)} m²`;
  return `${cm2.toFixed(1)} cm²`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}
