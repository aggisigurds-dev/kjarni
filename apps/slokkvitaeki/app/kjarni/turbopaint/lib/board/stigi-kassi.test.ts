import assert from "node:assert/strict";
import { test } from "node:test";
import { stigaRummal } from "./hus3d-stigar";
import { snuaStiga, stigaEndar, stigiUrKassa } from "./veggja-ritill";

let n = 0;
const id = () => "s" + ++n;
const DPM = 50;

test("stigi úr kassa: lárétt langhlið, + (upp) er endinn sem dregið er til, breidd = stutta hliðin", () => {
  const s = stigiUrKassa([100, 200], [400, 260], { thykkt: 7 }, 0.3 * DPM, id)!;
  assert.deepEqual(s.points, [100, 230, 400, 230]);
  assert.equal(s.strokeWidth, 60);
  assert.equal(s.veggTegund, "stigi");
  const e = stigaEndar(s);
  assert.deepEqual(e.upp, [400, 230]);
  assert.deepEqual(e.nidur, [100, 230]);
});

test("stigi úr kassa: dregið upp á við (lóðrétt) — + er efri endinn, dregið niður á við — + er neðri", () => {
  const upp = stigiUrKassa([300, 500], [370, 100], { thykkt: 7 }, 0.3 * DPM, id)!;
  assert.deepEqual(upp.points, [335, 500, 335, 100]);
  assert.equal(upp.strokeWidth, 70);
  const nidur = stigiUrKassa([300, 100], [370, 500], { thykkt: 7 }, 0.3 * DPM, id)!;
  assert.deepEqual(stigaEndar(nidur).upp, [335, 500]);
});

test("stigi: snúa víxlar + og −, tvisvar snýr aftur til upphafs", () => {
  const s = stigiUrKassa([100, 200], [400, 260], { thykkt: 7 }, 0.3 * DPM, id)!;
  const a = snuaStiga(s);
  assert.deepEqual(stigaEndar(a).upp, [100, 230]);
  assert.deepEqual(snuaStiga(a).points, s.points);
});

test("stigi úr mjóum kassa (< 0,3 m): þunn lína A→B með þykkt úr tólastikunni (skástigi)", () => {
  const s = stigiUrKassa([100, 100], [300, 112], { thykkt: 7 }, 0.3 * DPM, id)!;
  assert.deepEqual(s.points, [100, 100, 300, 112]);
  assert.equal(s.strokeWidth, 7);
});

test("3D-stiginn les breidd kassans: 1,2 m kassi gefur 1,2 m breidd", () => {
  const s = stigiUrKassa([0, 0], [250, 60], { thykkt: 7 }, 0.3 * DPM, id)!; // 60 dílar = 1,2 m
  const [ax, ay, bx, by] = s.points;
  const r = stigaRummal({ ax, ay, bx, by, thykkt: s.strokeWidth, tegund: "stigi" } as never, [], DPM);
  assert.equal(r.breidd, 60);
  assert.equal(r.hlidrun, 0);
});
