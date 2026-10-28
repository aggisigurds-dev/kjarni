import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";

// Skýjahreyfimynd — mynd → myndband með Wan 2.2 i2v á Replicate.
// Þetta líkan er sagt „~30s per generation" á vefnum en með cold start getur
// það tekið 5+ mínútur — of lengi fyrir eitt sync Vercel-fall. Þess vegna
// notum við async-mynstrið (submit → prediction id → client pollar status):
//   POST /api/skyjahreyfimynd        → {predictionId} eða {videos: [...]}
//   GET  /api/skyjahreyfimynd/status?id=... → {status, videos?, error?}

export const maxDuration = 30; // Prefer: wait=5 + schema fetch; þarf ekki meira.

const RESOLUTIONS = ["480p", "720p"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

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
    numFrames?: number;
    framesPerSecond?: number;
    seed?: number;
    resolution?: string;
    aspectRatio?: string;
    disableSafetyChecker?: boolean;
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

  const input: Record<string, unknown> = {
    prompt,
    image: body.image,
    negative_prompt: body.negativePrompt || "",
    num_frames: clampNumber(body.numFrames, 81, 81, 129),
    frames_per_second: clampNumber(body.framesPerSecond, 16, 8, 30),
    resolution: RESOLUTIONS.includes(body.resolution || "") ? body.resolution : "480p",
    aspect_ratio: ASPECT_RATIOS.includes(body.aspectRatio || "") ? body.aspectRatio : "16:9",
    disable_safety_checker: body.disableSafetyChecker === true,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    const prediction = await submitReplicate({
      token,
      owner: "wan-video",
      name: "wan-2.2-i2v-fast",
      input,
    });
    // Ef warm model klárar innan Prefer: wait=5, erum við strax búin.
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({ videos: outputToUrls(prediction.output) });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return bad(502, prediction.error || "Wan 2.2 mistókst strax");
    }
    // Annars segjum við client-inu að pollea status route-ið.
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
