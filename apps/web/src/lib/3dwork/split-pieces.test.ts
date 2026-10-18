import { describe, expect, it } from 'vitest';
import { splitIntoPieces } from './split-pieces';

/** A closed box as 12 triangles. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  return faces.flatMap((face) => face.flatMap((index) => v[index]));
}

describe('splitIntoPieces', () => {
  it('takes apart things that lie apart — a tube, a rod and a clip — largest first', () => {
    const soup = new Float32Array([
      ...box(0, 0, 0, 2, 2, 2), // clip
      ...box(10, 0, 0, 20, 100, 10), // tube
      ...box(30, 0, 0, 33, 90, 3), // rod
    ]);
    const pieces = splitIntoPieces(soup);
    expect(pieces).toHaveLength(3);
    expect(pieces.map((piece) => piece.length / 9)).toEqual([12, 12, 12]);
    // Largest first: the tube, then the rod.
    const spanY = (piece: Float32Array) => Math.max(...piece.filter((_, i) => i % 3 === 1)) - Math.min(...piece.filter((_, i) => i % 3 === 1));
    expect(spanY(pieces[0])).toBeGreaterThanOrEqual(spanY(pieces[1]));
  });

  it('keeps shells that overlap together: halves in a collar, a pin through a part', () => {
    const soup = new Float32Array([
      ...box(0, 0, 0, 10, 10, 5), // one half
      ...box(0, 0, 5, 10, 10, 10), // the other half, face to face
      ...box(-1, 4, -1, 11, 6, 11), // a collar around both
      ...box(50, 0, 0, 60, 10, 10), // something else, apart
    ]);
    const pieces = splitIntoPieces(soup);
    expect(pieces.map((piece) => piece.length / 9).sort((a, b) => b - a)).toEqual([36, 12]);
  });

  it('gives back one piece for a part that is all one, and none for nothing', () => {
    expect(splitIntoPieces(new Float32Array(box(0, 0, 0, 5, 5, 5)))).toHaveLength(1);
    expect(splitIntoPieces(new Float32Array(0))).toHaveLength(0);
  });

  it('joins things that nearly touch, but not ones a millimetre apart', () => {
    const close = splitIntoPieces(new Float32Array([...box(0, 0, 0, 5, 5, 5), ...box(5.2, 0, 0, 9, 5, 5)]));
    expect(close).toHaveLength(1);
    const apart = splitIntoPieces(new Float32Array([...box(0, 0, 0, 5, 5, 5), ...box(6, 0, 0, 9, 5, 5)]));
    expect(apart).toHaveLength(2);
  });
});
