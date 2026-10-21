import assert from "node:assert/strict";
import { test } from "node:test";
import type { Veggbutur } from "./hus3d";
import { stigaRummal, stigar3D } from "./hus3d-stigar";

const butur = (ax: number, ay: number, bx: number, by: number, tegund: Veggbutur["tegund"] = "veggur", thykkt = 8): Veggbutur => ({
  ax,
  ay,
  bx,
  by,
  thykkt,
  tegund,
  litur: "#6d28d9",
  merking: false,
  laus: false,
});

test("stigar3D: býr til hækkandi þrep, dökkar brúnir og tvo hliðarvanga á hvert þrep", () => {
  const metri = 50;
  const veggH = 150;
  const stigi = butur(0, 0, 150, 0, "stigi", 8);
  const r = stigar3D([stigi], [stigi], veggH, metri);

  assert.ok(r.threp.length >= 8 && r.threp.length <= 14, `þrepafjöldi: ${r.threp.length}`);
  assert.equal(r.brir.length, r.threp.length);
  assert.equal(r.vangar.length, r.threp.length * 2);

  // Hvert þrep hækkar jafnt upp í fulla vegghæð og lýsist frá neðsta þrepi til efsta
  for (let i = 1; i < r.threp.length; i++) {
    const fyrra = r.threp[i - 1];
    const nu = r.threp[i];
    assert.ok(nu.y + nu.haed / 2 > fyrra.y + fyrra.haed / 2, "þrep hækkar");
    assert.ok(nu.x > fyrra.x, "þrep færist eftir stefnu stigans");
  }
  const efsta = r.threp[r.threp.length - 1];
  assert.ok(Math.abs(efsta.y + efsta.haed / 2 - veggH) < 1e-6);
  assert.notEqual(r.threp[0].litur, efsta.litur, "hæðarlitbrigði á þrepum");
});

test("stigaRummal: miðjar stiga og fyllir breidd milli tveggja samsíða stigahúsveggja", () => {
  const metri = 50;
  // Stigahúsveggir í y = -35 og y = +45 (innri brúnir ~31 og ~41 -> heildarop ~72 dílar, miðja +5)
  const veggVinstri = butur(0, 45, 200, 45, "veggur", 8);
  const veggHaegri = butur(0, -35, 200, -35, "veggur", 8);
  const stigi = butur(10, 0, 190, 0, "stigi", 8);

  const rum = stigaRummal(stigi, [veggVinstri, veggHaegri, stigi], metri);
  assert.ok(rum.breidd > 65 && rum.breidd < 78, `breidd milli veggja: ${rum.breidd}`);
  assert.ok(rum.hlidrun > 3 && rum.hlidrun < 7, `hliðrun að miðju stigahúss: ${rum.hlidrun}`);
});
