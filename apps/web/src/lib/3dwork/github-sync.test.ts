import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import {
  buildManifest,
  geometryUploads,
  projectVersionIds,
  soupFingerprint,
  upsertIndex,
} from './github-sync';

describe('soupFingerprint', () => {
  it('is stable for the same soup', () => {
    const soup = cubeSoup(10);
    expect(soupFingerprint(soup)).toBe(soupFingerprint(Float32Array.from(soup)));
  });

  it('changes when the mesh changes', () => {
    const a = cubeSoup(10);
    const b = cubeSoup(12);
    expect(soupFingerprint(a)).not.toBe(soupFingerprint(b));
  });
});

describe('geometryUploads', () => {
  it('uploads everything on the first save', () => {
    const soup = cubeSoup(10);
    const next = buildManifest([['ver_a', soup]]);
    expect(geometryUploads(next, null)).toEqual(['ver_a']);
  });

  it('skips meshes GitHub already has', () => {
    const soup = cubeSoup(10);
    const next = buildManifest([
      ['ver_a', soup],
      ['ver_b', cubeSoup(8)],
    ]);
    const previous = buildManifest([['ver_a', soup]]);
    expect(geometryUploads(next, previous)).toEqual(['ver_b']);
  });
});

describe('upsertIndex', () => {
  it('puts the newest project first and replaces an existing row', () => {
    const index = upsertIndex(
      [
        { id: 'old', name: 'Old', parts: 1, updatedAt: 1 },
        { id: 'keep', name: 'Keep', parts: 2, updatedAt: 2 },
      ],
      { id: 'old', name: 'Renamed', parts: 4, updatedAt: 9 }
    );
    expect(index[0]).toMatchObject({ id: 'old', name: 'Renamed', parts: 4 });
    expect(index.map((row) => row.id)).toEqual(['old', 'keep']);
  });
});

describe('projectVersionIds', () => {
  it('walks nested group members', () => {
    const ids = projectVersionIds({
      id: 'p',
      name: 'P',
      slots: [],
      materialId: 'pla',
      updatedAt: 1,
      parts: [
        {
          id: 'g',
          name: 'Group',
          fileName: '',
          slotId: '',
          color: '#000',
          visible: true,
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          triangles: 0,
          materialId: 'pla',
          notes: '',
          versions: [{ id: 'ver_group', label: 'v1', note: '', triangles: 0, createdAt: 1 }],
          activeVersionId: 'ver_group',
          addedAt: 1,
          group: {
            fitted: [],
            members: [
              {
                id: 'm',
                name: 'Member',
                fileName: '',
                slotId: '',
                color: '#000',
                visible: true,
                transform: {
                  position: { x: 0, y: 0, z: 0 },
                  rotation: { x: 0, y: 0, z: 0 },
                  scale: { x: 1, y: 1, z: 1 },
                },
                triangles: 0,
                materialId: 'pla',
                notes: '',
                versions: [{ id: 'ver_member', label: 'v1', note: '', triangles: 0, createdAt: 1 }],
                activeVersionId: 'ver_member',
                addedAt: 1,
              },
            ],
          },
        },
      ],
    });
    expect(ids).toEqual(['ver_group', 'ver_member']);
  });
});
