import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import {
  BOARD_GAP_MM,
  assemblyLayout,
  collectionLayout,
  sideLayout,
  slotCheck,
  BOARD_HEIGHT_MM,
  bumpVersionName,
  buildBoard,
  copyBuild,
  dropRepeats,
  failureNote,
  FROM_LIBRARY,
  layoutAroundCentre,
  partsOfBuilds,
  suggestLibraryName,
  type BuildWithParts,
} from './parts-library';
import { createProject, identityTransform, type Part } from './project';

function part(id: string, name: string, triangles: number, extra: Partial<Part> = {}): Part {
  return {
    id,
    name,
    fileName: '',
    slotId: '',
    color: '#f97316',
    visible: true,
    transform: identityTransform(),
    triangles,
    materialId: 'pla',
    notes: '',
    versions: [{ id: `ver_${id}`, label: 'v1', note: '', triangles, createdAt: 0 }],
    activeVersionId: `ver_${id}`,
    addedAt: 0,
    ...extra,
  };
}

function build(id: string, name: string, updatedAt: number, parts: Part[]): BuildWithParts {
  return { id, name, updatedAt, parts };
}

describe('partsOfBuilds', () => {
  it('lists every part of every build, newest build first', () => {
    const list = partsOfBuilds(
      [build('prj_a', 'Older', 100, [part('a1', 'Grip', 10)])],
      [build('prj_b', 'Newer', 200, [part('b1', 'Body', 20), part('b2', 'Mag', 30)])]
    );
    expect(list.map((entry) => `${entry.projectName}:${entry.name}`)).toEqual(['Newer:Body', 'Newer:Mag', 'Older:Grip']);
    expect(list[0].key).toBe('prj_b/b1');
    expect(list[0].versionId).toBe('ver_b1');
    expect(list[2].local).toBe(true);
    expect(list[0].local).toBe(false);
  });

  it('counts a build on both this computer and Supabase once, and keeps the pictures drawn here', () => {
    const here = build('prj_a', 'Build', 100, [part('a1', 'Grip', 10, { thumbnail: 'data:image/png;base64,here' })]);
    const there = build('prj_a', 'Build renamed', 200, [part('a1', 'Grip', 10)]);
    const list = partsOfBuilds([here], [there]);
    expect(list).toHaveLength(1);
    expect(list[0].projectName).toBe('Build renamed');
    expect(list[0].thumbnail).toBe('data:image/png;base64,here');
    expect(list[0].local).toBe(true);
  });

  it('shows the very same part once, but keeps parts that are only nearly the same', () => {
    const list = partsOfBuilds(
      [
        build('prj_new', 'New', 300, [part('n1', 'Neðri', 1000)]),
        build('prj_old', 'Old', 100, [part('o1', 'Neðri', 1000), part('o2', 'Neðri', 1004)]),
      ],
      []
    );
    expect(list.map((entry) => `${entry.projectName}:${entry.triangles}`)).toEqual(['New:1000', 'Old:1004']);
    expect(list[0].alsoIn).toEqual(['Old']);
  });
});

describe('library names', () => {
  it('counts versions up', () => {
    expect(bumpVersionName('Neðri')).toBe('Neðri v2');
    expect(bumpVersionName('Neðri v2')).toBe('Neðri v3');
    expect(bumpVersionName('Grip V9 ')).toBe('Grip v10');
  });

  it('offers the next version for a part taken out of the library, and the name as it is otherwise', () => {
    expect(suggestLibraryName({ name: 'Neðri', notes: '' })).toBe('Neðri');
    expect(suggestLibraryName({ name: 'Neðri', notes: FROM_LIBRARY })).toBe('Neðri v2');
    expect(suggestLibraryName({ name: 'Neðri', notes: 'From favorites' })).toBe('Neðri v2');
    expect(suggestLibraryName({ name: 'Neðri v2', notes: '' })).toBe('Neðri v3');
  });
});

