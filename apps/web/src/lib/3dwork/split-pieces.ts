/**
 * A part that is several things in one mesh — a magazine tube, its follower
 * rod and two clips saved together — taken apart into one mesh per thing.
 *
 * Triangles that share a corner are one shell. Shells whose boxes overlap (or
 * nearly touch) stay together: a tube printed as two halves with a collar
 * around them is one thing, and so is a part with a pin through it. What is
 * left over are the separate things the user sees. The user, 18.10.2026:
 * "geturðu skipt þessum hlutum upp, eða ungroup".
 */

/** Shells whose boxes come this close are counted as one thing, mm. */
const TOUCH_MM = 0.3;
/** Corners closer than this are the same corner, mm. */
const WELD_MM = 1e-3;

type Box = { min: [number, number, number]; max: [number, number, number] };

/** The mesh split into the separate things in it, largest first; one piece when it is all one. */
export function splitIntoPieces(soup: Float32Array, touchMm = TOUCH_MM): Float32Array[] {
  const count = Math.floor(soup.length / 9);
  if (count === 0) return [];

  // Shells: union-find over triangles that share a (welded) corner.
  const parent = new Int32Array(count);
  for (let t = 0; t < count; t += 1) parent[t] = t;
  const find = (t: number): number => {
    let root = t;
    while (parent[root] !== root) root = parent[root];
    while (parent[t] !== root) {
      const next = parent[t];
      parent[t] = root;
      t = next;
    }
    return root;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const corner = new Map<string, number>();
  for (let t = 0; t < count; t += 1) {
    for (let v = 0; v < 3; v += 1) {
      const o = t * 9 + v * 3;
      const key = `${Math.round(soup[o] / WELD_MM)},${Math.round(soup[o + 1] / WELD_MM)},${Math.round(soup[o + 2] / WELD_MM)}`;
      const seen = corner.get(key);
      if (seen === undefined) corner.set(key, t);
      else join(seen, t);
    }
  }

  // Each shell's box.
  const shellOf = new Int32Array(count);
  const boxes = new Map<number, Box>();
  for (let t = 0; t < count; t += 1) {
    const root = find(t);
    shellOf[t] = root;
    let box = boxes.get(root);
    if (!box) {
      box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      boxes.set(root, box);
    }
    for (let k = 0; k < 9; k += 1) {
      const axis = k % 3;
      const value = soup[t * 9 + k];
      if (value < box.min[axis]) box.min[axis] = value;
      if (value > box.max[axis]) box.max[axis] = value;
    }
  }

  // Things: shells whose boxes overlap or nearly touch, joined until nothing more joins.
  const shells = [...boxes.keys()];
  const group = new Map<number, number>(shells.map((shell) => [shell, shell]));
  const top = (shell: number): number => {
    let root = shell;
    while (group.get(root) !== root) root = group.get(root)!;
    group.set(shell, root);
    return root;
  };
  const near = (a: Box, b: Box) =>
    [0, 1, 2].every((axis) => a.min[axis] <= b.max[axis] + touchMm && b.min[axis] <= a.max[axis] + touchMm);
  // Grown boxes per thing, so a shell touching any shell of a thing joins it.
  let changed = true;
  const thingBox = new Map<number, Box>(shells.map((shell) => [shell, structuredClone(boxes.get(shell)!)]));
  while (changed) {
    changed = false;
    const roots = [...new Set(shells.map(top))];
    for (let i = 0; i < roots.length; i += 1) {
      for (let j = i + 1; j < roots.length; j += 1) {
        const a = top(roots[i]);
        const b = top(roots[j]);
        if (a === b) continue;
        const boxA = thingBox.get(a)!;
        const boxB = thingBox.get(b)!;
        if (!near(boxA, boxB)) continue;
        group.set(b, a);
        for (let axis = 0; axis < 3; axis += 1) {
          boxA.min[axis] = Math.min(boxA.min[axis], boxB.min[axis]);
          boxA.max[axis] = Math.max(boxA.max[axis], boxB.max[axis]);
        }
        changed = true;
      }
    }
  }

  // One mesh per thing.
  const byThing = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    const thing = top(shellOf[t]);
    const list = byThing.get(thing);
    if (list) list.push(t);
    else byThing.set(thing, [t]);
  }
  // Largest first: the most triangles, and of those the biggest across.
  const across = (thing: number) => {
    const box = thingBox.get(thing)!;
    return Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
  };
  return [...byThing.entries()]
    .sort(([thingA, a], [thingB, b]) => b.length - a.length || across(thingB) - across(thingA))
    .map(([, triangles]) => {
      const out = new Float32Array(triangles.length * 9);
      triangles.forEach((t, index) => out.set(soup.subarray(t * 9, t * 9 + 9), index * 9));
      return out;
    });
}
