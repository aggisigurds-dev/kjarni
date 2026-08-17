import { describe, expect, it } from 'vitest';
import {
  dimensionGeometry,
  emptySketch,
  shapeLabel,
  shapeLength,
  sketchBounds,
  sketchTotals,
  toSvg,
  type Sketch,
} from './sketch';

const sketch: Sketch = {
  shapes: [
    { id: '1', kind: 'line', a: { x: 0, y: 0 }, b: { x: 30, y: 40 } },
    { id: '2', kind: 'rect', a: { x: 0, y: 0 }, b: { x: 10, y: 20 } },
    { id: '3', kind: 'circle', center: { x: 50, y: 50 }, radius: 10 },
    { id: '4', kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, offset: 8 },
    { id: '5', kind: 'note', at: { x: 5, y: 5 }, text: 'weld here' },
  ],
};

describe('shapeLength', () => {
  it('measures a line as its 3-4-5 hypotenuse', () => {
    expect(shapeLength(sketch.shapes[0])).toBeCloseTo(50, 6);
  });

  it('measures a rectangle as its perimeter', () => {
    expect(shapeLength(sketch.shapes[1])).toBeCloseTo(60, 6);
  });

  it('measures a circle as its circumference', () => {
    expect(shapeLength(sketch.shapes[2])).toBeCloseTo(62.832, 3);
  });

  it('treats annotations as no material', () => {
    expect(shapeLength(sketch.shapes[3])).toBe(0);
    expect(shapeLength(sketch.shapes[4])).toBe(0);
  });
});

describe('sketchTotals', () => {
  it('adds up drawn material without counting annotations', () => {
    const totals = sketchTotals(sketch);

    expect(totals.shapes).toBe(5);
    expect(totals.dimensions).toBe(1);
    expect(totals.cutLength).toBeCloseTo(50 + 60 + 62.832, 3);
  });

  it('is zero for an empty board', () => {
    expect(sketchTotals(emptySketch())).toEqual({ shapes: 0, cutLength: 0, dimensions: 0 });
  });
});

describe('sketchBounds', () => {
  it('covers a circle by its extents, not its centre', () => {
    const bounds = sketchBounds({ shapes: [sketch.shapes[2]] });
    expect(bounds).toEqual({ minX: 40, minY: 40, maxX: 60, maxY: 60 });
  });

  it('is null when there is nothing drawn', () => {
    expect(sketchBounds(emptySketch())).toBeNull();
  });
});

describe('dimensionGeometry', () => {
  it('offsets the dimension line perpendicular to the measured span', () => {
    const geometry = dimensionGeometry({
      id: 'd',
      kind: 'dimension',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      offset: 8,
    });

    // Horizontal span, so the witness lines run straight up by the offset.
    expect(geometry.offsetA).toEqual({ x: 0, y: 8 });
    expect(geometry.offsetB).toEqual({ x: 100, y: 8 });
    expect(geometry.mid).toEqual({ x: 50, y: 8 });
    expect(geometry.angle).toBe(0);
  });
});

describe('shapeLabel', () => {
  it('names each shape with its measurement', () => {
    expect(shapeLabel(sketch.shapes[0])).toBe('Line 50.0 mm');
    expect(shapeLabel(sketch.shapes[1])).toBe('Rect 10.0 × 20.0 mm');
    expect(shapeLabel(sketch.shapes[2])).toBe('Circle ⌀20.0 mm');
    expect(shapeLabel(sketch.shapes[3])).toBe('Dim 100.0 mm');
    expect(shapeLabel(sketch.shapes[4])).toBe('weld here');
  });
});

describe('toSvg', () => {
  it('sizes the document in millimetres so it prints at 1:1', () => {
    const svg = toSvg({ shapes: [sketch.shapes[1]] }, { margin: 10 });

    // A 10x20 rect plus 10 mm margin each side.
    expect(svg).toContain('width="30mm"');
    expect(svg).toContain('height="40mm"');
    expect(svg).toContain('viewBox="0 0 30 40"');
  });

  it('draws each shape kind', () => {
    const svg = toSvg(sketch);

    expect(svg).toContain('<line');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<circle');
    expect(svg).toContain('100.0');
    expect(svg).toContain('weld here');
  });

  it('includes the mesh outline when one is supplied', () => {
    const svg = toSvg(emptySketch(), {
      outline: Float64Array.from([0, 0, 10, 0, 10, 0, 10, 10]),
    });

    expect(svg).toContain('<path d="M0.000,0.000L10.000,0.000');
  });

  it('escapes text so a note cannot break the document', () => {
    const svg = toSvg({
      shapes: [{ id: 'n', kind: 'note', at: { x: 0, y: 0 }, text: '<script>&"' }],
    });

    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
  });

  it('still produces a valid page when nothing is drawn', () => {
    const svg = toSvg(emptySketch());
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
