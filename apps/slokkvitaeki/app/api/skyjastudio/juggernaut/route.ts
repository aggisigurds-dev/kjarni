import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Skýjastúdíó — þriðja líkanið við hliðina á stability-ai/sdxl og
// black-forest-labs/flux-fill-dev: asiryan/juggernaut-xl-v7
// (https://replicate.com/asiryan/juggernaut-xl-v7). Fín-tjúnuð SDXL
// afbrigði frá RunDiffusion, þekkt fyrir portrett og raunsæislega áferð —
// gott val þegar SDXL skilar of „plastic"-líti á fólki.
//
// Styður sömu þrjár aðferðir og Stability SDXL (txt2img, img2img, inpaint)
// gegnum sama líkans-endapunkt — image/mask eru valfrjáls.

export const maxDuration = 60;

const SCHEDULERS = ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampSize(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1536, Math.max(512, Math.round(num / 8) * 8));
}

function clampSteps(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(1, Math.round(num)));
}

function clampGuidance(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(50, Math.max(1, num));
}

function clampNumOutputs(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(4, Math.max(1, Math.round(num)));
}

function clampStrength(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    prompt?: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    guidanceScale?: number;
    scheduler?: string;
    numOutputs?: number;
    seed?: number;
    strength?: number;
    useKarrasSigmas?: boolean;
    disableSafetyChecker?: boolean;
    image?: string;
    mask?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");

  const hasImage = typeof body.image === "string" && body.image.startsWith("data:image/");
  const hasMask = typeof body.mask === "string" && body.mask.startsWith("data:image/");
  if (hasMask && !hasImage) return bad(400, "mask krefst image (inpaint þarf bæði)");

  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: body.negativePrompt || "",
    width: clampSize(body.width, 1024),
    height: clampSize(body.height, 1024),
    num_inference_steps: clampSteps(body.steps, 40),
    guidance_scale: clampGuidance(body.guidanceScale, 7.5),
    scheduler: SCHEDULERS.includes(body.scheduler || "") ? body.scheduler : "K_EULER",
    num_outputs: clampNumOutputs(body.numOutputs, 1),
    use_karras_sigmas: body.useKarrasSigmas === true,
    disable_safety_checker: body.disableSafetyChecker === true,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);
  if (hasImage) {
    input.image = body.image;
    input.strength = clampStrength(body.strength, 0.5);
  }
  if (hasMask) input.mask = body.mask;

  try {
    const output = await runReplicate({
      token,
      owner: "asiryan",
      name: "juggernaut-xl-v7",
      input,
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
