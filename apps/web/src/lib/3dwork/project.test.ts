import { describe, expect, it } from 'vitest';
import {
  assembledPlacement,
  assemblyOn,
  benchPlacement,
  classifyPart,
  createProject,
  flattenGroupMembers,
  freePlacement,
  guessKit,
  guessSlot,
  setAssembly,
  type Part,
  type Project,
} from './project';

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

function at(x: number, y: number, z: number): Part['transform'] {
  return {
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/** A project with a fitted barrel, its spare, a loose part and a part waiting on an empty slot. */
function bench(): Project {
  const project = createProject('Test', 'prj_test');
  project.parts = [
    stub('barrel', { slotId: 'barrel', transform: at(1, 2, 3) }),
    stub('spare', { slotId: 'barrel', transform: at(9, 9, 9) }),
    stub('loose', { transform: at(5, 0, 0) }),
    stub('grip', { slotId: 'grip', transform: at(0, 0, 7) }),
  ];
  project.slots = project.slots.map((slot) =>
    slot.id === 'barrel' ? { ...slot, activePartId: 'barrel' } : slot
  );
  return project;
}

const positions = (list: ReturnType<typeof benchPlacement>) =>
  new Map(list.map((placement) => [placement.partId, placement.position]));

describe('assembledPlacement', () => {
  it('keeps unfitted parts on the table instead of hiding them', () => {
    const drawn = positions(assembledPlacement(bench()));
    // Barrel anchor is (130, 0, 0); its own position is an offset from there.
    expect(drawn.get('barrel')).toEqual({ x: 131, y: 2, z: 3 });
    expect(drawn.get('loose')).toEqual({ x: 5, y: 0, z: 0 });
    expect(drawn.get('grip')).toEqual({ x: 0, y: 0, z: 7 });
  });

  it('still leaves out the spare variant of a filled slot', () => {
    expect(positions(assembledPlacement(bench())).has('spare')).toBe(false);
  });
});

describe('benchPlacement', () => {
  it('draws every part, a fitted one by its mount until it is placed on the bench', () => {
    const drawn = positions(benchPlacement(bench()));
    expect(drawn.size).toBe(4);
    expect(drawn.get('barrel')).toEqual({ x: 131, y: 2, z: 3 });
    expect(drawn.get('spare')).toEqual({ x: 9, y: 9, z: 9 });
  });

  it('uses the table position once a part has one', () => {
    const project = bench();
    project.parts[0] = { ...project.parts[0], freePos: { x: -50, y: 0, z: 0 } };
    expect(positions(benchPlacement(project)).get('barrel')).toEqual({ x: -50, y: 0, z: 0 });
  });
});

describe('freePlacement', () => {
  it('puts a part never placed by hand by its mount, not at the origin', () => {
    expect(positions(freePlacement(bench())).get('barrel')).toEqual({ x: 131, y: 2, z: 3 });
  });
});

describe('setAssembly', () => {
  it('is off unless a project switched it on', () => {
    expect(assemblyOn(createProject())).toBe(false);
    expect(assemblyOn({ ...createProject(), assembly: true })).toBe(true);
  });

  it('turning it off keeps every part exactly where it is drawn', () => {
    const project = { ...bench(), assembly: true };
    const off = setAssembly(project, false, assembledPlacement(project));
    expect(off.assembly).toBe(false);
    const drawn = positions(benchPlacement(off));
    for (const [id, position] of positions(assembledPlacement(project))) {
      expect(drawn.get(id)).toEqual(position);
    }
    // The spare was not drawn in Assembled; it keeps the spot its offset gave it.
    expect(drawn.get('spare')).toEqual({ x: 9, y: 9, z: 9 });
  });

  it('never touches the mounts, so turning it back on restores the assembly exactly', () => {
    const project = { ...bench(), assembly: true };
    const off = setAssembly(project, false, assembledPlacement(project));
    const on = setAssembly(off, true, []);
    expect(on.slots).toEqual(project.slots);
    expect(on.parts.map((part) => part.transform)).toEqual(
      project.parts.map((part) => part.transform)
    );
    expect(positions(assembledPlacement(on))).toEqual(positions(assembledPlacement(project)));
  });

  it('changes nothing when the switch is already where it is asked to be', () => {
    const project = bench();
    expect(setAssembly(project, false, [])).toBe(project);
  });
});

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
