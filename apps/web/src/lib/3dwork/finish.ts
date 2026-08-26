/**
 * Named metal finishes for the bench.
 *
 * A hex colour alone cannot read as gold or chrome — those are metalness and
 * roughness as much as hue. The viewport uses these numbers; the colour still
 * goes out in a 3MF so a colour printer can keep Gold / Chrome / steel.
 *
 * Image textures do not survive a slicer. The matching *printable* grain
 * (brushed grooves, gold stipple) lives in `texture.ts` and is baked into the
 * mesh as real millimetres of displacement.
 */

export interface Finish {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  /**
   * Printable grain that matches the look. Chrome is a polish, not a grain,
   * so it has none — applying a texture would undo the mirror.
   */
  texture: 'brushed' | 'knurl' | 'stipple' | 'diamond' | null;
}

export const FINISHES: Finish[] = [
  {
    id: 'gold',
    name: 'Gold',
    color: '#d4af37',
    metalness: 0.95,
    roughness: 0.28,
    texture: 'stipple',
  },
  {
    id: 'chrome',
    name: 'Chrome',
    color: '#dce4ec',
    metalness: 1,
    roughness: 0.05,
    texture: null,
  },
  {
    id: 'brushed-steel',
    name: 'Brushed steel',
    color: '#b7bcc4',
    metalness: 0.88,
    roughness: 0.42,
    texture: 'brushed',
  },
];

export function finishById(id: string | undefined | null): Finish | undefined {
  if (!id) return undefined;
  return FINISHES.find((finish) => finish.id === id);
}

export function finishByColor(color: string | undefined | null): Finish | undefined {
  if (!color) return undefined;
  const needle = color.trim().toLowerCase();
  return FINISHES.find((finish) => finish.color.toLowerCase() === needle);
}

/** Plastic-looking default when the part has no named finish. */
export const PLASTIC_LOOK = { metalness: 0.15, roughness: 0.55 };

export function lookFor(part: { color: string; finishId?: string }): {
  color: string;
  metalness: number;
  roughness: number;
} {
  const finish = finishById(part.finishId) ?? finishByColor(part.color);
  if (!finish) return { color: part.color, ...PLASTIC_LOOK };
  return {
    color: finish.color,
    metalness: finish.metalness,
    roughness: finish.roughness,
  };
}
