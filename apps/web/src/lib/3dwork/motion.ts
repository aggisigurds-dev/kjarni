/**
 * Blowback test-run: the kinematic path the parts follow during one firing
 * cycle, so a build on the bench can be watched moving and checked for
 * clearance. The forces and timings come from `hammer.ts`; this file only turns
 * a clock into where the reciprocating group, the valve pin and the ball sit.
 *
 * The motion is illustrative — paced to be watched, not to the real millisecond
 * dwell (which is far too fast to see). The numbers panel shows the real
 * physics; this draws the stroke so clashes show up.
 */

import type { HammerResult } from './hammer';

/** Visual phase lengths of one cycle, seconds. Order: cocked → forward → fire(dwell) → blowback. */
export interface CyclePhases {
  cock: number;
  fwd: number;
  dwell: number;
  blow: number;
  total: number;
}

/**
 * Watchable phase durations. The real dwell is milliseconds, so it is widened
 * for the eye while keeping its relation to the strike: a longer real dwell
 * reads as a longer pause on the valve. `speed` scales the whole cycle.
 */
export function cyclePhases(result: HammerResult | null, speed: number): CyclePhases {
  const s = Math.max(0.1, speed);
  let fwd = 0.55;
  let dwell = 0.3;
  let blow = 0.55;
  const cock = 0.4;
  if (result && result.dwellMs > 0) {
    const r = Math.min(Math.max(result.dwellMs / 8, 0.3), 2.2);
    dwell = 0.3 * r;
  }
  const scale = 1 / s;
  const phases = {
    cock: cock * scale,
    fwd: fwd * scale,
    dwell: dwell * scale,
    blow: blow * scale,
    total: 0,
  };
  phases.total = phases.cock + phases.fwd + phases.dwell + phases.blow;
  return phases;
}

export type CyclePhaseName = 'cocked' | 'fram' | 'skot' | 'blowback';

export interface CyclePose {
  phase: CyclePhaseName;
  /** Forward displacement of the bolt+hammer group from its cocked rest, mm. */
  recipMm: number;
  /** Valve pin lift while the valve is open, mm (0 otherwise). */
  valveMm: number;
  /** Ball travel, 0 chambered … 1 gone out the muzzle. */
  ball: number;
  /** 0..1 position within the whole cycle, for a scrub bar. */
  t01: number;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Where everything sits at `timeS` into the cycle. `recipMm` is 0 at the cocked
 * rest and `strokeMm` at full forward (valve struck); the caller pushes the
 * reciprocating parts that far along the chosen axis.
 */
export function cyclePose(
  timeS: number,
  ph: CyclePhases,
  strokeMm: number,
  valveLiftMm: number
): CyclePose {
  const total = ph.total > 0 ? ph.total : 1;
  const whole = ((timeS % total) + total) % total;
  const t01 = whole / total;
  let t = whole;

  if (t < ph.cock) return { phase: 'cocked', recipMm: 0, valveMm: 0, ball: 0, t01 };
  t -= ph.cock;
  if (t < ph.fwd) {
    const f = ease(t / ph.fwd);
    return { phase: 'fram', recipMm: strokeMm * f, valveMm: 0, ball: 0, t01 };
  }
  t -= ph.fwd;
  if (t < ph.dwell) {
    const f = t / ph.dwell;
    return { phase: 'skot', recipMm: strokeMm, valveMm: valveLiftMm, ball: f, t01 };
  }
  t -= ph.dwell;
  const f = ease(t / ph.blow);
  return { phase: 'blowback', recipMm: strokeMm * (1 - f), valveMm: 0, ball: 1, t01 };
}

/** Map a scrub fraction (0..1) to a time within the cycle. */
export function scrubToTime(frac: number, ph: CyclePhases): number {
  return Math.min(Math.max(frac, 0), 1) * (ph.total > 0 ? ph.total : 1);
}
