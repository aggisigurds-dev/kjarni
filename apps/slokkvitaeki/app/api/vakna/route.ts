import { NextRequest, NextResponse } from "next/server";
import { badRunpod, submitRunpod } from "@/app/api/_lib/runpod";

// Vakna — mynd + prompt → myndband með Wan 2.2 TI2V á OKKAR EIGIN RunPod
// Serverless endpoint (averystormknight-hue/Wan22-t2v-runpod v0.1.4).
// Sama async-mynstur og /api/skyjahreyfimynd: submit skilar jobId, client
// pollar /api/vakna/status?id=... á 5s fresti þangað til succeeded.

export const maxDuration = 30;

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
  const token = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_VAKNA_ENDPOINT;
  if (!token) return bad(500, "RUNPOD_API_KEY vantar í Vercel Settings → Environment Variables");
  if (!endpointId) return bad(500, "RUNPOD_VAKNA_ENDPOINT vantar í Vercel Settings → Environment Variables");

  let body: {
    prompt?: string;
    negativePrompt?: string;
    image?: string;
    width?: number;
    height?: number;
    length?: number;
    steps?: number;
    cfg?: number;
    seed?: number;
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
    negative_prompt: body.negativePrompt || "blurry, low quality, distorted, text overlay, watermark",
    image_base64: body.image,
    width: clampInt(body.width, 480, 256, 1280),
    height: clampInt(body.height, 832, 256, 1280),
    length: clampInt(body.length, 81, 25, 129),
    steps: clampInt(body.steps, 10, 4, 50),
    cfg: clampFloat(body.cfg, 2.0, 1, 10),
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    const job = await submitRunpod({ token, endpointId, input });
    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (err) {
    const r = badRunpod(err);
    return bad(r.status, r.error);
  }
}