describe('failureNote', () => {
  it('says what did not happen when Supabase cannot be reached, and passes other errors on', () => {
    expect(failureNote(new TypeError('Failed to fetch'), 'Náði ekki að vista partinn.')).toBe(
      'Náði ekki að vista partinn. Ekkert samband við Supabase.'
    );
    expect(failureNote(new Error('Nafnið má ekki vera tómt.'), 'Náði ekki að vista.')).toBe('Nafnið má ekki vera tómt.');
    expect(failureNote('weird', 'Náði ekki að vista.')).toBe('Náði ekki að vista.');
  });
});

describe('buildBoard', () => {
  it('makes a plain board of fresh parts around the middle of the table, at 20 cm', () => {
    const cube = cubeSoup(10);
    const wide = cubeSoup(30);
    const { project, geometries } = buildBoard(
      'Prufa',
      [
        { name: 'A', color: '#111111', materialId: 'pla', soup: cube },
        { name: 'B', color: '#222222', materialId: 'abs', soup: wide, thumbnail: 'data:x' },
      ],
      5000
    );
    expect(project.name).toBe('Prufa');
    expect(project.id).toMatch(/^prj_/);
    expect(project.assembly).toBe(false);
    expect(project.parts.map((entry) => entry.name)).toEqual(['A', 'B']);
    const [a, b] = project.parts;
    expect(a.id).not.toBe(b.id);
    expect(geometries.get(a.activeVersionId)).toBe(cube);
    expect(geometries.get(b.activeVersionId)).toBe(wide);
    expect(b.thumbnail).toBe('data:x');
    expect(b.materialId).toBe('abs');
    expect(a.notes).toBe(FROM_LIBRARY);
    // Side by side with the gap between them, the pair centred on the middle of the table, centres at 20 cm.
    // cubeSoup(n) spans 0…n, so a part's centre on the board is freePos + n/2.
    const centreA = { x: (a.freePos?.x ?? 0) + 5, y: (a.freePos?.y ?? 0) + 5, z: (a.freePos?.z ?? 0) + 5 };
    const centreB = { x: (b.freePos?.x ?? 0) + 15, y: (b.freePos?.y ?? 0) + 15, z: (b.freePos?.z ?? 0) + 15 };
    expect(centreA.y).toBe(BOARD_HEIGHT_MM);
    expect(centreB.y).toBe(BOARD_HEIGHT_MM);
    expect(centreB.x - 15 - (centreA.x + 5)).toBe(BOARD_GAP_MM);
    expect((centreA.x - 5 + centreB.x + 15) / 2).toBeCloseTo(0);
    expect(centreA.z).toBe(0);
    expect(centreB.z).toBe(0);
    expect(a.versions).toHaveLength(1);
    expect(a.triangles).toBe(12);
  });

  it('keeps a long pick list on the plate instead of one row running off it', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      name: `P${index}`,
      color: '#333333',
      materialId: 'pla',
      soup: cubeSoup(index % 2 === 0 ? 120 : 60),
    }));
    const { project } = buildBoard('Margir', items);
    const half = (index: number) => (index % 2 === 0 ? 60 : 30);
    const boxes = project.parts.map((part, index) => {
      const x = (part.freePos?.x ?? 0) + half(index);
      const z = (part.freePos?.z ?? 0) + half(index);
      return { minX: x - half(index), maxX: x + half(index), minZ: z - half(index), maxZ: z + half(index) };
    });
    const minX = Math.min(...boxes.map((box) => box.minX));
    const maxX = Math.max(...boxes.map((box) => box.maxX));
    const minZ = Math.min(...boxes.map((box) => box.minZ));
    const maxZ = Math.max(...boxes.map((box) => box.maxZ));
    // Roughly square and centred: the old row was 10 parts long along X (≈ 1 m here).
    expect(maxX - minX).toBeLessThan(600);
    expect(maxZ - minZ).toBeLessThan(600);
    expect((minX + maxX) / 2).toBeCloseTo(0, 0);
    expect((minZ + maxZ) / 2).toBeCloseTo(0, 0);
    // No two footprints overlap.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlap = boxes[i].minX < boxes[j].maxX && boxes[j].minX < boxes[i].maxX && boxes[i].minZ < boxes[j].maxZ && boxes[j].minZ < boxes[i].maxZ;
        expect(overlap).toBe(false);
      }
    }
  });

  it('names an unnamed board', () => {
    expect(buildBoard('  ', []).project.name).toBe('Nýtt board');
    expect(createProject().parts).toEqual([]);
  });
});

