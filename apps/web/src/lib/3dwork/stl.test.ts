import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { exportBinaryStl, parseStl } from './stl';

const ASCII_CUBE_FACE = `solid test
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 10 0
      vertex 10 10 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 10 10 0
      vertex 10 0 0
    endloop
  endfacet
endsolid test
`;

describe('parseStl', () => {
  it('round-trips a binary export without losing geometry', () => {
    const soup = cubeSoup(10);
    const parsed = parseStl(exportBinaryStl([soup]));

    expect(parsed.triangles).toBe(12);
    expect(Array.from(parsed.positions)).toEqual(Array.from(soup));
  });

  it('reads ASCII files', () => {
    const buffer = new TextEncoder().encode(ASCII_CUBE_FACE).buffer as ArrayBuffer;
    const parsed = parseStl(buffer);

    expect(parsed.triangles).toBe(2);
    expect(Array.from(parsed.positions.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(parsed.fileNormals.slice(0, 3))).toEqual([0, 0, -1]);
  });

  it('recomputes face normals on export rather than trusting the input', () => {
    const parsed = parseStl(exportBinaryStl([cubeSoup(10)]));
    // The -Z face is written first and must point away from the solid.
    expect(Array.from(parsed.fileNormals.slice(0, 3))).toEqual([0, 0, -1]);
  });

  it('merges several parts into one file', () => {
    const combined = parseStl(exportBinaryStl([cubeSoup(10), cubeSoup(4)]));
    expect(combined.triangles).toBe(24);
  });

  it('rejects data that is not an STL at all', () => {
    const tiny = new TextEncoder().encode('nope').buffer as ArrayBuffer;
    expect(() => parseStl(tiny)).toThrow();
  });
});
