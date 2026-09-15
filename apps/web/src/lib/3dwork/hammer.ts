/**
 * Hammer and valve arithmetic for a spring-driven blowback marker.
 *
 * The main spring throws the hammer down the tube; the hammer hits the valve
 * stem; the gas behind the valve and the valve spring throw it back. What is
 * printable rides on these numbers: how hard the spring must be, how fast the
 * hammer arrives, how long the valve stays open, and whether the blowback has
 * the puff to re-cock the hammer.
 *
 * First-order physics only: a linear spring, a constant drag, the valve held
 * shut by a constant force while it lifts. Good for sizing, not for a claim to
 * three decimals.
 */

/** Shear modulus of spring steel (music wire), MPa. */
export const SPRING_STEEL_G_MPA = 79_300;

export interface SpringCoil {
  wireMm: number;
  /** Mean coil diameter (outside diameter less one wire), mm. */
  meanDiameterMm: number;
  activeCoils: number;
  shearModulusMpa?: number;
}

/** Rate of a helical compression spring, N/mm. */
export function springRate(coil: SpringCoil): number {
  const { wireMm, meanDiameterMm, activeCoils } = coil;
  const g = coil.shearModulusMpa ?? SPRING_STEEL_G_MPA;
  if (wireMm <= 0 || meanDiameterMm <= 0 || activeCoils <= 0) return 0;
  return (g * wireMm ** 4) / (8 * meanDiameterMm ** 3 * activeCoils);
}

export interface HammerInputs {
  /** Hammer mass, g. */
  hammerMassG: number;
  /** Main spring rate, N/mm. */
  springRateNmm: number;
  /** Main spring free length, mm. */
  freeLengthMm: number;
  /** Spring length with the hammer forward, on the valve stem, mm. */
  strikeLengthMm: number;
  /** Spring length with the hammer cocked, mm. */
  cockedLengthMm: number;
  /** Constant drag on the hammer from o-rings and rubbing, N. */
  dragN: number;
  /** Gas pressure behind the valve, bar. */
  pressureBar: number;
  /** Diameter the valve seals on, mm — what the pressure pushes on. */
  valveSealMm: number;
  /** Valve spring force with the valve shut, N. */
  valvePreloadN: number;
  /** How far the valve can lift before it bottoms out, mm. */
  valveLiftMm: number;
  /** How long the strike lasts, for an average impact force, ms. */
  contactMs: number;
  /** Hammer face the gas pushes on to re-cock it, mm. 0 when not modelled. */
  hammerFaceMm: number;
}

export const DEFAULT_HAMMER: HammerInputs = {
  hammerMassG: 45,
  springRateNmm: 1,
  freeLengthMm: 90,
  strikeLengthMm: 75,
  cockedLengthMm: 45,
  dragN: 2,
  pressureBar: 58,
  valveSealMm: 6,
  valvePreloadN: 10,
  valveLiftMm: 2.5,
  contactMs: 1,
  hammerFaceMm: 0,
};

export interface HammerResult {
  /** Hammer travel from cocked to strike, mm. */
  travelMm: number;
  /** Spring force with the hammer cocked (the sear holds this), N. */
  cockedForceN: number;
  /** Spring force with the hammer forward, N. */
  strikeForceN: number;
  /** Energy the spring gives the hammer over the travel, less drag, J. */
  energyJ: number;
  /** Hammer speed at the valve, m/s. */
  velocityMs: number;
  /** Hammer momentum at the valve, N·s. */
  momentumNs: number;
  /** Average force over the contact time, N. */
  impactForceN: number;
  /** Gas force holding the valve shut, N. */
  gasForceN: number;
  /** Everything holding the valve shut, less the spring still pushing the hammer, N. */
  holdingForceN: number;
  /** How far the hammer's energy lifts the valve, mm (before bottoming out). */
  valveLiftMm: number;
  /** True when the lift exceeds what the valve has. */
  bottomsOut: boolean;
  /** Roughly how long the valve is open, ms. */
  dwellMs: number;
  /** Gas force on the hammer face when the valve opens, N; 0 when not modelled. */
  blowbackForceN: number;
  /** Average force the blowback must exert over the travel to re-cock, N; 0 when not modelled. */
  recockForceN: number;
  /** Whether the blowback force beats what re-cocking needs; null when not modelled. */
  recocks: boolean | null;
}

const circleAreaMm2 = (diameterMm: number) => (Math.PI * diameterMm * diameterMm) / 4;

export function hammerStrike(input: HammerInputs): HammerResult {
  const k = Math.max(0, input.springRateNmm);
  const massKg = Math.max(0, input.hammerMassG) / 1000;
  const cocked = Math.max(0, input.freeLengthMm - input.cockedLengthMm);
  const strike = Math.max(0, input.freeLengthMm - input.strikeLengthMm);
  const travelMm = Math.max(0, cocked - strike);

  const cockedForceN = k * cocked;
  const strikeForceN = k * strike;
  // N·mm → J is a division by 1000.
  const springJ = (0.5 * k * (cocked * cocked - strike * strike)) / 1000;
  const dragJ = (Math.max(0, input.dragN) * travelMm) / 1000;
  const energyJ = Math.max(0, springJ - dragJ);
  const velocityMs = massKg > 0 ? Math.sqrt((2 * energyJ) / massKg) : 0;
  const momentumNs = massKg * velocityMs;
  const contactS = Math.max(input.contactMs, 0.01) / 1000;
  const impactForceN = momentumNs / contactS;

  // bar → MPa (N/mm²) is a division by 10.
  const gasForceN = (Math.max(0, input.pressureBar) / 10) * circleAreaMm2(Math.max(0, input.valveSealMm));
  const holdingForceN = Math.max(0, gasForceN + Math.max(0, input.valvePreloadN) - strikeForceN);
  const liftMm = holdingForceN > 0 ? (energyJ / holdingForceN) * 1000 : 0;
  const bottomsOut = holdingForceN > 0 && liftMm > input.valveLiftMm;
  // Decelerated to a stop and thrown back the same way: twice the stopping time.
  const dwellMs = holdingForceN > 0 ? (2 * momentumNs * 1000) / holdingForceN : 0;

  const modelBlowback = input.hammerFaceMm > 0;
  const blowbackForceN = modelBlowback
    ? (Math.max(0, input.pressureBar) / 10) * circleAreaMm2(input.hammerFaceMm)
    : 0;
  const recockForceN = modelBlowback && travelMm > 0 ? ((springJ + dragJ) * 1000) / travelMm : 0;

  return {
    travelMm,
    cockedForceN,
    strikeForceN,
    energyJ,
    velocityMs,
    momentumNs,
    impactForceN,
    gasForceN,
    holdingForceN,
    valveLiftMm: liftMm,
    bottomsOut,
    dwellMs,
    blowbackForceN,
    recockForceN,
    recocks: modelBlowback ? blowbackForceN > recockForceN : null,
  };
}
