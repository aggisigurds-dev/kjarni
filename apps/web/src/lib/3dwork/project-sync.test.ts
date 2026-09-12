import { describe, expect, it } from 'vitest';
import {
  buildLabel,
  cloudIsNewer,
  localSaveStamp,
  mergeGeometries,
  mergeProjectLists,
  mergeProjects,
  nameFromFirstParts,
  partsLine,
  sinceLabel,
} from './project-sync';
import type { Part, Project } from './project';

const part = (id: string, overrides: Partial<Part> = {}): Part => ({
  id,
  name: id,
  fileName: `${id}.stl`,
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
  versions: [{ id: `ver_${id}`, label: 'v1', note: '', triangles: 12, createdAt: 1 }],
  activeVersionId: `ver_${id}`,
  addedAt: 1,
  ...overrides,
});

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'prj_a',
  name: 'Blaster',
  slots: [
    { id: 'body', name: 'Body', anchor: { x: 0, y: 0, z: 0 }, activePartId: null },
    { id: 'barrel', name: 'Barrel', anchor: { x: 1, y: 0, z: 0 }, activePartId: null },
  ],
  parts: [],
  materialId: 'pla',
  updatedAt: 1000,
  ...overrides,
});

describe('cloudIsNewer', () => {
  it('ignores stamps inside the debounce window', () => {
    expect(cloudIsNewer(10_000, 11_000)).toBe(false);
    expect(cloudIsNewer(10_000, 10_000)).toBe(false);
    expect(cloudIsNewer(10_000, 9_000)).toBe(false);
  });

  it('spots a save made on another computer', () => {
    expect(cloudIsNewer(10_000, 20_000)).toBe(true);
    expect(cloudIsNewer(undefined, 20_000)).toBe(true);
    expect(cloudIsNewer(10_000, undefined)).toBe(false);
  });
});

describe('localSaveStamp', () => {
  it('keeps an untouched build level with the cloud copy it came from', () => {
    const fromCloud = project({ updatedAt: 50_000 });
    const stamp = localSaveStamp(fromCloud, { project: fromCloud, stamp: 50_000 });
    expect(stamp).toBe(50_000);
    expect(cloudIsNewer(50_000, stamp)).toBe(false);
  });

  it('stamps an edit made here with the save time', () => {
    const fromCloud = project({ updatedAt: 50_000 });
    const edited = { ...fromCloud, name: 'Renamed here' };
    expect(localSaveStamp(edited, { project: fromCloud, stamp: 50_000 })).toBeUndefined();
  });

  it('stamps a blank draft with the save time', () => {
    const draft = project();
    expect(localSaveStamp(draft, { project: draft })).toBeUndefined();
  });
});

describe('buildLabel', () => {
  it('calls a build that still has a placeholder name by its parts', () => {
    expect(
      buildLabel('New build', ['Shape-Cylinder.stl33', '- GW16 loftsystem efri hluti2_260207_182331'])
    ).toBe('Shape-Cylinder + GW16 loftsystem efri hluti2');
    expect(buildLabel('Untitled blaster', ['- A - BT4 - Valken g15 receiver'])).toBe(
      'A - BT4 - Valken g15 receiver'
    );
  });

  it('keeps a name someone chose', () => {
    expect(buildLabel('GW16 upper', ['Shape-Cylinder.stl33'])).toBe('GW16 upper');
  });

  it('counts the parts it does not name', () => {
    expect(buildLabel('New build', ['grip', 'barrel', 'stock', 'mag'])).toBe('grip + barrel +2');
  });

  it('keeps the placeholder for an empty build', () => {
    expect(buildLabel('New build', [])).toBe('New build');
  });
});

describe('partsLine', () => {
  it('lists the first few parts and counts the rest', () => {
    expect(partsLine(['grip-test', 'Box 30 mm'])).toBe('grip-test · Box 30 mm');
    expect(partsLine(['a', 'b', 'c', 'd', 'e'])).toBe('a · b · c · +2 more');
  });
});

describe('nameFromFirstParts', () => {
  it('names a new build after the first thing put in it', () => {
    expect(nameFromFirstParts('New build', ['- A - BT4 - Valken g15 receiver', 'grip'])).toBe(
      'A - BT4 - Valken g15 receiver'
    );
  });

  it('leaves a chosen name alone', () => {
    expect(nameFromFirstParts('My receiver', ['grip-test'])).toBe('My receiver');
  });
});

