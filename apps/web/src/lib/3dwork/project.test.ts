import { describe, expect, it } from 'vitest';
import { classifyPart, flattenGroupMembers, guessKit, guessSlot, type Part } from './project';

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

describe('guessKit', () => {
  it('reads the gun name out of a folder or file', () => {
    expect(guessKit('iron wolf / body cut.3mf')).toBe('iron-wolf');
    expect(guessKit('gw15 / Valken g15 receiver.3mf')).toBe('guardwolf');
    expect(guessKit('gw grip vinna 5 group v2.stl')).toBe('guardwolf');
    expect(guessKit('Tippmann - Salvo - 98sk. 250mm.3mf')).toBe('shotgun');
    expect(guessKit('tipx hulstur hækkað f 10 kúlur v6.3mf')).toBe('pistol');
    expect(guessKit('mws_charging_handle_knob 6mm_3mm.3mf')).toBe('evo');
    expect(guessKit('CZ SCORPION EVO 3 S2.3mf')).toBe('evo');
  });

  it('leaves unmatched files unconnected', () => {
    expect(guessKit('powertube. hlutir2.3mf')).toBe('');
  });
});

describe('classifyPart', () => {
  it('uses the folder when the file name is vague', () => {
    expect(classifyPart('cut.3mf', 'barrel').slotId).toBe('barrel');
    expect(classifyPart('x.3mf', 'recever').slotId).toBe('body');
  });

  it('does not treat Iron Wolf as a sight', () => {
    const classified = classifyPart('body cut.3mf', 'iron wolf');
    expect(classified.kitId).toBe('iron-wolf');
    expect(classified.slotId).toBe('body');
  });

  it('maps a handguard onto the rail slot', () => {
    expect(guessSlot('Handguard m4 replica pakki 211mm.3mf')).toBe('rail');
  });

  it('puts a charging handle on internals and a hulstur on magazine', () => {
    expect(classifyPart('mws_charging_handle_knob 6mm_3mm.3mf').slotId).toBe('internals');
    expect(classifyPart('tipx hulstur hækkað f 10 kúlur v6.3mf').slotId).toBe('magazine');
    expect(guessSlot('muzzle tip.3mf')).toBe('muzzle');
  });
});
