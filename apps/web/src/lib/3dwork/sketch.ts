/**
 * The 2D drafting board's document model.
 *
 * Everything here is in millimetres in page space — no pixels, no zoom. The
 * board converts to screen coordinates for display; the data stays in real
 * units so a dimension reads the same at any zoom and exports at true scale.
 */

export interface Point2 {
  x: number;
  y: number;
}

export type SketchShape =
  | { id: string; kind: 'line'; a: Point2; b: Point2 }
  | { id: string; kind: 'rect'; a: Point2; b: Point2 }
  | { id: string; kind: 'circle'; center: Point2; radius: number }
  /** A measured callout between two points; `offset` lifts the line off the part. */
  | { id: string; kind: 'dimension'; a: Point2; b: Point2; offset: number }
  | { id: string; kind: 'note'; at: Point2; text: string };

export type SketchTool = SketchShape['kind'] | 'select';

export const TOOL_LABELS: Record<SketchTool, string> = {
  select: 'Select',
  line: 'Line',
  rect: 'Rectangle',
  circle: 'Circle',
  dimension: 'Dimension',
  note: 'Note',
};

export interface Sketch {
  shapes: SketchShape[];
}

export const emptySketch = (): Sketch => ({ shapes: [] });

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The length of material a shape represents. Dimensions and notes are
 * annotations rather than material, so they measure zero.
 */
export function shapeLength(shape: SketchShape): number {
  switch (shape.kind) {
    case 'line':
      return distance(shape.a, shape.b);
    case 'rect':
      return 2 * (Math.abs(shape.b.x - shape.a.x) + Math.abs(shape.b.y - shape.a.y));
    case 'circle':
      return 2 * Math.PI * shape.radius;
    default:
      return 0;
  }
}

/** What a shape reads as on the page — the number shown next to it. */
export function shapeMeasure(shape: SketchShape): number {
  switch (shape.kind) {
    case 'dimension':
      return distance(shape.a, shape.b);
    case 'circle':
      return shape.radius * 2;
    default:
      return shapeLength(shape);
  }
}

export function shapeLabel(shape: SketchShape): string {
  switch (shape.kind) {
    case 'line':
      return `Line ${shapeLength(shape).toFixed(1)} mm`;
    case 'rect': {
      const w = Math.abs(shape.b.x - shape.a.x);
      const h = Math.abs(shape.b.y - shape.a.y);
      return `Rect ${w.toFixed(1)} × ${h.toFixed(1)} mm`;
    }
    case 'circle':
      return `Circle ⌀${(shape.radius * 2).toFixed(1)} mm`;
    case 'dimension':
      return `Dim ${distance(shape.a, shape.b).toFixed(1)} mm`;
    case 'note':
      return shape.text || 'Note';
  }
}

export interface SketchTotals {
  shapes: number;
  /** Total drawn length of real material, mm. */
  cutLength: number;
  dimensions: number;
}

export function sketchTotals(sketch: Sketch): SketchTotals {
  let cutLength = 0;
  let dimensions = 0;

  for (const shape of sketch.shapes) {
    cutLength += shapeLength(shape);
    if (shape.kind === 'dimension') dimensions++;
  }

  return { shapes: sketch.shapes.length, cutLength, dimensions };
}

