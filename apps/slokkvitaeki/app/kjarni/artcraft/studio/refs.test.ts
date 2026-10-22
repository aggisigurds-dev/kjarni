import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampMotionFrames,
  fixPrompt,
  mergePose,
  mergeStyle,
  motionFrameCount,
  motionRecreatePrompt,
  nearestOrbitView,
  pickPoseModel,
  pickPoseModule,
  pickStyleModel,
  pickStyleModule,
  poseDenoising,
  posePrompt,
  POSE_DENOISING,
  POSE_DENOISING_PROMPT,
  studioScripts,
  studioStill,
  yawToSlot,
} from "./refs.ts";

test("pose prompt names the person and mergePose stacks once", () => {
  assert.match(posePrompt("Sara"), /Sara/);
  const once = mergePose("studio still", "Sara");
  assert.match(once, /studio still/);
  assert.match(once, /same pose as the reference/);
  assert.equal(mergePose(once, "Sara"), once);
});

test("style chips keep identity and stack once", () => {
  const clothes = mergeStyle("", "clothes");
  assert.match(clothes, /same clothes/);
  assert.match(mergeStyle("keep face", "jewelry"), /jewelry/);
  const twice = mergeStyle(mergeStyle("x", "prop"), "prop");
  assert.equal(twice, mergeStyle("x", "prop"));
});

test("fixPrompt asks only for the painted region", () => {
  assert.match(fixPrompt(""), /painted region/);
  assert.match(fixPrompt("smooth the sleeve"), /smooth the sleeve/);
  assert.equal(fixPrompt(fixPrompt("smooth")), fixPrompt("smooth"));
});

test("motion recreate names the person", () => {
  assert.match(motionRecreatePrompt("Agnar"), /Agnar/);
  assert.match(motionRecreatePrompt(), /same adult person/);
});

test("pickers prefer OpenPose and non-face IP-Adapter", () => {
  assert.match(
    pickPoseModel(["ip-adapter-plus-face_sd15", "control_v11p_sd15_openpose", "ip-adapter_sd15"]) || "",
    /openpose/,
  );
  assert.equal(pickPoseModel(["ip-adapter_sd15"]), null);
  assert.equal(pickPoseModule(["canny", "dw_openpose", "openpose"]), "dw_openpose");
  assert.equal(
    pickStyleModel(["ip-adapter-plus-face_sd15", "ip-adapter_sd15 [abc]"]),
    "ip-adapter_sd15 [abc]",
  );
  assert.equal(pickStyleModel(["ip-adapter-plus-face_sd15"]), null);
  assert.equal(pickStyleModule(["canny", "ip-adapter-auto"]), "ip-adapter-auto");
});

test("studioScripts puts pose and style first and caps at four units", () => {
  const extra = studioScripts({
    faceRefs: ["data:image/png;base64,F1", "data:image/png;base64,F2", "data:image/png;base64,F3"],
    faceAdapter: { model: "ip-adapter-plus-face_sd15", module: "ip-adapter-auto" },
    poseRef: "data:image/png;base64,POSE",
    poseAdapter: { model: "control_v11p_sd15_openpose", module: "openpose" },
    styleRef: "data:image/png;base64,STYLE",
    styleAdapter: { model: "ip-adapter_sd15", module: "ip-adapter" },
    restoreFaces: true,
    toApi: (s) => s.slice(s.indexOf(",") + 1),
  });
  const args = (extra.alwayson_scripts as { controlnet: { args: Array<{ image: string; model: string }> } })
    .controlnet.args;
  assert.equal(args.length, 4);
  assert.equal(args[0].image, "POSE");
  assert.equal(args[0].model, "control_v11p_sd15_openpose");
  assert.equal(args[1].image, "STYLE");
  assert.equal(args[2].image, "F1");
  assert.equal(args[3].image, "F2");
  assert.equal(extra.restore_faces, true);
});

test("studioScripts stays empty without refs or restore", () => {
  const extra = studioScripts({ toApi: (s) => s });
  assert.equal(extra.restore_faces, undefined);
  assert.equal(extra.alwayson_scripts, undefined);
});

test("yaw maps to the nearest orbit slot and filled neighbour", () => {
  assert.equal(yawToSlot(10), "front");
  assert.equal(yawToSlot(50), "frontRight");
  assert.equal(yawToSlot(350), "front");
  const profile = {
    id: "p",
    name: "Sara",
    faces: [],
    orbit: { right: "R", back: "B" },
    updatedAt: 1,
  };
  const view = nearestOrbitView(profile, 80);
  assert.equal(view?.id, "right");
  assert.equal(view?.src, "R");
  assert.equal(nearestOrbitView({ ...profile, orbit: {} }, 0), null);
});

test("studioStill prefers the avatar result over the original upload", () => {
  assert.equal(studioStill("work", ["avatar"], "upload"), "work");
  assert.equal(studioStill("", ["avatar"], "upload"), "avatar");
  assert.equal(studioStill("", [], "upload"), "upload");
  assert.equal(studioStill("", [], ""), "");
  assert.equal(poseDenoising(true), POSE_DENOISING);
  assert.equal(poseDenoising(false), POSE_DENOISING_PROMPT);
});

test("motion frame count stays between 4 and 8", () => {
  assert.equal(motionFrameCount(1), 4);
  assert.equal(motionFrameCount(3), 6);
  assert.equal(motionFrameCount(12), 8);
  assert.equal(clampMotionFrames(99), 8);
  assert.equal(clampMotionFrames(1), 4);
});