describe('layoutAroundCentre', () => {
  it('returns nothing for no parts and centres a single part on the origin', () => {
    expect(layoutAroundCentre([])).toEqual([]);
    expect(layoutAroundCentre([{ width: 363, depth: 28 }])).toEqual([{ x: 0, z: 0 }]);
  });

  it('never makes a row narrower than the widest part', () => {
    const centres = layoutAroundCentre([{ width: 400, depth: 20 }, { width: 10, depth: 10 }, { width: 10, depth: 10 }]);
    expect(centres[0]).toEqual({ x: 0, z: expect.any(Number) });
    expect(centres).toHaveLength(3);
  });
});

describe('dropRepeats', () => {
  it('keeps the first of each identity, in order', () => {
    const picks = [
      { key: 'build:1', name: 'Rör', triangles: 1288 },
      { key: 'build:2', name: 'Hamar', triangles: 512 },
      { key: 'lib:9', name: 'Rör', triangles: 1288 },
      { key: 'lib:7', name: 'Rör', triangles: 900 },
    ];
    expect(dropRepeats(picks, (pick) => `${pick.name}|${pick.triangles}`).map((pick) => pick.key)).toEqual([
      'build:1',
      'build:2',
      'lib:7',
    ]);
  });
});

describe('copyBuild', () => {
  it('copies a build under a new name with meshes of its own, leaving the original as it was', () => {
    const original = createProject('Iron wolf', 'prj_orig');
    const grip = part('g1', 'Grip', 12);
    grip.versions.push({ id: 'ver_g1b', label: 'v2', note: '', triangles: 12, createdAt: 1 });
    grip.activeVersionId = 'ver_g1b';
    original.parts = [grip];
    const soupA = cubeSoup(5);
    const soupB = cubeSoup(6);
    const geometries = new Map([
      ['ver_g1', soupA],
      ['ver_g1b', soupB],
    ]);

    const copy = copyBuild(original, 'Iron wolf v2', geometries, 9000);

    expect(copy.project.id).not.toBe('prj_orig');
    expect(copy.project.name).toBe('Iron wolf v2');
    expect(copy.project.updatedAt).toBe(9000);
    const copied = copy.project.parts[0];
    expect(copied.id).toBe('g1');
    expect(copied.versions.map((version) => version.id)).not.toContain('ver_g1');
    expect(copied.activeVersionId).toBe(copied.versions[1].id);
    expect(copy.geometries.get(copied.versions[0].id)).toBe(soupA);
    expect(copy.geometries.get(copied.activeVersionId)).toBe(soupB);
    // The original keeps its ids.
    expect(original.parts[0].activeVersionId).toBe('ver_g1b');
    expect(original.id).toBe('prj_orig');
  });
});

