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

  it('strikes with about 3 J and re-cocks', () => {
    const strike = hammerStrike(IRON_WOLF.input);
    expect(strike.travelMm).toBe(70);
    expect(strike.energyJ).toBeCloseTo(3.0, 1);
    expect(strike.velocityMs).toBeCloseTo(4.7, 1);
    // 57 bar on the ⌀6 seat, plus the valve spring, less what the main spring still pushes.
    expect(strike.holdingForceN).toBeCloseTo(159, 0);
    expect(strike.bottomsOut).toBe(true);
    expect(strike.dwellMs).toBeCloseTo(16, 0);
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
