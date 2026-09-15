import { describe, expect, it } from 'vitest';
import { DEFAULT_HAMMER, hammerStrike, springRate } from './hammer';

describe('springRate', () => {
  it('follows the helical spring formula', () => {
    // 1.2 mm music wire, 10 mm mean diameter, 20 active coils.
    expect(springRate({ wireMm: 1.2, meanDiameterMm: 10, activeCoils: 20 })).toBeCloseTo(1.028, 3);
  });

  it('is nothing for a spring that is not there', () => {
    expect(springRate({ wireMm: 0, meanDiameterMm: 10, activeCoils: 20 })).toBe(0);
  });
});

describe('hammerStrike', () => {
  const input = {
    ...DEFAULT_HAMMER,
    hammerMassG: 45,
    springRateNmm: 1,
    freeLengthMm: 90,
    strikeLengthMm: 75,
    cockedLengthMm: 45,
    dragN: 0,
    pressureBar: 58.6,
    valveSealMm: 6,
    valvePreloadN: 10,
    valveLiftMm: 2.5,
    contactMs: 1,
    hammerFaceMm: 0,
  };

  it('turns the spring energy into hammer speed', () => {
    const result = hammerStrike(input);
    // Compressed 45 mm cocked and 15 mm at the stem: ½·1·(45² − 15²) N·mm = 0.9 J.
    expect(result.travelMm).toBe(30);
    expect(result.cockedForceN).toBe(45);
    expect(result.strikeForceN).toBe(15);
    expect(result.energyJ).toBeCloseTo(0.9, 6);
    expect(result.velocityMs).toBeCloseTo(Math.sqrt((2 * 0.9) / 0.045), 6);
    expect(result.momentumNs).toBeCloseTo(0.045 * result.velocityMs, 9);
    expect(result.impactForceN).toBeCloseTo(result.momentumNs / 0.001, 6);
  });

  it('takes drag out of the energy', () => {
    const dragged = hammerStrike({ ...input, dragN: 2 });
    // 2 N over 30 mm is 0.06 J.
    expect(dragged.energyJ).toBeCloseTo(0.84, 6);
  });

  it('lifts the valve against gas and spring, and says when it bottoms out', () => {
    const result = hammerStrike(input);
    // 58.6 bar on a ⌀6 seal: 5.86 N/mm² × 28.27 mm².
    expect(result.gasForceN).toBeCloseTo(165.7, 1);
    expect(result.holdingForceN).toBeCloseTo(165.7 + 10 - 15, 1);
    expect(result.valveLiftMm).toBeCloseTo((0.9 / result.holdingForceN) * 1000, 6);
    expect(result.bottomsOut).toBe(true);
    expect(result.dwellMs).toBeCloseTo((2 * result.momentumNs * 1000) / result.holdingForceN, 6);

    const stiff = hammerStrike({ ...input, valveLiftMm: 10 });
    expect(stiff.bottomsOut).toBe(false);
  });

  it('checks whether the blowback can re-cock the hammer', () => {
    const none = hammerStrike(input);
    expect(none.recocks).toBeNull();

    // A ⌀16 face at 58.6 bar sees 1178 N — far more than the 30 N/mm-ish the spring asks.
    const puff = hammerStrike({ ...input, hammerFaceMm: 16 });
    expect(puff.blowbackForceN).toBeCloseTo(1178, 0);
    expect(puff.recockForceN).toBeCloseTo(30, 6);
    expect(puff.recocks).toBe(true);

    const weak = hammerStrike({ ...input, hammerFaceMm: 16, pressureBar: 0.5 });
    expect(weak.recocks).toBe(false);
  });

  it('never divides by a missing hammer', () => {
    const result = hammerStrike({ ...input, hammerMassG: 0 });
    expect(result.velocityMs).toBe(0);
    expect(Number.isFinite(result.impactForceN)).toBe(true);
  });
});
