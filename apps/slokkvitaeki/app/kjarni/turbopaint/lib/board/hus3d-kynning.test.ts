import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GERD_HEITI,
  kynningarDags,
  kynningarLykill,
  kynningarSkrarnafn,
  kynningarTitill,
} from "./hus3d-kynning.ts";

test("kynning title prefers address then floor, without repeating", () => {
  assert.equal(kynningarTitill("Dalshraun 10", "2. hæð"), "Dalshraun 10 · 2. hæð");
  assert.equal(kynningarTitill("Dalshraun 10 · 2. hæð", "2. hæð"), "Dalshraun 10 · 2. hæð");
  assert.equal(kynningarTitill("", "1. hæð"), "1. hæð");
  assert.equal(kynningarTitill(null, null), "Brunavarnir");
});

test("legend groups equipment in fire-safety order", () => {
  const lykill = kynningarLykill([
    { gerd: "reykskynjari", nafn: "Reyk", texti: "Reyk" },
    { gerd: "slokkvitaeki", nafn: "Duft", texti: "ABC Duft" },
    { gerd: "slokkvitaeki", nafn: "Duft", texti: "ABC Duft" },
    { gerd: "slanga", nafn: "Slanga", texti: "Brunaslanga" },
    { gerd: null, nafn: "Óþekkt", texti: "" },
  ]);
  assert.deepEqual(
    lykill.map((l) => [l.heiti, l.fjoldi]),
    [
      [GERD_HEITI.slokkvitaeki, 2],
      [GERD_HEITI.slanga, 1],
      [GERD_HEITI.reykskynjari, 1],
      ["Óþekkt", 1],
    ],
  );
});

test("export filename keeps the place name and a date", () => {
  assert.equal(
    kynningarSkrarnafn("Dalshraun 10 · 2. hæð", new Date("2026-10-09T12:00:00Z")),
    "Dalshraun 10 · 2. hæð — 3D — 2026-10-09.png",
  );
  assert.equal(kynningarDags(new Date("2026-10-09T12:00:00Z")).includes("2026"), true);
});
