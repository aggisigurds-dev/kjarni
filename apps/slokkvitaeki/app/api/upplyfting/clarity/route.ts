import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";

// Upplyfting -> Clarity -- philz1337x/clarity-pro-upscaler a Replicate.
//
// UPPFAERT 2026-10-29: schemad styttist i fjora inputa:
//   image, creativity (-10..10), scale_factor (2|4|8|16), output_format (png|jpg).
// Gomul UI sendi prompt, negative_prompt, resemblance og num_inference_steps
// sem Replicate hunsadi hljodlega og creativity 0.3 var naestum nulit -> notandi
// sa engar breytingar. Nu sendum vid einungis skraleg field.

export const maxDuration = 30;

const SCALES = [2, 4, 8, 16];
const OUTPUT_FORMATS = ["png", "jpg"];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampFloat(n: unknown, fallback: number, min: number, max: number): number {
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
    creativity?: number;
    scaleFactor?: number;
    outputFormat?: string;
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

  const scale = SCALES.includes(Math.round(body.scaleFactor as number))
    ? Math.round(body.scaleFactor as number)
    : 2;
  const outputFormat = OUTPUT_FORMATS.includes(body.outputFormat || "")
    ? (body.outputFormat as string)
    : "png";

  const input: Record<string, unknown> = {
    image: body.image,
    creativity: clampFloat(body.creativity, 3, -10, 10),
    scale_factor: scale,
    output_format: outputFormat,
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
