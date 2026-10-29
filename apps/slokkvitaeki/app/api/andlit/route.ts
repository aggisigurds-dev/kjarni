import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Andlit — zsxkib/instant-id á Replicate
// (https://replicate.com/zsxkib/instant-id). Learn-free face identity:
// gefið eina andlitsmynd + lýsingu og módelið býr til nýjar myndir þar sem
// SAMA ANDLITIÐ birtist í nýju umhverfi, stellingu, föt, stíl. Byggt á SDXL
// + ControlNet með InsightFace embedding, svo auðkennið helst mjög vel.
//
// Nákvæmlega svarið við „extra facial pic as accuracy strengthener" — það
// sem video-módelin leyfa okkur ekki (hard filters) getum við gert á myndir.

export const maxDuration = 90;

const SDXL_WEIGHTS = [
  "stable-diffusion-xl-base-1.0",
  "juggernaut-xl-v8",
  "realvis-xl-v3-love",
  "protovision-xl-high-fidel",
  "dreamshaper-xl",
  "afrodite-xl-v2",
  "albedobase-xl-v13",
] as const;
type SdxlWeights = (typeof SDXL_WEIGHTS)[number];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function clampFloat(n: unknown, fallback: number, min: number, max: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    faceImage?: string;
    poseImage?: string;
    prompt?: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    numOutputs?: number;
    numInferenceSteps?: number;
    guidanceScale?: number;
    ipAdapterScale?: number;
    controlnetConditioningScale?: number;
    sdxlWeights?: string;
    seed?: number;
    disableSafetyChecker?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");
  if (typeof body.faceImage !== "string" || !body.faceImage.startsWith("data:image/")) {
    return bad(400, "faceImage vantar (data:image/... URL)");
  }

  const sdxlWeights: SdxlWeights = SDXL_WEIGHTS.includes(body.sdxlWeights as SdxlWeights)
    ? (body.sdxlWeights as SdxlWeights)
    : "stable-diffusion-xl-base-1.0";

  const input: Record<string, unknown> = {
    image: body.faceImage,
    prompt,
    negative_prompt:
      body.negativePrompt?.trim() ||
      "lowres, bad anatomy, bad hands, cropped, worst quality, blurry, deformed face",
    width: clampInt(body.width, 1024, 512, 1536),
    height: clampInt(body.height, 1024, 512, 1536),
    num_outputs: clampInt(body.numOutputs, 1, 1, 4),
    num_inference_steps: clampInt(body.numInferenceSteps, 30, 10, 60),
    guidance_scale: clampFloat(body.guidanceScale, 5, 1, 15),
    ip_adapter_scale: clampFloat(body.ipAdapterScale, 0.8, 0, 1.5),
    controlnet_conditioning_scale: clampFloat(body.controlnetConditioningScale, 0.8, 0, 1.5),
    enable_pose_controlnet: true,
    enable_canny_controlnet: false,
    enable_depth_controlnet: false,
    sdxl_weights: sdxlWeights,
    output_format: "webp",
    output_quality: 90,
  };
  if (typeof body.poseImage === "string" && body.poseImage.startsWith("data:image/")) {
    input.pose_image = body.poseImage;
  }
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);
  if (body.disableSafetyChecker === true) input.disable_safety_checker = true;

  try {
    const output = await runReplicate({
      token,
      owner: "zsxkib",
      name: "instant-id",
      input,
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
