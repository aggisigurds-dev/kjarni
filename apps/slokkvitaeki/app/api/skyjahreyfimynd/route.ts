import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Skýjahreyfimynd — mynd → myndband með Wan 2.2 i2v á Replicate (skýja-
// mótvægi við Hreyfimynd-tólið sem keyrir Wan 2.1 á þínu eigin ComfyUI).
//
// Replicate's „Open source video is back"-collection (júlí 2025) vísar á
// wan-video/wan-2.2 fjölskylduna; wan-video/wan-2.2-i2v-fast er sú
// ódýrasta sem passar við notkunarsviðið okkar (~$0.05 per myndband).

export const maxDuration = 300; // Vercel Pro leyfir upp í 300s; Hobby fær þakið lækkað.

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
  const functionStart = Date.now();
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
    num_frames: clampNumber(body.numFrames, 81, 17, 129),
    frames_per_second: clampNumber(body.framesPerSecond, 16, 8, 30),
    resolution: RESOLUTIONS.includes(body.resolution || "") ? body.resolution : "480p",
    aspect_ratio: ASPECT_RATIOS.includes(body.aspectRatio || "") ? body.aspectRatio : "16:9",
    disable_safety_checker: body.disableSafetyChecker === true,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    const output = await runReplicate({
      token,
      owner: "wan-video",
      name: "wan-2.2-i2v-fast",
      input,
      functionStart,
      budgetMs: 280_000,
    });
    return NextResponse.json({ videos: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
