import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avatarPrompt,
  canBuildAvatar,
  controlNetFaceArgs,
  hasIdentity,
  identityPrompt,
  identityRefs,
  identityScripts,
  mergeIdentity,
  missingOrbitSlots,
  canGuessOrbit,
  orbitCount,
  pickFaceModel,
  pickFaceModule,
  sheetLayout,
} from "./profile.ts";

test("identity prompt names the person and asks for a sharp face", () => {
  assert.match(identityPrompt("Agnar"), /Agnar/);
  assert.match(identityPrompt("Agnar"), /sharp in-focus face/);
});

test("mergeIdentity appends once when the profile is on", () => {
  const once = mergeIdentity("red dress", "Sara", true);
  assert.match(once, /red dress/);
  assert.match(once, /Sara/);
  assert.equal(mergeIdentity(once, "Sara", true), once);
  assert.equal(mergeIdentity("red dress", "Sara", false), "red dress");
});

test("identityRefs puts the sheet first and caps at four units", () => {
  const refs = identityRefs(["a", "b", "c", "d", "e"], "sheet");
  assert.deepEqual(refs, ["sheet", "a", "b", "c"]);
  assert.deepEqual(identityRefs(["a"], null), ["a"]);
  assert.deepEqual(identityRefs(["a", "b"], "faces", "orbit"), ["faces", "orbit", "a", "b"]);
});

test("orbit + faces unlock a realistic avatar", () => {
  const empty = { id: "p", name: "Sara", faces: [], orbit: {}, updatedAt: 1 };
  assert.equal(hasIdentity(empty), false);
  assert.equal(canBuildAvatar(empty), false);
  const half = {
    ...empty,
    faces: ["f1", "f2"],
    orbit: { front: "o1", right: "o2", back: "o3" },
  };
  assert.equal(orbitCount(half), 3);
  assert.equal(hasIdentity(half), true);
  assert.equal(canBuildAvatar(half), true);
  assert.match(avatarPrompt("Sara"), /Sara/);
  assert.match(avatarPrompt("Sara"), /turnaround/);
  assert.match(avatarPrompt("Sara"), /every angle/);
  assert.equal(canGuessOrbit(empty), true);
  assert.equal(canGuessOrbit(half), true);
  assert.deepEqual(
    missingOrbitSlots(half.orbit).map((s) => s.id),
    ["frontRight", "backRight", "backLeft", "left", "frontLeft"],
  );
  assert.equal(canGuessOrbit({ ...empty, orbit: { front: "o1", frontRight: "o2", right: "o3", backRight: "o4", back: "o5", backLeft: "o6", left: "o7", frontLeft: "o8" } }), false);
});

test("sheetLayout fits ten faces", () => {
  assert.deepEqual(sheetLayout(1), { cols: 1, rows: 1 });
  assert.deepEqual(sheetLayout(10), { cols: 5, rows: 2 });
  assert.deepEqual(sheetLayout(6), { cols: 3, rows: 2 });
});

test("pickFaceModel prefers plus-face over generic ip-adapter", () => {
  assert.equal(
    pickFaceModel(["control_v11p_sd15_openpose", "ip-adapter-plus-face_sd15 [abc]", "ip-adapter_sd15"]),
    "ip-adapter-plus-face_sd15 [abc]",
  );
  assert.equal(pickFaceModel(["openpose"]), null);
  assert.equal(pickFaceModule(["canny", "ip-adapter-auto"]), "ip-adapter-auto");
});

test("identityScripts always restore faces and attach ControlNet when a model exists", () => {
  const bare = identityScripts(["data:image/png;base64,AAA"], (s) => s.slice(s.indexOf(",") + 1), null);
  assert.equal(bare.restore_faces, true);
  assert.equal(bare.alwayson_scripts, undefined);

  const withCn = identityScripts(
    ["data:image/png;base64,AAA", "data:image/png;base64,BBB"],
    (s) => s.slice(s.indexOf(",") + 1),
    { model: "ip-adapter-plus-face_sd15", module: "ip-adapter-auto" },
  );
  const args = (withCn.alwayson_scripts as { controlnet: { args: Array<{ image: string; model: string }> } })
    .controlnet.args;
  assert.equal(args.length, 2);
  assert.equal(args[0].image, "AAA");
  assert.equal(args[0].model, "ip-adapter-plus-face_sd15");
  assert.equal(controlNetFaceArgs([], (s) => s, "m", "mod").length, 0);
});
