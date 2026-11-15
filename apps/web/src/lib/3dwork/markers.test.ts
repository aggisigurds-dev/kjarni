import { describe, expect, it } from 'vitest';
import { hammerStrike, springRate } from './hammer';
import { IRON_WOLF } from './markers';
import { muzzleResult } from './muzzle';

describe('Iron wolf preset', () => {
  // The test-run rates the spring from the coil, the hammer calculator from the
  // input. They must be the same spring.
  it('carries the rate of its own coil', () => {
    expect(IRON_WOLF.input.springRateNmm).toBe(springRate(IRON_WOLF.coil));
    expect(IRON_WOLF.input.springRateNmm).toBeCloseTo(0.85, 2);
  });

  it('travels no further than the link slots in the body tube allow', () => {
    // Slots 64.8 long and 177.3 apart, link legs ⌀3 and 182 apart: 57.1 mm.
    const allowed = 64.8 - 3 - (182 - 177.3);
    const travel = hammerStrike(IRON_WOLF.input).travelMm;
    expect(travel).toBeLessThanOrEqual(allowed);
    expect(travel).toBeGreaterThan(allowed - 1);
  });

  it('strikes with about 2.1 J and re-cocks', () => {
    const strike = hammerStrike(IRON_WOLF.input);
    expect(strike.travelMm).toBe(57);
    expect(strike.energyJ).toBeCloseTo(2.12, 2);
    expect(strike.velocityMs).toBeCloseTo(3.94, 2);
    // 57 bar on the ⌀6 seat, plus the valve spring, less what the main spring still pushes.
    expect(strike.holdingForceN).toBeCloseTo(159, 0);
    // Five times the 0.4 J it takes to lift the valve 2.5 mm: it opens all the way.
    expect(strike.bottomsOut).toBe(true);
    expect(strike.dwellMs).toBeCloseTo(13.5, 0);
    expect(strike.blowbackForceN).toBeGreaterThan(strike.recockForceN);
    expect(strike.recocks).toBe(true);
  });

  it('leaves the muzzle near 5 J through the ⌀6 throat', () => {
    const strike = hammerStrike(IRON_WOLF.input);
    const shot = muzzleResult(
      { ...IRON_WOLF.shot, pressureBar: IRON_WOLF.input.pressureBar },
      { dwellMs: strike.dwellMs, opens: strike.bottomsOut }
    );
    expect(shot.energyJ).toBeCloseTo(5.0, 1);
    expect(shot.fps).toBeCloseTo(184, 0);
    // Under the 12–16 J the panel aims for: the throat is what holds it there.
    expect(shot.throatFactor).toBeCloseTo(0.24, 2);
  });
});