describe('mergeProjectLists pictures', () => {
  it('keeps the pictures from this computer when Supabase has a newer copy of the build', () => {
    const [entry] = mergeProjectLists(
      [{ id: 'a', name: 'New build', parts: 1, updatedAt: 10_000, thumbnails: ['data:image/png;base64,AAAA'] }],
      [{ id: 'a', name: 'New build', parts: 1, updatedAt: 60_000, partNames: ['grip'] }]
    );
    expect(entry.thumbnails).toEqual(['data:image/png;base64,AAAA']);
    expect(entry.partNames).toEqual(['grip']);
  });
});

describe('mergeProjectLists', () => {
  it('shows cloud-only projects so a fresh computer can jump to them', () => {
    const list = mergeProjectLists(
      [{ id: 'a', name: 'Local only', parts: 3, updatedAt: 5 }],
      [{ id: 'b', name: 'From the office PC', parts: 11, updatedAt: 9 }]
    );
    expect(list.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ cloud: true, local: false, parts: 11 });
    expect(list[1]).toMatchObject({ cloud: false, local: true });
  });

  it('takes the cloud name and count only when the cloud copy is clearly newer', () => {
    const [same] = mergeProjectLists(
      [{ id: 'a', name: 'Mine', parts: 3, updatedAt: 10_000 }],
      [{ id: 'a', name: 'Theirs', parts: 4, updatedAt: 11_000 }]
    );
    expect(same).toMatchObject({ name: 'Mine', parts: 3, cloud: true, local: true, updatedAt: 11_000 });

    const [newer] = mergeProjectLists(
      [{ id: 'a', name: 'Mine', parts: 3, updatedAt: 10_000 }],
      [{ id: 'a', name: 'Theirs', parts: 4, updatedAt: 30_000 }]
    );
    expect(newer).toMatchObject({ name: 'Theirs', parts: 4, cloud: true, local: true });
  });
});

describe('mergeProjects', () => {
  it('returns the local project untouched when the cloud adds nothing', () => {
    const local = project({ parts: [part('grip')] });
    const cloud = project({ parts: [part('grip', { name: 'renamed elsewhere' })] });
    const merged = mergeProjects(local, cloud);
    expect(merged.project).toBe(local);
    expect(merged.addedFromCloud).toEqual([]);
  });

  it('brings in a part uploaded on the other computer and keeps local edits', () => {
    const local = project({ parts: [part('grip', { name: 'Grip (edited here)' })], updatedAt: 5000 });
    const cloud = project({
      parts: [part('grip'), part('barrel')],
      slots: [
        { id: 'body', name: 'Body', anchor: { x: 0, y: 0, z: 0 }, activePartId: null },
        { id: 'barrel', name: 'Barrel', anchor: { x: 1, y: 0, z: 0 }, activePartId: 'barrel' },
      ],
      updatedAt: 9000,
    });
    const merged = mergeProjects(local, cloud);
    expect(merged.addedFromCloud.map((entry) => entry.id)).toEqual(['barrel']);
    expect(merged.project.parts.map((entry) => entry.name)).toEqual(['Grip (edited here)', 'barrel']);
    expect(merged.project.slots.find((slot) => slot.id === 'barrel')?.activePartId).toBe('barrel');
    expect(merged.project.updatedAt).toBe(9000);
  });

  it('sees parts inside local groups so they are not duplicated', () => {
    const grouped = part('bundle', { group: { members: [part('inner')], fitted: [] } });
    const local = project({ parts: [grouped] });
    const cloud = project({ parts: [part('inner')] });
    expect(mergeProjects(local, cloud).addedFromCloud).toEqual([]);
  });
});

describe('mergeGeometries', () => {
  it('adds cloud meshes this computer lacks without replacing local ones', () => {
    const mine = new Float32Array([1, 2, 3]);
    const merged = mergeGeometries(
      new Map([['ver_a', mine]]),
      new Map([
        ['ver_a', new Float32Array([9, 9, 9])],
        ['ver_b', new Float32Array([4, 5, 6])],
      ])
    );
    expect(merged.get('ver_a')).toBe(mine);
    expect(Array.from(merged.get('ver_b') ?? [])).toEqual([4, 5, 6]);
  });
});

describe('sinceLabel', () => {
  it('reads like a person would say it', () => {
    const now = Date.UTC(2026, 8, 4, 12, 0, 0);
    expect(sinceLabel(0, now)).toBe('');
    expect(sinceLabel(now - 20_000, now)).toBe('now');
    expect(sinceLabel(now - 5 * 60_000, now)).toBe('5 min');
    expect(sinceLabel(now - 3 * 3_600_000, now)).toBe('3 h');
    expect(sinceLabel(now - 2 * 86_400_000, now)).toBe('2 d');
    expect(sinceLabel(now - 7 * 86_400_000, now)).toBe('7 d');
    expect(sinceLabel(Date.UTC(2026, 7, 4, 12), now)).toMatch(/^4\.8\.$/);
  });
});
