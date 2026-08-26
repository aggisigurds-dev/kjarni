import { describe, expect, it } from 'vitest';
import { createZip } from './zip';
import { is3mf, parse3mf, exportColored3mf } from './threemf';
import { computeBounds } from './mesh';

/** A unit cube as an indexed 3MF mesh body. */
const CUBE = `
  <vertices>
    <vertex x="0" y="0" z="0" /><vertex x="1" y="0" z="0" />
    <vertex x="1" y="1" z="0" /><vertex x="0" y="1" z="0" />
    <vertex x="0" y="0" z="1" /><vertex x="1" y="0" z="1" />
    <vertex x="1" y="1" z="1" /><vertex x="0" y="1" z="1" />
  </vertices>
  <triangles>
    <triangle v1="0" v2="2" v3="1" /><triangle v1="0" v2="3" v3="2" />
    <triangle v1="4" v2="5" v3="6" /><triangle v1="4" v2="6" v3="7" />
    <triangle v1="0" v2="1" v3="5" /><triangle v1="0" v2="5" v3="4" />
    <triangle v1="1" v2="2" v3="6" /><triangle v1="1" v2="6" v3="5" />
    <triangle v1="2" v2="3" v3="7" /><triangle v1="2" v2="7" v3="6" />
    <triangle v1="3" v2="0" v3="4" /><triangle v1="3" v2="4" v3="7" />
  </triangles>`;

function model(body: string, unit = 'millimeter'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>${body}</resources>
</model>`;
}

/** Wrap a model XML in the zip container a 3MF actually is. */
async function pack(xml: string): Promise<ArrayBuffer> {
  const zip = createZip([
    { name: '[Content_Types].xml', data: new TextEncoder().encode('<Types />') },
    { name: '3D/3dmodel.model', data: new TextEncoder().encode(xml) },
  ]);
  return zip.arrayBuffer();
}

describe('is3mf', () => {
  it('recognises the extension regardless of case', () => {
    expect(is3mf('grip.3mf')).toBe(true);
    expect(is3mf('GRIP.3MF')).toBe(true);
    expect(is3mf('grip.stl')).toBe(false);
  });
});

describe('parse3mf', () => {
  it('expands an indexed mesh into a triangle soup', async () => {
    const objects = await parse3mf(
      await pack(model(`<object id="1" type="model"><mesh>${CUBE}</mesh></object>`))
    );

    expect(objects).toHaveLength(1);
    expect(objects[0].triangles).toBe(12);
    expect(objects[0].soup).toHaveLength(12 * 9);
    expect(computeBounds(objects[0].soup).size).toEqual([1, 1, 1]);
  });

  it('places a mesh by its build transform', async () => {
    const objects = await parse3mf(
      await pack(
        model(`<object id="1" type="model"><mesh>${CUBE}</mesh></object>
        <build><item objectid="1" transform="2 0 0 0 2 0 0 0 2 10 0 0" /></build>`)
      )
    );

    const bounds = computeBounds(objects[0].soup);
    expect(bounds.size).toEqual([2, 2, 2]);
    expect(bounds.min[0]).toBeCloseTo(10, 5);
  });

  it('composes transforms down a nested component tree', async () => {
    // The mesh is a unit cube; the component halves it and the item takes it
    // back up by ten, so only a correctly composed matrix gives a 5 mm cube.
    const objects = await parse3mf(
      await pack(
        model(`<object id="1" type="model"><mesh>${CUBE}</mesh></object>
        <object id="2" type="model" name="assembly">
          <components><component objectid="1" transform="0.5 0 0 0 0.5 0 0 0 0.5 0 0 0" /></components>
        </object>
        <build><item objectid="2" transform="10 0 0 0 10 0 0 0 10 0 0 0" /></build>`)
      )
    );

    expect(objects).toHaveLength(1);
    expect(computeBounds(objects[0].soup).size).toEqual([5, 5, 5]);
    expect(objects[0].name).toBe('assembly');
  });

  it('converts the document unit to millimetres', async () => {
    const objects = await parse3mf(
      await pack(model(`<object id="1" type="model"><mesh>${CUBE}</mesh></object>`, 'inch'))
    );

    expect(computeBounds(objects[0].soup).size[0]).toBeCloseTo(25.4, 4);
  });

  it('falls back to every mesh when there is no build section', async () => {
    const objects = await parse3mf(
      await pack(
        model(`<object id="1" type="model"><mesh>${CUBE}</mesh></object>
        <object id="2" type="model"><mesh>${CUBE}</mesh></object>`)
      )
    );

    expect(objects).toHaveLength(2);
  });

  it('numbers meshes that would otherwise share one inherited name', async () => {
    const objects = await parse3mf(
      await pack(
        model(`<object id="1" type="model"><mesh>${CUBE}</mesh></object>
        <object id="2" type="model" name="shells">
          <components>
            <component objectid="1" /><component objectid="1" />
          </components>
        </object>
        <build><item objectid="2" /></build>`)
      )
    );

    expect(objects.map((o) => o.name)).toEqual(['shells 1', 'shells 2']);
  });

  it('survives a component cycle instead of recursing forever', async () => {
    const objects = await parse3mf(
      await pack(
        model(`<object id="1" type="model">
          <mesh>${CUBE}</mesh>
          <components><component objectid="2" /></components>
        </object>
        <object id="2" type="model"><components><component objectid="1" /></components></object>
        <build><item objectid="1" /></build>`)
      )
    );

    expect(objects).toHaveLength(1);
  });

  it('refuses a file that is not a readable 3MF', async () => {
    await expect(parse3mf(new ArrayBuffer(64))).rejects.toThrow(/readable 3MF/);
  });
});

describe('exportColored3mf', () => {
  it('round-trips a Gold cube so a slicer can keep the colour', async () => {
    const { cubeSoup } = await import('./fixtures');
    const blob = exportColored3mf(
      [{ name: 'Gold plate', soup: cubeSoup(10), color: '#d4af37' }],
      'gold-test'
    );
    const buffer = await blob.arrayBuffer();
    const objects = await parse3mf(buffer);
    expect(objects).toHaveLength(1);
    expect(objects[0].name).toBe('Gold plate');
    expect(objects[0].triangles).toBe(12);
    const bounds = computeBounds(objects[0].soup);
    expect(bounds.size[0]).toBeCloseTo(10, 4);
    expect(bounds.size[1]).toBeCloseTo(10, 4);
    expect(bounds.size[2]).toBeCloseTo(10, 4);
    expect(new TextDecoder().decode(buffer)).toContain('displaycolor="#D4AF37FF"');
  });
});
