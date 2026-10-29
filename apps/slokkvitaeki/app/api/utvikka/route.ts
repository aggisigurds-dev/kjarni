import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Útvíkka — black-forest-labs/flux-fill-dev á Replicate
// (https://replicate.com/black-forest-labs/flux-fill-dev). Opin uppspretta
// outpaint/inpaint módel frá BFL, styður disable_safety_checker.
//
// Vafrinn útvíkkar canvasið sjálfur (viðbót vinstri/hægri/efst/neðst),
// býr til mask (svart = varðveita, hvítt = outpaint) og sendir hvoru
// tveggja hingað. Flux Fill fyllir svo nýju brúnirnar byggt á innihaldi
// myndarinnar + prompt.

export const maxDuration = 120;

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
    image?: string;
    mask?: string;
    prompt?: string;
    steps?: number;
    guidance?: number;
    numOutputs?: number;
    seed?: number;
    disableSafetyChecker?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }
  if (typeof body.mask !== "string" || !body.mask.startsWith("data:image/")) {
    return bad(400, "mask vantar (data:image/... URL)");
  }

  const input: Record<string, unknown> = {
    image: body.image,
    mask: body.mask,
    prompt: body.prompt?.trim() || "",
    steps: clampInt(body.steps, 30, 1, 50),
    guidance: clampFloat(body.guidance, 30, 1, 100),
    num_outputs: clampInt(body.numOutputs, 1, 1, 4),
    output_format: "webp",
    output_quality: 90,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);
  if (body.disableSafetyChecker === true) input.disable_safety_checker = true;

  try {
    const output = await runReplicate({
      token,
      owner: "black-forest-labs",
      name: "flux-fill-dev",
      input,
      functionStart,
      budgetMs: 110_000,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
