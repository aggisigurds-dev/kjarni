/** Vafra-hluti Líkamsmótunar: finnur líkamann með MediaPipe Pose Landmarker
 * og vistar niðurstöðuna í fullri upplausn. Greiningin keyrir alfarið í
 * vafranum (WASM + líkan sótt af CDN einu sinni, síðan úr skyndiminni) —
 * engin mynd er send neitt og engin Replicate-tenging þarf. Stærðfræðin
 * sjálf er í bodyWarp.ts. */

import { deriveBodyFrame, warpBody, type BodyFrame, type BodyTune, type Pixels } from "./bodyWarp";

// Föst útgáfa, a.m.k. 3 daga gömul þegar hún var valin (sama regla og
// minimumReleaseAge í pnpm-workspace.yaml). Sótt af CDN eins og three.js í
// studio/meshView.ts, svo enginn lockfile breytist.
const MEDIAPIPE_VERSION = "1.2.0";
const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

/** Hlutmengi af @mediapipe/tasks-vision API-inu sem notað er hér (staðfest
 *  gegn vision.d.ts í 1.2.0). */
type MpLandmark = { x: number; y: number; z: number; visibility: number };
type MpMask = { width: number; height: number; getAsFloat32Array(): Float32Array };
type MpResult = { landmarks: MpLandmark[][]; segmentationMasks?: MpMask[]; close(): void };
type MpPose = { detect(image: HTMLCanvasElement): MpResult };
type MpVision = {
  FilesetResolver: { forVisionTasks(basePath: string): Promise<unknown> };
  PoseLandmarker: { createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<MpPose> };
};

let posePromise: Promise<MpPose> | null = null;

function loadPose(): Promise<MpPose> {
  if (!posePromise) {
    posePromise = (async () => {
      const vision = (await import(/* webpackIgnore: true */ `${MEDIAPIPE_BASE}/vision_bundle.mjs`)) as MpVision;
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`);
      const create = (delegate: "GPU" | "CPU") =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
          runningMode: "IMAGE",
          numPoses: 1,
          outputSegmentationMasks: true,
        });
      try {
        return await create("GPU");
      } catch {
        // Sumir vafrar/tæki hafa ekki WebGL2 — CPU er hægara en virkar alls staðar.
        return await create("CPU");
      }
    })();
    posePromise.catch(() => {
      posePromise = null;
    });
  }
  return posePromise;
}

/** Finnur líkamann á myndinni í `canvas`. null = enginn heill búkur fannst. */
export async function detectBody(canvas: HTMLCanvasElement): Promise<BodyFrame | null> {
  const pose = await loadPose();
  const result = pose.detect(canvas);
  try {
    const landmarks = result.landmarks[0];
    if (!landmarks) return null;
    const mpMask = result.segmentationMasks?.[0];
    // Afrit — gríman tilheyrir MediaPipe og losnar við result.close().
    const mask = mpMask
      ? { data: new Float32Array(mpMask.getAsFloat32Array()), width: mpMask.width, height: mpMask.height }
      : null;
    return deriveBodyFrame(landmarks, mask);
  } finally {
    result.close();
  }
}

/** Les mynd í pixla, minnkaða svo lengri hliðin sé í mesta lagi `maxDim`
 *  (0 = upprunaleg stærð). createImageBitmap virðir EXIF-snúning, svo forsýn
 *  og full upplausn snúa eins. */
export async function readPixels(file: Blob, maxDim = 0): Promise<Pixels> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = maxDim > 0 ? Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height)) : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað á striga");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height);
    return { data: data.data, width, height };
  } finally {
    bitmap.close();
  }
}

/** Keyrir sömu líkamsmótun og forsýnin sýnir, á upprunalegu skránni í fullri
 *  upplausn (ekkert niðurskölunarþak). */
export async function renderFullResolution(
  file: Blob,
  frame: BodyFrame,
  tune: BodyTune,
): Promise<{ blob: Blob; width: number; height: number }> {
  const src = await readPixels(file);
  const out = warpBody(src, frame, tune);
  const canvas = new OffscreenCanvas(out.width, out.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað útkomu á striga");
  const image = ctx.createImageData(out.width, out.height);
  image.data.set(out.data);
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  return { blob, width: out.width, height: out.height };
}
