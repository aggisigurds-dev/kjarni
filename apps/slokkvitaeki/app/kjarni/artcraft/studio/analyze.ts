/** Turn a person cutout into selectable regions: person, garments, background, objects. */

import { createRaster, type Raster } from "./adjust";
import { type GarmentSlot } from "./garments";

export type RegionKind = "person" | "clothes" | "head" | "background" | "object";

export type AnalyzedRegion = {
  id: string;
  kind: RegionKind;
  label: string;
  mask: Raster;
  coverage: number;
  hidden?: boolean;
  slot?: GarmentSlot;
};

export function coverageOf(mask: Raster, threshold = 20): number {
  let on = 0;
  const n = mask.width * mask.height;
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i] > threshold) on += 1;
  }
  return n === 0 ? 0 : on / n;
}

export function personMaskFromCutout(cutout: Raster, threshold = 16): Raster {
  const mask = createRaster(cutout.width, cutout.height, 0);
  for (let i = 0; i < cutout.data.length; i += 4) {
    const on = cutout.data[i + 3] > threshold ? 255 : 0;
    mask.data[i] = on;
    mask.data[i + 1] = on;
    mask.data[i + 2] = on;
    mask.data[i + 3] = 255;
  }
  return mask;
}

export function invertMask(mask: Raster): Raster {
  const out = createRaster(mask.width, mask.height, 0);
  for (let i = 0; i < mask.data.length; i += 4) {
    const on = mask.data[i] > 20 ? 0 : 255;
    out.data[i] = on;
    out.data[i + 1] = on;
    out.data[i + 2] = on;
    out.data[i + 3] = 255;
  }
  return out;
}

