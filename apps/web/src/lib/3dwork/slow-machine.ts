/**
 * Cheap signals that this tab should stay 2D and, if 3D starts, run a lighter
 * WebGL table. Used so a slow laptop is not paying for Three.js until the user
 * opens one part.
 */

export function isSlowMachine(
  nav: {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: { saveData?: boolean };
  } = typeof navigator === 'undefined' ? {} : navigator
): boolean {
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) {
    return true;
  }
  if (
    typeof nav.hardwareConcurrency === 'number' &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency <= 2
  ) {
    return true;
  }
  return false;
}
