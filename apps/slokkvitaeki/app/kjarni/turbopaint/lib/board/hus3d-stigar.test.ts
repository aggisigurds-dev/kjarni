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

test("stigar3D: stakur stigabútur býr til hækkandi þrep, hallandi stigakjarna, hliðarvanga og handrið", () => {
  const metri = 50;
  const veggH = 150;
  const stigi = butur(0, 0, 150, 0, "stigi", 8);
  const r = stigar3D([stigi], [stigi], veggH, metri);

  assert.ok(r.threp.length >= 8 && r.threp.length <= 14, `þrepafjöldi: ${r.threp.length}`);
  // Hvert þrep fær frambrún + 2 hallandi handrið á hliðum
  assert.equal(r.brir.length, r.threp.length + 2);
  // Hallandi burðarkjarni (1) + 2 hallandi hliðarvangar + 6 handriðspóstar
  assert.equal(r.vangar.length, 9);
  assert.ok(r.vangar.some((v) => (v.halli ?? 0) > 0.3), "hallandi burðarplata og vangar hafa hallahorn");

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

test("stigar3D: parar tvo samsíða stigabúta í tvöfaldan U-stiga (Type E) með stigapalli í hálfri hæð og efri komupalli", () => {
  const metri = 70;
  const veggH = 210;
  // Neðri leggur (vinstri -> hægri) og efri leggur (hægri -> vinstri) í sama stigahúsi
  const nedri = butur(0, 90, 210, 90, "stigi", 75);
  const efri = butur(210, 0, 0, 0, "stigi", 75);
  const endiVeggur = butur(280, -45, 280, 135, "veggur", 8);

  const r = stigar3D([nedri, efri], [nedri, efri, endiVeggur], veggH, metri);

  // Tveir leggir (12 þrep hvor) + 1 millipallur (stigapallur í 0.5 * veggH) + 1 efri komupallur (í 1.0 * veggH)
  assert.ok(r.threp.length >= 16, `þrep og pallar: ${r.threp.length}`);
  const millipallur = r.threp[r.threp.length - 2];
  const komupallur = r.threp[r.threp.length - 1];

  // Millipallurinn nær yfir breidd beggja leggja og er í hálfri vegghæð (opið rými undir)
  assert.ok(millipallur.breidd > metri * 1.8, `millipallur spennir báða leggi: ${millipallur.breidd}`);
  assert.ok(Math.abs(millipallur.y + millipallur.haed / 2 - veggH * 0.5) < 1, "millipallur í hálfri vegghæð");
  assert.ok(millipallur.x > 210, "millipallur liggur fyrir framan snúningsenda beggja leggja");

  // Efri komupallur er í fullri vegghæð við enda efri leggsins
  assert.ok(Math.abs(komupallur.y + komupallur.haed / 2 - veggH) < 1, "komupallur í fullri vegghæð");
  assert.ok(komupallur.x < 0, "komupallur við enda efri leggs");
});

test("stigaRummal: miðjar stakan stiga og fyllir breidd milli tveggja samsíða stigahúsveggja", () => {
  const metri = 50;
  // Stigahúsveggir í y = -35 og y = +45 (innri brúnir ~31 og ~41 -> heildarop ~72 dílar, miðja +5)
  const veggVinstri = butur(0, 45, 200, 45, "veggur", 8);
  const veggHaegri = butur(0, -35, 200, -35, "veggur", 8);
  const stigi = butur(10, 0, 190, 0, "stigi", 8);

  const rum = stigaRummal(stigi, [veggVinstri, veggHaegri, stigi], metri);
  assert.ok(rum.breidd > 65 && rum.breidd < 78, `breidd milli veggja: ${rum.breidd}`);
  assert.ok(rum.hlidrun > 3 && rum.hlidrun < 7, `hliðrun að miðju stigahúss: ${rum.hlidrun}`);
});
