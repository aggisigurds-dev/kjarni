import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { computeBounds } from './mesh';
import { settleOnFloor, settledSoup } from './settle';

const identity = {
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

describe('settleOnFloor', () => {
  it('drops a hovering cube onto Y=0 without spinning it', () => {
    const soup = cubeSoup(10);
    const worldPos = { x: 3, y: 40, z: 7 };
    const pose = settleOnFloor(soup, identity, worldPos);
    const bounds = computeBounds(settledSoup(soup, identity, pose));

    expect(bounds.min[1]).toBeCloseTo(0, 4);
    expect(bounds.size[1]).toBeCloseTo(10, 2);
    expect(pose.position.x).toBeCloseTo(3, 2);
    expect(pose.position.z).toBeCloseTo(7, 2);
    expect(pose.droppedMm).toBeCloseTo(40, 2);
    expect(Math.abs(pose.tiltedDeg)).toBeLessThan(1);
    expect(Math.hypot(pose.rotation.x, pose.rotation.z)).toBeLessThan(1);
  });

  it('leaves a cube that already sits on the floor nearly still', () => {
    const soup = cubeSoup(10);
    const worldPos = { x: 0, y: 0, z: 0 };
    const pose = settleOnFloor(soup, identity, worldPos);
    const bounds = computeBounds(settledSoup(soup, identity, pose));

    expect(bounds.min[1]).toBeCloseTo(0, 4);
    expect(Math.abs(pose.droppedMm)).toBeLessThan(0.05);
    expect(Math.abs(pose.tiltedDeg)).toBeLessThan(1);
  });

  it('stands a tilted cube upright so a face sits on the floor', () => {
    const soup = cubeSoup(10);
    const transform = {
      rotation: { x: 0, y: 0, z: 30 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const worldPos = { x: 0, y: 20, z: 0 };
    const pose = settleOnFloor(soup, transform, worldPos);
    const bounds = computeBounds(settledSoup(soup, transform, pose));

    expect(bounds.min[1]).toBeCloseTo(0, 4);
    expect(bounds.size[1]).toBeCloseTo(10, 1);
    expect(pose.tiltedDeg).toBeGreaterThan(20);
    expect(pose.tiltedDeg).toBeLessThan(40);
  });

  it('stands a cube that was on its side so a face is down', () => {
    const soup = cubeSoup(10);
    const transform = {
      rotation: { x: 0, y: 0, z: 90 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const worldPos = { x: 0, y: 15, z: 0 };
    const pose = settleOnFloor(soup, transform, worldPos);
    const bounds = computeBounds(settledSoup(soup, transform, pose));

    expect(bounds.min[1]).toBeCloseTo(0, 4);
    expect(bounds.size[1]).toBeCloseTo(10, 1);
  });
});
