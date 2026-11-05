import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RAUN_MYND, RAUN_SLOD, STIMPIL_LYKILL, LITIR } from "./merkjasafn";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../../../../../public");

test("raunsæ tákn: hver mynd sem kortið vísar á er til í public/turbopaint/taeki", () => {
  for (const [lykill, n] of Object.entries(RAUN_MYND)) {
    assert.ok(existsSync(join(PUBLIC, RAUN_SLOD, n + ".png")), `${lykill} → ${n}.png vantar`);
  }
});

test("raunsæ tákn: slökkvitæki, slöngur, skynjarar og skilti (ÚT, handboði, rafmagn) hafa mynd; SLT/BRSL-skilti halda plötunni", () => {
  for (const l of ["lettvatn", "duft", "co2", "slanga", "hose", "reykskynjari", "hitaskynjari", "bjalla", "segull", "ut", "neydarutgangur", "rafmagn", "handbodi"]) {
    assert.ok(RAUN_MYND[l], l);
  }
  assert.equal(RAUN_MYND.skilti_slt, undefined);
  assert.equal(RAUN_MYND.skilti_slanga, undefined);
  assert.equal(RAUN_MYND.annad, undefined);
});

test("raunsæ tákn: hver lykill sem merki vistast með (STIMPIL_LYKILL) er til sem litur, handboði líka", () => {
  for (const l of Object.values(STIMPIL_LYKILL)) assert.ok(LITIR[l], l);
  assert.equal(LITIR.handbodi.bg, "#f57c00");
});
