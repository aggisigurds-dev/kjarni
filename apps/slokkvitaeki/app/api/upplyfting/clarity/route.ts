import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";

// Upplyfting → Clarity — philz1337x/clarity-pro-upscaler á Replicate.
// Diffusion-based upscaler getur tekið 1–3 mínútur, sérstaklega á cold
// start, svo við notum async-mynstur eins og Wan 2.2:
//   POST /api/upplyfting/clarity         → {predictionId} eða {images: [...]}
//   GET  /api/upplyfting/clarity/status  → {status, images?, error?}

export const maxDuration = 30;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampNumber(n: unknown, fallback: number, min: number, max: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    image?: string;
    prompt?: string;
    negativePrompt?: string;
    creativity?: number;
    resemblance?: number;
    steps?: number;
    scaleFactor?: number;
    seed?: number;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }

  const input: Record<string, unknown> = {
    image: body.image,
    prompt: body.prompt || "masterpiece, best quality, highres, detailed",
    negative_prompt: body.negativePrompt || "(worst quality, low quality, normal quality:2)",
    creativity: clampNumber(body.creativity, 0.3, 0, 1),
    resemblance: clampNumber(body.resemblance, 0.6, 0, 3),
    num_inference_steps: clampNumber(body.steps, 18, 1, 50),
    scale_factor: clampNumber(body.scaleFactor, 2, 1, 4),
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    const prediction = await submitReplicate({
      token,
      owner: "philz1337x",
      name: "clarity-pro-upscaler",
      input,
    });
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({ images: outputToUrls(prediction.output) });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return bad(502, prediction.error || "Clarity mistókst strax");
    }
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
