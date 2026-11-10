/**
 * Marker presets for the test-run (Prufukeyrsla): the numbers of a real marker
 * in one place, so what the panel loads is what the tests pin down.
 */
import { springRate, type HammerInputs, type SpringCoil } from './hammer';
import type { ShotParams } from './muzzle';

export interface MarkerPreset {
  name: string;
  input: HammerInputs;
  coil: SpringCoil;
  shot: ShotParams;
}

// ⌀15 outside, 1,5 mm wire, 25 turns of which 24 work (the closed ends do not).
const IRON_WOLF_COIL: SpringCoil = { wireMm: 1.5, meanDiameterMm: 13.5, activeCoils: 24 };

/**
 * Aggi's Iron wolf: ⌀28 body, 274 g hammer, ⌀15/1,5 spring, 70 mm stroke,
 * CO2 at 57 bar, ⌀6 valve seat, ⌀25 blowback face, 130 mm barrel.
 *
 * The test-run takes the spring rate from the coil and the hammer calculator
 * takes it from the input, so the input carries the coil's own rate.
 */
export const IRON_WOLF: MarkerPreset = {
  name: 'Iron wolf',
  coil: IRON_WOLF_COIL,
  input: {
    hammerMassG: 274,
    springRateNmm: springRate(IRON_WOLF_COIL),
    freeLengthMm: 140,
    strikeLengthMm: 120,
    cockedLengthMm: 50,
    dragN: 4,
    pressureBar: 57,
    valveSealMm: 6,
    valvePreloadN: 15,
    valveLiftMm: 2.5,
    contactMs: 1,
    hammerFaceMm: 25,
  },
  shot: { boreMm: 17.3, barrelMm: 130, effPct: 12, throatMm: 6, ballG: 3.2, airThrough: true },
};
