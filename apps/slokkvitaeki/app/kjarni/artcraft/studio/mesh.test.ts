import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMeshFile,
  MESH_EXPORT_ONLY,
  MESH_GUIDES,
  MESH_IMPORT,
  meshGuides,
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

test("meshHint says 3D is pose-only and photos fill the ring", () => {
  assert.match(meshHint(false), /ljósmynd/);
  assert.match(meshHint(false), /dúkkan fer ekki inn/);
  assert.match(meshHint(true, "sara.glb"), /sara\.glb/);
  assert.match(meshHint(true, "sara.glb"), /ekki af dúkku/);
  assert.ok(MESH_IMPORT.includes("Modly"));
  assert.ok(MESH_EXPORT_ONLY.includes("SMPL-X"));
});

test("mesh guides start in the studio and then link to web tools", () => {
  assert.equal(MESH_GUIDES[0].id, "studio");
  assert.equal(MESH_GUIDES[0].href, "");
  const meshy = meshGuides("web").find((g) => g.id === "meshy");
  assert.ok(meshy?.href.startsWith("https://www.meshy.ai"));
  assert.ok(meshy?.steps.some((s) => /GLB/.test(s)));
  const tripo = meshGuides("web").find((g) => g.id === "tripo");
  assert.ok(tripo?.href.startsWith("https://www.tripo3d.ai"));
  const sketchfab = meshGuides("download").find((g) => g.id === "sketchfab");
  assert.ok(sketchfab?.href.startsWith("https://sketchfab.com"));
  assert.ok(meshGuides("desktop").some((g) => g.id === "modly" && g.href.startsWith("https://modly3d.app")));
  assert.ok(MESH_GUIDES.filter((g) => g.href).every((g) => g.href.startsWith("https://")));
});

test("nearby photos stamp onto the stand-in, far ones stay 3D", () => {
  assert.equal(yawGap(0, 350), 10);
  assert.equal(shouldStampPhoto(90, 45), true);
  assert.equal(shouldStampPhoto(180, 0), false);
});
