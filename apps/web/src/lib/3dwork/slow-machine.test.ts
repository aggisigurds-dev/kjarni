import { describe, expect, it } from 'vitest';
import { isSlowMachine } from './slow-machine';

describe('isSlowMachine', () => {
  it('is quiet on a typical desktop', () => {
    expect(isSlowMachine({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
  });

  it('flags low memory, two cores, or save-data', () => {
    expect(isSlowMachine({ deviceMemory: 4, hardwareConcurrency: 8 })).toBe(true);
    expect(isSlowMachine({ hardwareConcurrency: 2 })).toBe(true);
    expect(isSlowMachine({ connection: { saveData: true } })).toBe(true);
  });
});
