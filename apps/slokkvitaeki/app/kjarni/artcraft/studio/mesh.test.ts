import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMeshFile,
  MESH_EXPORT_ONLY,
  MESH_IMPORT,
  meshHint,
  shouldStampPhoto,
  spinYaws,
  yawGap,
} from "./mesh.ts";

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

test("meshHint mentions the built-in body and GLB pipelines", () => {
  assert.match(meshHint(false), /Innbyggður 3D-líkami/);
  assert.match(meshHint(false), /Sketchfab/);
  assert.match(meshHint(false), /Modly/);
  assert.match(meshHint(false), /IDOL/);
  assert.match(meshHint(true, "sara.glb"), /sara\.glb/);
  assert.ok(MESH_IMPORT.includes("Modly"));
  assert.ok(MESH_EXPORT_ONLY.includes("SMPL-X"));
});

test("nearby photos stamp onto the stand-in, far ones stay 3D", () => {
  assert.equal(yawGap(0, 350), 10);
  assert.equal(shouldStampPhoto(90, 45), true);
  assert.equal(shouldStampPhoto(180, 0), false);
});
