import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOT, muzzleResult } from './muzzle';

describe('muzzleResult', () => {
  const open = { dwellMs: 16, opens: true };
  const shot = { ...DEFAULT_SHOT, pressureBar: 57 };

  it('is mean pressure times bore area times barrel length, choked by the throat', () => {
    const result = muzzleResult(shot, open);
    const boreMm2 = (Math.PI / 4) * 17.3 ** 2;
    const throat = ((Math.PI / 4) * 6 ** 2) / boreMm2 / 0.5;
    // 12 % of 57 bar on the bore over 130 mm, through a ⌀6 throat.
    expect(result.throatFactor).toBeCloseTo(throat, 9);
    expect(result.energyJ).toBeCloseTo(0.12 * 57e5 * (boreMm2 / 1e6) * 0.13 * throat, 9);
  });

  it('turns the energy into the speed of the ball', () => {
    const light = muzzleResult({ ...shot, ballG: 3 }, open);
    const heavy = muzzleResult({ ...shot, ballG: 12 }, open);
    expect(heavy.energyJ).toBeCloseTo(light.energyJ, 9);
    // Four times the mass at the same energy is half the speed.
    expect(heavy.velocityMs).toBeCloseTo(light.velocityMs / 2, 9);
    expect(light.fps).toBeCloseTo(light.velocityMs * 3.28084, 9);
  });

  it('stops gaining once the throat is half the bore', () => {
    const half = Math.sqrt(0.5) * shot.boreMm;
    const atHalf = muzzleResult({ ...shot, throatMm: half }, open);
    const wider = muzzleResult({ ...shot, throatMm: shot.boreMm }, open);
    expect(atHalf.throatFactor).toBeCloseTo(1, 9);
    expect(wider.throatFactor).toBe(1);
    expect(wider.energyJ).toBeCloseTo(atHalf.energyJ, 9);
  });

  it('loses half through an open breech', () => {
    const sealed = muzzleResult(shot, open);
    const leaky = muzzleResult({ ...shot, airThrough: false }, open);
    expect(leaky.energyJ).toBeCloseTo(sealed.energyJ / 2, 9);
  });

  it('gives less when the valve only blinks', () => {
    const long = muzzleResult(shot, { dwellMs: 4, opens: true });
    const short = muzzleResult(shot, { dwellMs: 1, opens: true });
    expect(short.energyJ).toBeCloseTo(long.energyJ * 0.4, 9);
  });

  it('gives nothing when the hammer cannot open the valve', () => {
    const result = muzzleResult(shot, { dwellMs: 16, opens: false });
    expect(result.energyJ).toBe(0);
    expect(result.velocityMs).toBe(0);
    expect(result.fps).toBe(0);
  });
});
