import assert from "node:assert/strict";
import { test } from "node:test";
import { ADGERDIR, HVAD_HREF, THRIR } from "./hvad-data.ts";

test("Hvað-síðan hefur fasta slóð", () => {
  assert.equal(HVAD_HREF, "/kjarni/hvad");
});

test("þrjú dót: vefur, spjall, kóði", () => {
  assert.deepEqual(
    THRIR.map((t) => t.id),
    ["vefur", "spjall", "kodi"],
  );
});

test("aðgerðir eru smellanlegar slóðir, engin tóm", () => {
  assert.ok(ADGERDIR.length >= 6);
  for (const a of ADGERDIR) {
    assert.ok(a.nafn.trim());
    assert.ok(a.lysing.trim());
    assert.ok(a.href.startsWith("/") || a.href.startsWith("https://"));
  }
});

test("ytri slóðir og Marks/3dwork opna í nýjum glugga", () => {
  const ytri = ADGERDIR.filter((a) => a.uti);
  assert.ok(ytri.length >= 2);
  assert.ok(ytri.every((a) => a.href.startsWith("/") || a.href.startsWith("https://")));
  assert.ok(ADGERDIR.filter((a) => a.href.startsWith("https://")).every((a) => a.uti));
});

test("gólfplön opna TurboPaint á þessum vef", () => {
  const teikn = ADGERDIR.find((a) => a.nafn === "Teikna gólfplön");
  assert.equal(teikn?.href, "/kjarni/turbopaint");
});
