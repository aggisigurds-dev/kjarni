import assert from "node:assert/strict";
import { test } from "node:test";
import { isMeshFile, meshHint, spinYaws } from "./mesh.ts";

test("spinYaws walks a full circle", () => {
  const yaws = spinYaws(8);
  assert.equal(yaws.length, 8);
  assert.equal(yaws[0], 0);
  assert.equal(yaws[4], 180);
  assert.ok(yaws.every((d) => d >= 0 && d < 360));
});

test("isMeshFile accepts glb and gltf names", () => {
  assert.equal(isMeshFile(new File([], "body.glb")), true);
  assert.equal(isMeshFile(new File([], "body.gltf")), true);
  assert.equal(isMeshFile(new File([], "face.png")), false);
  assert.equal(isMeshFile(undefined), false);
});

test("meshHint is honest when empty", () => {
  assert.match(meshHint(false), /ekki til photoreal 3D/);
  assert.match(meshHint(true, "sara.glb"), /sara\.glb/);
});