describe('assemblyLayout (AR-15 slots)', () => {
  const box = (w: number, h: number, d: number) => ({ min: [-w / 2, -h / 2, -d / 2], max: [w / 2, h / 2, d / 2], size: [w, h, d], center: [0, 0, 0] });
  const items = [
    { bounds: box(170, 75, 38), category: 'triggerbody' },
    { bounds: box(280, 60, 40), category: 'body' },
    { bounds: box(120, 77, 44), category: 'magazine' },
    { bounds: box(72, 99, 31), category: 'grip' },
    { bounds: box(46, 64, 6.5), category: 'innvols' },
    { bounds: box(46, 64, 6.5), category: 'innvols' },
    { bounds: box(30, 30, 30), category: 'body' },
  ];
  const at = assemblyLayout(items);
  const top = (i: number) => at[i].y + items[i].bounds.size[1] / 2;
  const bottom = (i: number) => at[i].y - items[i].bounds.size[1] / 2;
  const maxX = (i: number) => at[i].x + items[i].bounds.size[0] / 2;
  const minX = (i: number) => at[i].x - items[i].bounds.size[0] / 2;

  it('puts the main body in the middle with its lowest point at 20 cm', () => {
    expect(at[1].x).toBe(0);
    expect(bottom(1)).toBeCloseTo(BOARD_HEIGHT_MM);
  });

  it('hangs the grip receiver at the rear and the mag receiver in front of it, both topping out at 20 cm', () => {
    expect(top(0)).toBeCloseTo(BOARD_HEIGHT_MM);
    expect(maxX(0)).toBeCloseTo(maxX(1)); // rear edges in line
    expect(top(2)).toBeCloseTo(BOARD_HEIGHT_MM);
    expect(maxX(2)).toBeCloseTo(minX(0)); // right in front of the grip receiver
  });

  it('hangs the grip below the grip receiver, towards the rear', () => {
    expect(top(3)).toBeLessThan(top(0));
    expect(bottom(3)).toBeLessThan(bottom(0));
    expect(at[3].x).toBeGreaterThan(at[0].x);
  });

  it('puts internals and a second body on the table in front, not in the slots', () => {
    for (const i of [4, 5, 6]) {
      expect(bottom(i)).toBeCloseTo(0);
      expect(at[i].z - items[i].bounds.size[2] / 2).toBeGreaterThan(20);
    }
  });

  it('tells which slots a set of parts fills and which are missing', () => {
    const check = slotCheck(['body', 'triggerbody', 'magazine', 'grip', 'innvols', undefined]);
    expect(check.find((slot) => slot.category === 'body')?.count).toBe(1);
    expect(check.filter((slot) => slot.count === 0).map((slot) => slot.label)).toEqual([
      'Handguard',
      'Hlaup / rör',
      'Stock',
      'Sigti / aukahlutir',
    ]);
  });

  it('chains the front, top and rear: handguard then barrel forward, sight on top, stock pieces back smallest first', () => {
    const parts = [
      { bounds: box(280, 60, 40), category: 'body' },
      { bounds: box(180, 58, 55), category: 'handguard' },
      { bounds: box(117, 68, 31), category: 'stalror' },
      { bounds: box(104, 50, 35), category: 'accessories' },
      { bounds: box(148, 181, 48), category: 'stocksystem' },
      { bounds: box(43, 58, 25), category: 'stocksystem' },
      { bounds: box(120, 77, 44), category: 'magazine', name: 'Mag adapter' },
      { bounds: box(71, 100, 90), category: 'magazine', name: 'TiPX hulstur' },
      { bounds: box(56, 205, 60), category: 'magazine', name: 'TiPX 10' },
    ];
    const p = assemblyLayout(parts);
    const lo = (i: number, k: number) => p[i][k === 0 ? 'x' : 'y'] - parts[i].bounds.size[k] / 2;
    const hi = (i: number, k: number) => p[i][k === 0 ? 'x' : 'y'] + parts[i].bounds.size[k] / 2;
    expect(hi(1, 0)).toBeCloseTo(lo(0, 0)); // handguard against the body's front (1)
    expect(hi(2, 0)).toBeCloseTo(lo(1, 0)); // barrel beyond the handguard (2)
    expect(lo(3, 1)).toBeCloseTo(hi(0, 1)); // sight on top of the body (3)
    expect(lo(5, 0)).toBeCloseTo(hi(0, 0)); // the small stock piece against the body (4)
    expect(lo(4, 0)).toBeCloseTo(hi(5, 0)); // the stock behind it (5)
    expect(hi(6, 1)).toBeCloseTo(BOARD_HEIGHT_MM); // the adapter is the mag receiver
    expect(hi(7, 1)).toBeCloseTo(lo(6, 1)); // the TiPX housing hangs under it
    expect(lo(8, 1)).toBeCloseTo(0); // one that would reach through the table lies on it instead
  });

  it('runs the long steel tube through the body, and keeps a short barrel out in front', () => {
    const parts = [
      { bounds: box(283, 63, 43), category: 'body' },
      { bounds: box(180, 58, 55), category: 'handguard' },
      { bounds: box(301, 28, 28), category: 'stalror', name: '28mm stál body rör' },
      { bounds: box(117, 31, 31), category: 'stalror', name: 'Hlaup' },
    ];
    const p = assemblyLayout(parts);
    expect(p[2].x).toBeCloseTo(p[0].x); // through the body, on its axis
    expect(p[2].y).toBeCloseTo(p[0].y);
    expect(p[2].z).toBeCloseTo(p[0].z);
    expect(p[3].x + 117 / 2).toBeCloseTo(p[1].x - 180 / 2); // the short one beyond the handguard
  });
});

