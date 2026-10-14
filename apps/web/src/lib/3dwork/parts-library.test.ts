import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import {
  BOARD_GAP_MM,
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
