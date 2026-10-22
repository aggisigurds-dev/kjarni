import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dropVersion,
  mergeVersion,
  parseVersions,
  upsertVersion,
  VERSION_PRESETS,
  versionPreset,
  versionPrompt,
} from "./versions.ts";

test("four outfit presets cover summer elegant christmas disco", () => {
  assert.deepEqual(
    VERSION_PRESETS.map((p) => p.id),
    ["summer", "elegant", "christmas", "disco"],
  );
  assert.match(versionPreset("elegant")?.prompt || "", /jewelry/);
  assert.match(versionPrompt("Jólafatnaður"), /Jólafatnaður/);
});

test("mergeVersion stacks once", () => {
  const once = mergeVersion("studio", "summer outfit");
  assert.match(once, /studio/);
  assert.equal(mergeVersion(once, "summer outfit"), once);
});

test("upsertVersion replaces the same label and caps the list", () => {
  const first = { id: "a", label: "Sumarútgáfa", image: "1", prompt: "p", updatedAt: 1 };
  const second = { id: "b", label: "sumarútgáfa", image: "2", prompt: "q", updatedAt: 2 };
  const next = upsertVersion([first], second);
  assert.equal(next.length, 1);
  assert.equal(next[0].image, "2");
  const many = Array.from({ length: 14 }, (_, i) => ({
    id: `v${i}`,
    label: `L${i}`,
    image: `${i}`,
    prompt: "",
    updatedAt: i,
  }));
  assert.equal(upsertVersion(many.slice(1), many[0]).length, 12);
  assert.deepEqual(dropVersion(next, "b"), []);
});

test("parseVersions drops empty images", () => {
  assert.equal(parseVersions([{ id: "x", image: "" }]).length, 0);
  assert.equal(parseVersions([{ id: "x", image: "data:image/png;base64,AA", label: "Elegant" }])[0].label, "Elegant");
});