describe('buildBoard with AR-15 categories', () => {
  it('lays sorted parts out as an assembly and leaves unsorted boards as a block', () => {
    const body = cubeSoup(100);
    const grip = cubeSoup(40);
    const sorted = buildBoard('AR', [
      { name: 'Body', color: '#111', materialId: 'abs', soup: body, category: 'body' },
      { name: 'Lower', color: '#222', materialId: 'abs', soup: grip, category: 'triggerbody' },
    ]);
    const [b, l] = sorted.project.parts;
    // cubeSoup(n) spans 0..n, so a part's lowest point is freePos.y.
    expect(b.freePos?.y).toBeCloseTo(BOARD_HEIGHT_MM);
    expect((l.freePos?.y ?? 0) + 40).toBeCloseTo(BOARD_HEIGHT_MM);
    const plain = buildBoard('Plain', [{ name: 'A', color: '#111', materialId: 'pla', soup: cubeSoup(10) }]);
    expect((plain.project.parts[0].freePos?.y ?? 0) + 5).toBeCloseTo(BOARD_HEIGHT_MM);
  });
});

describe('arranged collections', () => {
  const box = (w: number, h: number, d: number) => ({ min: [-w / 2, -h / 2, -d / 2], max: [w / 2, h / 2, d / 2], size: [w, h, d], center: [0, 0, 0] });
  const items = [
    { bounds: box(280, 60, 40), category: 'body' },
    { bounds: box(170, 75, 38), category: 'triggerbody' },
    { bounds: box(46, 64, 6.5), category: 'innvols' },
    { bounds: box(60, 250, 10), category: 'innvols' },
    { bounds: box(40, 20, 20) },
  ];

  it('puts a part where the user put it, centred in depth, and the rest as the AR-15 layout does', () => {
    const auto = assemblyLayout(items);
    const at = collectionLayout(items.map((item, index) => (index === 1 ? { ...item, place: { x: 10, y: 20 } } : item)));
    expect(at[1]).toEqual({ x: 10, y: 20, z: 0 });
    expect(at[0]).toEqual(auto[0]);
    expect(at[2]).toEqual(auto[2]);
  });

  it('starts the side view from the slots, with the loose parts in columns on the table to the right', () => {
    const side = sideLayout(items);
    const auto = assemblyLayout(items);
    expect(side[0]).toEqual({ x: auto[0].x, y: auto[0].y });
    const right = Math.max(side[0].x + 140, side[1].x + 85);
    for (const index of [2, 3, 4]) expect(side[index].x - items[index].bounds.size[0] / 2).toBeGreaterThan(right);
    expect(side[2].y - 32).toBeCloseTo(0); // the first stands on the table
    expect(side[3].x).toBeGreaterThan(side[2].x); // too tall to stack on it: the next column
    const placed = sideLayout(items.map((item, index) => (index === 2 ? { ...item, place: { x: -5, y: 7 } } : item)));
    expect(placed[2]).toEqual({ x: -5, y: 7 });
  });
});
