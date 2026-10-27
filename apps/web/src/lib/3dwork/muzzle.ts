/**
 * Muzzle side of the blowback marker: how much of the CO2 becomes projectile
 * energy, and the velocity that gives a ball of a chosen mass.
 *
 * First-order, consistent with the hammer model. The work the gas does is
 * roughly mean-pressure x bore area x barrel length; the valve throat caps the
 * flow (the usual real-world choke), the dwell gates how long it flows, and the
 * ball mass turns the energy into speed. Good for sizing and for seeing which
 * knob moves the number — not a promise to the fps.
 */

/** The tunables that are about the shot (not the hammer); pressure comes from the hammer inputs. */
export interface ShotParams {
  /** Bore the ball rides, mm. */
  boreMm: number;
  /** Barrel length, mm. */
  barrelMm: number;
  /** Mean barrel pressure as a % of the fill (10-30 typical). */
  effPct: number;
  /** Valve throat (flow restriction) ⌀, mm — the usual choke. */
  throatMm: number;
  /** Projectile mass, g. */
  ballG: number;
  /** Air-through bolt seals the feed window; an open breech loses about half. */
  airThrough: boolean;
}

export interface MuzzleInputs extends ShotParams {
  /** Gas pressure behind the valve, bar. */
  pressureBar: number;
}

export interface MuzzleResult {
  energyJ: number;
  velocityMs: number;
  fps: number;
  /** 0-1: how much the throat restricts flow (1 = no restriction). */
  throatFactor: number;
}

export const DEFAULT_SHOT: ShotParams = {
  boreMm: 17.3,
  barrelMm: 130,
  effPct: 12,
  throatMm: 6,
  ballG: 3.2,
  airThrough: true,
};

const areaMm2 = (d: number) => (Math.PI / 4) * d * d;
/** The throat must be at least this share of the bore area to not restrict flow. */
const THROAT_FRACTION = 0.5;

export function muzzleResult(i: MuzzleInputs, hammer: { dwellMs: number; opens: boolean }): MuzzleResult {
  const pa = Math.max(0, i.pressureBar) * 1e5;
  const boreA = areaMm2(Math.max(0.1, i.boreMm));
  const throatFactor = Math.min(1, areaMm2(Math.max(0, i.throatMm)) / boreA / THROAT_FRACTION);
  const dwellFactor = hammer.opens ? Math.min(1, (hammer.dwellMs / 4) * 0.8 + 0.2) : 0;
  const breech = i.airThrough ? 1 : 0.5;
  const full = (Math.max(0, i.effPct) / 100) * pa * (boreA / 1e6) * (Math.max(0, i.barrelMm) / 1000);
  const energyJ = Math.max(0, full * throatFactor * dwellFactor * breech);
  const m = Math.max(0.0001, i.ballG / 1000);
  const velocityMs = energyJ > 0 ? Math.sqrt((2 * energyJ) / m) : 0;
  return { energyJ, velocityMs, fps: velocityMs * 3.28084, throatFactor };
}
