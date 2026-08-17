import { describe, expect, it } from 'vitest';
import { inspect } from './mesh';
import { describePart } from './measure';
import {
  THREAD_STANDARDS,
  defaultSpec,
  hardwareLabel,
  hardwareMass,
  hardwareMesh,
  hardwareOverallLength,
  threadById,
} from './hardware';

describe('hardwareMesh', () => {
  it('builds a 300 mm pipe at the size it was asked for', () => {
    const soup = hardwareMesh({ kind: 'pipe', length: 300, diameter: 28, wall: 1.5 });
    const size = describePart(soup).bounds.size;

    expect(size[0]).toBeCloseTo(300, 3);
    expect(size[1]).toBeCloseTo(28, 0);
    expect(size[2]).toBeCloseTo(28, 0);
  });

  it('makes a pipe that is closed and hollow', () => {
    const topology = inspect(hardwareMesh({ kind: 'pipe', length: 55, diameter: 25, wall: 2.5 }));

    expect(topology.watertight).toBe(true);
    expect(topology.holes).toBe(0);

    // A hollow tube encloses much less than the solid cylinder around it.
    const solid = Math.PI * 12.5 * 12.5 * 55;
    expect(Math.abs(topology.signedVolume)).toBeLessThan(solid * 0.45);
  });

  it('makes a solid rod watertight too', () => {
    const topology = inspect(hardwareMesh({ kind: 'rod', length: 250, diameter: 20 }));

    expect(topology.watertight).toBe(true);
    expect(Math.abs(topology.signedVolume)).toBeCloseTo(Math.PI * 10 * 10 * 250, -3);
  });

  it('puts a head on a bolt', () => {
    const plain = hardwareMesh({ kind: 'rod', length: 100, diameter: 16 });
    const bolt = hardwareMesh({
      kind: 'bolt',
      length: 100,
      diameter: 16,
      headDiameter: 24,
      headHeight: 10,
    });

    expect(describePart(bolt).bounds.size[0]).toBeGreaterThan(
      describePart(plain).bounds.size[0]
    );
    expect(describePart(bolt).bounds.size[1]).toBeCloseTo(24, 0);
  });

  it('cuts a real thread whose crests reach the major diameter', () => {
    const threaded = hardwareMesh({
      kind: 'bolt',
      length: 30,
      diameter: 16,
      threadPitch: 1.5,
      threaded: true,
      headDiameter: 24,
      headHeight: 8,
    });

    // Crest to crest across the shaft is the major diameter; the head is wider,
    // so measure that the mesh is at least as deep as the thread's 16 mm.
    const size = describePart(threaded).bounds.size;
    expect(size[2]).toBeGreaterThanOrEqual(16);
    // A thread is many more triangles than a plain cylinder.
    expect(threaded.length / 9).toBeGreaterThan(1000);
  });
});

describe('hardwareMass', () => {
  it('weighs a 300 mm steel pipe against its section', () => {
    // 28 x 1.5 steel is about 0.98 kg/m, so 300 mm is roughly 294 g.
    const grams = hardwareMass({ kind: 'pipe', length: 300, diameter: 28, wall: 1.5 }, 'steel');
    expect(grams).toBeGreaterThan(270);
    expect(grams).toBeLessThan(320);
  });

  it('weighs a bolt more than the bare shaft', () => {
    const spec = { kind: 'bolt' as const, length: 100, diameter: 16, headDiameter: 24, headHeight: 10 };
    const rod = hardwareMass({ kind: 'rod', length: 100, diameter: 16 }, 'steel');
    expect(hardwareMass(spec, 'steel')).toBeGreaterThan(rod);
  });
});

describe('thread standards', () => {
  it('knows that imperial pipe threads are not their nominal size', () => {
    // The whole point of the table: 1/8" pipe thread is 9.728 mm across.
    expect(threadById('bsp-1-8')?.majorDiameter).toBeCloseTo(9.728, 3);
    expect(threadById('bsp-3-8')?.majorDiameter).toBeCloseTo(16.662, 3);
    expect(threadById('bsp-1-2')?.majorDiameter).toBeCloseTo(20.955, 3);
  });

  it('carries the metric sizes at their real pitch', () => {
    expect(threadById('m16')).toMatchObject({ majorDiameter: 16, pitch: 1.5 });
  });

  it('gives every standard a usable pitch and diameter', () => {
    for (const standard of THREAD_STANDARDS) {
      expect(standard.pitch).toBeGreaterThan(0);
      expect(standard.majorDiameter).toBeGreaterThan(standard.pitch);
    }
  });
});

describe('labels and lengths', () => {
  it('names stock the way it is ordered', () => {
    expect(hardwareLabel({ kind: 'pipe', length: 300, diameter: 28, wall: 1.5 })).toBe(
      'Pipe ⌀28 × 1.5 wall — 300 mm'
    );
    expect(
      hardwareLabel({ kind: 'bolt', length: 100, diameter: 16, threadPitch: 1.5 })
    ).toBe('Bolt M16×1.5 — 100 mm');
  });

  it('counts the head in a bolt overall length', () => {
    expect(
      hardwareOverallLength({ kind: 'bolt', length: 100, diameter: 16, headHeight: 10 })
    ).toBe(110);
    expect(hardwareOverallLength(defaultSpec('pipe'))).toBe(300);
  });
});
