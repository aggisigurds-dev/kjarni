/** Afturkalla/endurgera fyrir Móta-ritilinn — hreint, prófað í node.
 *
 * Í fullri upplausn er hver mynd tugir MB, svo burstastrik vista aðeins
 * rétthyrninginn sem þau snertu („patch“). Aðgerðir á allri myndinni
 * (líkamsmótun, ljós og litir) vista alla myndina („full“) — þær geta líka
 * breytt hæðinni. Færslur víxla gildum við afturköllun, svo sama færsla þjónar
 * bæði afturkalla og endurgera. Elstu færslum er hent þegar minnið fer yfir
 * `budget`.
 *
 * `mark()` + `revertTo()` styðja ✕ í tóli: allt sem gert var eftir merkið er
 * afturkallað og hverfur (ekki hægt að endurgera hætt-við vinnu). */

import type { Raster } from "../studio/adjust";

export type Rect = { x: number; y: number; w: number; h: number };

type Patch = { kind: "patch"; serial: number; rect: Rect; pixels: Uint8ClampedArray };
type Full = { kind: "full"; serial: number; raster: Raster };
type Entry = Patch | Full;

function entryBytes(e: Entry): number {
  return e.kind === "patch" ? e.pixels.byteLength : e.raster.data.byteLength;
}

/** Klemmir rétthyrning að myndinni; null ef ekkert er eftir. */
export function clipRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w));
  const y1 = Math.min(height, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Afrit af rétthyrningi úr RGBA-gögnum með breidd `width`. */
export function cutRect(data: Uint8ClampedArray, width: number, r: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * width + r.x) * 4;
    out.set(data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return out;
}

/** Víxlar `pixels` og rétthyrningnum í `raster` — eftir köllun geymir
 *  `pixels` það sem var í myndinni. */
function swapRect(raster: Raster, r: Rect, pixels: Uint8ClampedArray): void {
  const row = r.w * 4;
  const tmp = new Uint8ClampedArray(row);
  for (let y = 0; y < r.h; y++) {
    const at = ((r.y + y) * raster.width + r.x) * 4;
    const line = raster.data.subarray(at, at + row);
    const saved = pixels.subarray(y * row, (y + 1) * row);
    tmp.set(line);
    line.set(saved);
    saved.set(tmp);
  }
}

export class EditHistory {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private bytes = 0;
  private serial = 0;
  private readonly budget: number;

  constructor(budget = 192 * 1024 * 1024) {
    this.budget = budget;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Bæti sem færslurnar halda í (fyrir prófanir og greiningu). */
  get usedBytes(): number {
    return this.bytes;
  }

  /** Raðnúmer efstu afturkallanlegu færslunnar (0 ef engin) — í tóli má
   *  aðeins afturkalla það sem gert var eftir merki tólsins. */
  get topSerial(): number {
    return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].serial : 0;
  }

  /** Merki fyrir ✕: revertTo(merki) afturkallar allt sem kemur á eftir. */
  mark(): number {
    return this.serial;
  }

  /** Burstastrik: `before` = pixlar rétthyrningsins áður en strikið kom. */
  pushPatch(rect: Rect, before: Uint8ClampedArray): void {
    this.push({ kind: "patch", serial: ++this.serial, rect, pixels: before });
  }

  /** Aðgerð á allri myndinni: `before` = myndin áður (má vera önnur stærð). */
  pushFull(before: Raster): void {
    this.push({ kind: "full", serial: ++this.serial, raster: before });
  }

  /** Skilar núverandi mynd eftir afturköllun (sama hlutur fyrir patch, annar fyrir full). */
  undo(current: Raster): Raster {
    const e = this.undoStack.pop();
    if (!e) return current;
    const next = this.apply(e, current);
    this.redoStack.push(e);
    return next;
  }

  redo(current: Raster): Raster {
    const e = this.redoStack.pop();
    if (!e) return current;
    const next = this.apply(e, current);
    this.undoStack.push(e);
    return next;
  }

  /** Afturkallar allt eftir `mark` og hendir því (ekki hægt að endurgera). */
  revertTo(mark: number, current: Raster): Raster {
    let raster = current;
    while (this.undoStack.length && this.undoStack[this.undoStack.length - 1].serial > mark) {
      const e = this.undoStack.pop()!;
      raster = this.apply(e, raster);
      this.bytes -= entryBytes(e);
    }
    this.dropRedo();
    return raster;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
  }

  private push(e: Entry): void {
    this.dropRedo();
    this.undoStack.push(e);
    this.bytes += entryBytes(e);
    while (this.bytes > this.budget && this.undoStack.length > 1) {
      const old = this.undoStack.shift()!;
      this.bytes -= entryBytes(old);
    }
  }

  private dropRedo(): void {
    for (const e of this.redoStack) this.bytes -= entryBytes(e);
    this.redoStack = [];
  }

  /** Víxlar færslunni við myndina; færslan geymir á eftir það sem var. */
  private apply(e: Entry, current: Raster): Raster {
    if (e.kind === "patch") {
      swapRect(current, e.rect, e.pixels);
      return current;
    }
    const restored = e.raster;
    e.raster = current;
    return restored;
  }
}
