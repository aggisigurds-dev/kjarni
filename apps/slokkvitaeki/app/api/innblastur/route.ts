import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Innblástur — black-forest-labs/flux-redux-dev á Replicate
// (https://replicate.com/black-forest-labs/flux-redux-dev). Innblástursmynd →
// 1–4 nýjar afbrigði sem bera svipaðan stíl / lit / samsetningu án þess að
// afrita þig. Opin uppspretta (Flux Dev + Redux adapter), styður
// disable_safety_checker.

export const maxDuration = 60;

const ASPECT_RATIOS = [
  "match_input_image",
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "9:21",
] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

const MEGAPIXELS = ["0.25", "1"] as const;
type Megapixels = (typeof MEGAPIXELS)[number];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampNumber(n: unknown, fallback: number, min: number, max: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    reduxImage?: string;
    aspectRatio?: string;
    numOutputs?: number;
    numInferenceSteps?: number;
    seed?: number;
    megapixels?: string;
    goFast?: boolean;
    outputFormat?: string;
    outputQuality?: number;
    disableSafetyChecker?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  if (typeof body.reduxImage !== "string" || !body.reduxImage.startsWith("data:image/")) {
    return bad(400, "innblástursmynd vantar (data:image/... URL)");
  }

  const aspectRatio: AspectRatio = ASPECT_RATIOS.includes(body.aspectRatio as AspectRatio)
    ? (body.aspectRatio as AspectRatio)
    : "match_input_image";
  const megapixels: Megapixels = MEGAPIXELS.includes(body.megapixels as Megapixels)
    ? (body.megapixels as Megapixels)
    : "1";
  const outputFormat = body.outputFormat === "png" || body.outputFormat === "jpg" ? body.outputFormat : "webp";

  const input: Record<string, unknown> = {
    redux_image: body.reduxImage,
    aspect_ratio: aspectRatio,
    num_outputs: clampNumber(body.numOutputs, 1, 1, 4),
    num_inference_steps: clampNumber(body.numInferenceSteps, 28, 1, 50),
    megapixels,
    go_fast: body.goFast === true,
    output_format: outputFormat,
    output_quality: clampNumber(body.outputQuality, 80, 0, 100),
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);
  if (body.disableSafetyChecker === true) input.disable_safety_checker = true;

  try {
    const output = await runReplicate({
      token,
      owner: "black-forest-labs",
      name: "flux-redux-dev",
      input,
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
