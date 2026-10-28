import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";

// Skýjahreyfimynd → Kling 2.1 — kwaivgi/kling-v2.1 á Replicate.
// Premium i2v fyrir cinematic gæði. Kostar ~$0.28/myndband, tekur 1–3 mín.
// Async-mynstur eins og Wan: submit → predictionId → client pollar.
//
// ATH: Kling exposar EKKI disable_safety_checker í schema — Kuaishou-filter
// keyrir server-side og er ekki slökkvanlegur frá okkar hlið.

export const maxDuration = 30;

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
const DURATIONS = [5, 10];

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
    prompt?: string;
    negativePrompt?: string;
    duration?: number;
    aspectRatio?: string;
    cfgScale?: number;
    image?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");
  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }

  const duration = DURATIONS.includes(body.duration ?? 5) ? body.duration : 5;
  const input: Record<string, unknown> = {
    prompt,
    start_image: body.image,
    negative_prompt: body.negativePrompt || "",
    duration,
    aspect_ratio: ASPECT_RATIOS.includes(body.aspectRatio || "") ? body.aspectRatio : "16:9",
    cfg_scale: clampNumber(body.cfgScale, 0.5, 0, 1),
  };

  try {
    const prediction = await submitReplicate({
      token,
      owner: "kwaivgi",
      name: "kling-v2.1",
      input,
    });
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({ videos: outputToUrls(prediction.output) });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return bad(502, prediction.error || "Kling mistókst strax");
    }
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