export function personBBox(mask: Raster, threshold = 20): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[(y * mask.width + x) * 4] <= threshold) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function bboxMask(person: Raster, y0f: number, y1f: number, x0f = 0, x1f = 1): Raster {
  const box = personBBox(person);
  const out = createRaster(person.width, person.height, 0);
  if (!box) return out;
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const top = box.y0 + bh * Math.min(y0f, y1f);
  const bot = box.y0 + bh * Math.max(y0f, y1f);
  const left = box.x0 + bw * Math.min(x0f, x1f);
  const right = box.x0 + bw * Math.max(x0f, x1f);
  for (let y = 0; y < person.height; y++) {
    if (y < top || y > bot) continue;
    for (let x = 0; x < person.width; x++) {
      if (x < left || x > right) continue;
      const i = (y * person.width + x) * 4;
      if (person.data[i] <= 20) continue;
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

export function bandMask(person: Raster, y0f: number, y1f: number): Raster {
  return bboxMask(person, y0f, y1f, 0, 1);
}

export function subtractMask(from: Raster, cut: Raster): Raster {
  const out = createRaster(from.width, from.height, 0);
  const n = Math.min(from.data.length, cut.data.length);
  for (let i = 0; i < n; i += 4) {
    const on = from.data[i] > 20 && cut.data[i] <= 20 ? 255 : 0;
    out.data[i] = on;
    out.data[i + 1] = on;
    out.data[i + 2] = on;
    out.data[i + 3] = 255;
  }
  return out;
}

export function sleeveMask(person: Raster, y0f: number, y1f: number, inner0 = 0.32, inner1 = 0.68): Raster {
  return subtractMask(bboxMask(person, y0f, y1f, 0, 1), bboxMask(person, y0f, y1f, inner0, inner1));
}

function pushGarment(
  regions: AnalyzedRegion[],
  id: string,
  label: string,
  mask: Raster,
  slot: GarmentSlot,
  hidden = false,
  min = 0.004,
): void {
  const cov = coverageOf(mask);
  if (cov <= min) return;
  regions.push({ id, kind: "clothes", label, mask, coverage: cov, hidden, slot });
}

export function garmentRegions(person: Raster): AnalyzedRegion[] {
  const out: AnalyzedRegion[] = [];
  pushGarment(out, "top", "Bolur", bboxMask(person, 0.22, 0.5, 0.22, 0.78), "top");
  pushGarment(out, "sleeves", "Ermar", sleeveMask(person, 0.16, 0.5), "sleeves");
  pushGarment(out, "pants", "Buxur", bboxMask(person, 0.5, 0.9), "pants");
  pushGarment(out, "shoes", "Skór", bboxMask(person, 0.86, 1), "shoes", false, 0.002);
  pushGarment(out, "shortsZone", "Stuttbuxnasvæði", bboxMask(person, 0.5, 0.68), "pants", true);
  pushGarment(out, "shortSleeveZone", "Stuttermasvæði", sleeveMask(person, 0.16, 0.34), "sleeves", true);
  return out;
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function kMeansBg(image: Raster, person: Raster, k = 4): Uint8Array {
  const w = image.width;
  const h = image.height;
  const n = w * h;
  const isPerson = new Uint8Array(n);
  const samples: Array<[number, number, number]> = [];
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (person.data[i] > 20) {
      isPerson[p] = 1;
      continue;
    }
    if (samples.length < 2400 && p % 7 === 0) {
      samples.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
    }
  }
  if (samples.length < 8) return new Uint8Array(n);

  const centers: Array<[number, number, number]> = [];
  const step = Math.max(1, Math.floor(samples.length / k));
  for (let c = 0; c < k; c++) centers.push(samples[Math.min(samples.length - 1, c * step)]);

  const assign = new Int16Array(samples.length);
  for (let iter = 0; iter < 7; iter++) {
    for (let s = 0; s < samples.length; s++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = colorDist(samples[s], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[s] = best;
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0] as [number, number, number, number]);
    for (let s = 0; s < samples.length; s++) {
      const c = assign[s];
      sum[c][0] += samples[s][0];
      sum[c][1] += samples[s][1];
      sum[c][2] += samples[s][2];
      sum[c][3] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sum[c][3] === 0) continue;
      centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
    }
  }

  const labels = new Uint8Array(n);
  const counts = new Array(k).fill(0);
  for (let p = 0; p < n; p++) {
    if (isPerson[p]) {
      labels[p] = 255;
      continue;
    }
    const i = p * 4;
    const rgb: [number, number, number] = [image.data[i], image.data[i + 1], image.data[i + 2]];
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = colorDist(rgb, centers[c]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    labels[p] = best;
    counts[best] += 1;
  }

  let backdrop = 0;
  for (let c = 1; c < k; c++) if (counts[c] > counts[backdrop]) backdrop = c;

  const mark = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (isPerson[p]) continue;
    if (labels[p] !== backdrop) mark[p] = 1;
  }
  return mark;
}

function componentsToMasks(mark: Uint8Array, width: number, height: number, limit: number): Raster[] {
  const n = width * height;
  const seen = new Uint8Array(n);
  const out: Array<{ area: number; pixels: number[] }> = [];
  const minA = Math.floor(n * 0.008);
  const maxA = Math.floor(n * 0.2);

  for (let start = 0; start < n; start++) {
    if (!mark[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const pixels: number[] = [];
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && mark[p - 1] && !seen[p - 1]) {
        seen[p - 1] = 1;
        stack.push(p - 1);
      }
      if (x + 1 < width && mark[p + 1] && !seen[p + 1]) {
        seen[p + 1] = 1;
        stack.push(p + 1);
      }
      if (y > 0 && mark[p - width] && !seen[p - width]) {
        seen[p - width] = 1;
        stack.push(p - width);
      }
      if (y + 1 < height && mark[p + width] && !seen[p + width]) {
        seen[p + width] = 1;
        stack.push(p + width);
      }
    }
    if (pixels.length >= minA && pixels.length <= maxA) out.push({ area: pixels.length, pixels });
  }

  out.sort((a, b) => b.area - a.area);
  return out.slice(0, limit).map((comp) => {
    const mask = createRaster(width, height, 0);
    for (const p of comp.pixels) {
      const i = p * 4;
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
      mask.data[i + 3] = 255;
    }
    return mask;
  });
}

export function objectMasks(image: Raster, person: Raster, limit = 3): Raster[] {
  return componentsToMasks(kMeansBg(image, person), image.width, image.height, limit);
}

export function regionsFromPerson(image: Raster, person: Raster): AnalyzedRegion[] {
  const regions: AnalyzedRegion[] = [];
  const personCov = coverageOf(person);
  if (personCov > 0.01) {
    regions.push({ id: "person", kind: "person", label: "Manneskja", mask: person, coverage: personCov });
    const head = bandMask(person, 0, 0.34);
    const headCov = coverageOf(head);
    if (headCov > 0.004) {
      regions.push({ id: "head", kind: "head", label: "Andlit / hár", mask: head, coverage: headCov });
    }
    const bodyUnder = subtractMask(person, head);
    const bodyCov = coverageOf(bodyUnder);
    if (bodyCov > 0.01) {
      regions.push({
        id: "bodyUnder",
        kind: "clothes",
        label: "Líkami undir",
        mask: bodyUnder,
        coverage: bodyCov,
        hidden: true,
      });
    }
    regions.push(...garmentRegions(person));
  }
  const background = invertMask(person);
  regions.push({
    id: "background",
    kind: "background",
    label: "Bakgrunnur",
    mask: background,
    coverage: coverageOf(background),
  });
  objectMasks(image, person).forEach((mask, i) => {
    regions.push({
      id: `object-${i + 1}`,
      kind: "object",
      label: `Hlutur ${i + 1}`,
      mask,
      coverage: coverageOf(mask),
    });
  });
  return regions;
}

export function actionPrompt(
  kind: RegionKind,
  action: "remove" | "recolor" | "background",
  extra = "",
): string {
  const detail = extra.trim();
  if (action === "remove") {
    if (kind === "background") return "remove the background, clean studio backdrop, keep the same adult person and pose";
    if (kind === "clothes") return "remove the clothing, keep the same adult person, natural skin, keep face and pose";
    if (kind === "head") return "keep the same adult person, only change the head area as asked, keep pose";
    if (kind === "object") return "remove this object, fill with matching surroundings, keep the person and pose";
    return "remove the person, fill with matching background";
  }
  if (action === "recolor") {
    const color = detail || "red";
    if (kind === "clothes") {
      return `same adult person, change the clothing color to ${color}, keep face, body and pose`;
    }
    if (kind === "background") {
      return `keep the same person and pose, change the background color/mood to ${color}`;
    }
    if (kind === "object") return `change this object to ${color}, keep the person and pose`;
    return `same adult person, change this area to ${color}, keep face and pose`;
  }
  return `keep the same adult person and pose, new background: ${detail || "soft natural light, outdoor"}`;
}

export function actionDenoising(action: "remove" | "recolor" | "background"): number {
  if (action === "recolor") return 0.42;
  if (action === "background") return 0.58;
  return 0.62;
}
