import { describe, expect, it } from 'vitest';
import { flattenGroupMembers, type Part } from './project';

function stub(id: string, extra: Partial<Part> = {}): Part {
  return {
    id,
    name: id,
    fileName: '',
    slotId: '',
    color: '#000',
    visible: true,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    triangles: 12,
    materialId: 'pla',
    notes: '',
    versions: [],
    activeVersionId: '',
    addedAt: 0,
    ...extra,
  };
}

describe('flattenGroupMembers', () => {
  it('keeps loose parts as they are', () => {
    const a = stub('a');
    const b = stub('b');
    expect(flattenGroupMembers([a, b]).map((part) => part.id)).toEqual(['a', 'b']);
  });

  it('unwraps a group so grouping can absorb it', () => {
    const inner = [stub('a'), stub('b')];
    const group = stub('g', { group: { members: inner, fitted: [] } });
    const c = stub('c');
    expect(flattenGroupMembers([group, c]).map((part) => part.id)).toEqual(['a', 'b', 'c']);
  });
});