export function sketchBounds(sketch: Sketch): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (point: Point2) => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  };

  for (const shape of sketch.shapes) {
    switch (shape.kind) {
      case 'line':
      case 'rect':
      case 'dimension':
        include(shape.a);
        include(shape.b);
        break;
      case 'circle':
        include({ x: shape.center.x - shape.radius, y: shape.center.y - shape.radius });
        include({ x: shape.center.x + shape.radius, y: shape.center.y + shape.radius });
        break;
      case 'note':
        include(shape.at);
        break;
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Perpendicular offset points for a dimension's witness lines. */
export function dimensionGeometry(shape: Extract<SketchShape, { kind: 'dimension' }>): {
  a: Point2;
  b: Point2;
  offsetA: Point2;
  offsetB: Point2;
  mid: Point2;
  angle: number;
} {
  const dx = shape.b.x - shape.a.x;
  const dy = shape.b.y - shape.a.y;
  const length = Math.hypot(dx, dy) || 1;
  // Unit normal, so the dimension line sits `offset` mm clear of the feature.
  const nx = -dy / length;
  const ny = dx / length;

  const offsetA = { x: shape.a.x + nx * shape.offset, y: shape.a.y + ny * shape.offset };
  const offsetB = { x: shape.b.x + nx * shape.offset, y: shape.b.y + ny * shape.offset };

  return {
    a: shape.a,
    b: shape.b,
    offsetA,
    offsetB,
    mid: { x: (offsetA.x + offsetB.x) / 2, y: (offsetA.y + offsetB.y) / 2 },
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SvgOptions {
  title?: string;
  /** Outline segments (x1,y1,x2,y2 per segment) drawn under the sketch. */
  outline?: Float64Array;
  margin?: number;
}

/**
 * Export the board as a true-scale SVG: 1 user unit is 1 mm, and the document
 * is sized in millimetres so it prints at 1:1.
 *
 * Page Y runs up in the model but down in SVG, so the whole drawing is flipped
 * once on the outer group rather than negated shape by shape.
 */
export function toSvg(sketch: Sketch, options: SvgOptions = {}): string {
  const { title = 'kjarni 3dwork sketch', outline, margin = 12 } = options;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const bounds = sketchBounds(sketch);
  if (bounds) {
    minX = bounds.minX;
    minY = bounds.minY;
    maxX = bounds.maxX;
    maxY = bounds.maxY;
  }

  if (outline) {
    for (let i = 0; i + 1 < outline.length; i += 2) {
      if (outline[i] < minX) minX = outline[i];
      if (outline[i] > maxX) maxX = outline[i];
      if (outline[i + 1] < minY) minY = outline[i + 1];
      if (outline[i + 1] > maxY) maxY = outline[i + 1];
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  const width = maxX - minX + margin * 2;
  const height = maxY - minY + margin * 2;
  const body: string[] = [];

  if (outline && outline.length > 0) {
    const paths: string[] = [];
    for (let i = 0; i + 3 < outline.length; i += 4) {
      paths.push(`M${outline[i].toFixed(3)},${outline[i + 1].toFixed(3)}L${outline[i + 2].toFixed(3)},${outline[i + 3].toFixed(3)}`);
    }
    body.push(
      `<path d="${paths.join('')}" fill="none" stroke="#334155" stroke-width="0.4" stroke-linecap="round"/>`
    );
  }

  for (const shape of sketch.shapes) {
    switch (shape.kind) {
      case 'line':
        body.push(
          `<line x1="${shape.a.x}" y1="${shape.a.y}" x2="${shape.b.x}" y2="${shape.b.y}" stroke="#0f172a" stroke-width="0.6" stroke-linecap="round"/>`
        );
        break;
      case 'rect':
        body.push(
          `<rect x="${Math.min(shape.a.x, shape.b.x)}" y="${Math.min(shape.a.y, shape.b.y)}" width="${Math.abs(shape.b.x - shape.a.x)}" height="${Math.abs(shape.b.y - shape.a.y)}" fill="none" stroke="#0f172a" stroke-width="0.6"/>`
        );
        break;
      case 'circle':
        body.push(
          `<circle cx="${shape.center.x}" cy="${shape.center.y}" r="${shape.radius}" fill="none" stroke="#0f172a" stroke-width="0.6"/>`
        );
        break;
      case 'dimension': {
        const geometry = dimensionGeometry(shape);
        const value = distance(shape.a, shape.b).toFixed(1);
        body.push(
          `<g stroke="#b45309" stroke-width="0.35" fill="none">` +
            `<line x1="${geometry.a.x}" y1="${geometry.a.y}" x2="${geometry.offsetA.x}" y2="${geometry.offsetA.y}"/>` +
            `<line x1="${geometry.b.x}" y1="${geometry.b.y}" x2="${geometry.offsetB.x}" y2="${geometry.offsetB.y}"/>` +
            `<line x1="${geometry.offsetA.x}" y1="${geometry.offsetA.y}" x2="${geometry.offsetB.x}" y2="${geometry.offsetB.y}"/>` +
            `</g>` +
            // Flip the label back so text is never upside down or mirrored.
            `<g transform="translate(${geometry.mid.x} ${geometry.mid.y}) scale(1 -1) rotate(${-geometry.angle})">` +
            `<text y="-1.5" text-anchor="middle" font-family="monospace" font-size="4" fill="#b45309">${value}</text>` +
            `</g>`
        );
        break;
      }
      case 'note':
        body.push(
          `<g transform="translate(${shape.at.x} ${shape.at.y}) scale(1 -1)">` +
            `<text font-family="sans-serif" font-size="4" fill="#0f172a">${escapeXml(shape.text)}</text>` +
            `</g>`
        );
        break;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    // One flip puts model-space Y (up) into SVG space (down).
    `<g transform="translate(${margin - minX} ${maxY + margin}) scale(1 -1)">${body.join('')}</g>` +
    `</svg>`
  );
}
