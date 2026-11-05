import assert from "node:assert/strict";
import { test } from "node:test";
import { smatengingar3D } from "./hus3d-smasamkeyti";
import type { Veggbutur } from "./hus3d";
const wall = (ax: number, ay: number, bx: number, by: number, type: Veggbutur["tegund"] = "veggur"): Veggbutur => ({ax,ay,bx,by,thykkt:12,litur:"#fff",tegund:type,eld:0,merking:false});
test("joins two 6 cm gaps visually without modifying originals", () => {
  const first = wall(0,0,190,0), second = wall(196,0,400,0);
  const result = smatengingar3D([first, second], 100);
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].ax,result[0].bx],[190,196]);
  assert.equal(first.bx,190);
  assert.equal(second.ax,196);
});
test("preserves 90 cm door opening and existing door/glass tagged spans", () => {
  const a = wall(0,0,200,0), b = wall(290,0,500,0);
  assert.equal(smatengingar3D([a,b],100).length,0);
  const c = wall(206,0,500,0);
  assert.equal(smatengingar3D([a,c,wall(200,0,206,0,"hurd")],100).length,0);
  assert.equal(smatengingar3D([a,c,wall(200,0,206,0,"gler")],100).length,0);
});
test("does not connect perpendicular lines, unrelated walls, or long gaps", () => {
  assert.equal(smatengingar3D([wall(0,0,200,0),wall(206,0,206,200)],100).length,0);
  assert.equal(smatengingar3D([wall(0,0,200,0),wall(220,0,400,0)],100).length,0);
});
test("handles tilted co-linear segments without filling bigger openings", () => {
  const rad = 4.6*Math.PI/180;
  const p = (x:number): [number,number] => [x*Math.cos(rad), x*Math.sin(rad)];
  const a = wall(...p(0),...p(200)), b = wall(...p(205),...p(400));
  assert.equal(smatengingar3D([a,b],100).length,1);
});
