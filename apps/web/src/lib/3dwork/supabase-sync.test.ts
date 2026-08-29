import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { buildManifest, geometryUploads } from './github-sync';
import { cloudProjectJson, stripPartThumbnails, work3dCloudUrl } from './supabase-sync';
import type { Part, Project } from './project';

const part = (overrides: Partial<Part> = {}): Part => ({
  id: 'p1',
  name: 'Grip',
  fileName: 'grip.stl',
  slotId: 'grip',
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
  versions: [{ id: 'ver_a', label: 'v1', note: '', triangles: 12, createdAt: 1 }],
  activeVersionId: 'ver_a',
  addedAt: 1,
  thumbnail: 'data:image/png;base64,AAAA',
  ...overrides,
});

describe('cloudProjectJson', () => {
  it('drops data-URL thumbnails on parts and nested group members', () => {
    const nested = part({
      id: 'g',
      name: 'Group',
      group: {
        fitted: [],
        members: [part({ id: 'm', name: 'Member' })],
      },
    });
    const project: Project = {
      id: 'prj',
      name: 'Evo / Scorpion',
      slots: [],
      materialId: 'pla',
      updatedAt: 9,
      parts: [nested],
    };
    const json = cloudProjectJson(project);
    expect(json.parts[0].thumbnail).toBeUndefined();
    expect(json.parts[0].group?.members[0].thumbnail).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('data:image');
    expect(stripPartThumbnails(nested).thumbnail).toBeUndefined();
  });
});

describe('work3d cloud packing', () => {
  it('reuses GitHub fingerprints so an unchanged soup is not uploaded again', () => {
    const soup = cubeSoup(10);
    const next = buildManifest([
      ['ver_a', soup],
      ['ver_b', cubeSoup(8)],
    ]);
    const previous = buildManifest([['ver_a', soup]]);
    expect(geometryUploads(next, previous)).toEqual(['ver_b']);
  });

  it('points at the company Supabase project when local env is localhost', () => {
    expect(work3dCloudUrl()).toMatch(/osfdzskyvisifcwyjkuk|supabase\.co/);
  });
});
