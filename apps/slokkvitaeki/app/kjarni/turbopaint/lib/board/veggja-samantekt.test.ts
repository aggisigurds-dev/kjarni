import assert from "node:assert/strict";
import { test } from "node:test";
import { veggjaSamantekt } from "./veggja-samantekt";
import type { BoardObject, LineObject, RectObject, SymbolObject } from "./types";

const base = { x: 0, y: 0, rotation: 0, opacity: 1, locked: false, hidden: false, name: "" };
const vegg = (id: string, points: number[], extra: Partial<LineObject> = {}): LineObject => ({
  ...base, id, type: "polyline", points, stroke: "#000", strokeWidth: 4, dash: "solid", veggur: true, name: "Veggur", ...extra,
});
const rymi = (id: string, w: number, h: number, extra: Partial<RectObject> = {}): RectObject => ({
  ...base, id, type: "rect", width: w, height: h, fill: "transparent", stroke: "#000", strokeWidth: 1, cornerRadius: 0, isRoom: true, ...extra,
});
const tákn = (id: string, symbolId: string): SymbolObject => ({ ...base, id, type: "symbol", symbolId, size: 24, label: "" });

test("veggjaSamantekt: fjöldi og lengd eftir tegund með kvarða (100 dílar = 1 m)", () => {
  const obj: BoardObject[] = [
    vegg("a", [0, 0, 1000, 0], { veggTegund: "veggur" }),
    vegg("b", [0, 0, 0, 500], { veggTegund: "ei60" }),
    vegg("c", [0, 0, 300, 0], { veggTegund: "gler" }),
    vegg("d", [0, 0, 90, 0], { veggTegund: "hurd" }),
    vegg("e", [0, 0, 200, 0]),
  ];
  const s = veggjaSamantekt(obj, 100);
  assert.equal(s.veggir, 5);
  assert.deepEqual(s.eftirTegund.veggur, { n: 2, metrar: 12 });
  assert.deepEqual(s.eftirTegund.ei60, { n: 1, metrar: 5 });
  assert.deepEqual(s.eftirTegund.gler, { n: 1, metrar: 3 });
  assert.deepEqual(s.eftirTegund.hurd, { n: 1, metrar: 0.9 });
  assert.equal(s.metrarVeggir, 17, "veggir hússins = veggur + EI + svalir, ekki gler né hurðir");
  assert.equal(s.oflokkadir, 1, "e hefur enga veggTegund");
  assert.equal(s.kvardi, "kvardi");
});

test("veggjaSamantekt: enginn kvarði → fjöldi en engir metrar", () => {
  const s = veggjaSamantekt([vegg("a", [0, 0, 1000, 0])], null);
  assert.equal(s.veggir, 1);
  assert.equal(s.metrarVeggir, null);
  assert.equal(s.eftirTegund.veggur.metrar, null);
  assert.equal(s.kvardi, null);
});

test("veggjaSamantekt: falið og ekki-veggir teljast ekki; rými, m² og tæki talin", () => {
  const obj: BoardObject[] = [
    vegg("a", [0, 0, 100, 0]),
    vegg("h", [0, 0, 100, 0], { hidden: true }),
    { ...vegg("l", [0, 0, 100, 0]), veggur: false, name: "Lína", layerId: "almennt" },
    rymi("r1", 500, 400),
    rymi("r2", 100, 100, { roomExcluded: true }),
    rymi("r3", 100, 100, { roomCounted: false }),
    tákn("s1", "extinguisher-duft"), tákn("s2", "extinguisher"), tákn("s3", "hose"), tákn("s4", "exit"), tákn("s5", "detector"),
  ];
  const s = veggjaSamantekt(obj, 100);
  assert.equal(s.veggir, 1);
  assert.equal(s.rymi, 2, "r3 er undanskilið magntöflu");
  assert.equal(s.rymiM2, 20, "500×400 dílar = 5×4 m = 20 m²; r2 (útilokað) ekki með");
  assert.deepEqual(s.taeki, { slokkvitaeki: 2, slanga: 1, ut: 1 });
});
