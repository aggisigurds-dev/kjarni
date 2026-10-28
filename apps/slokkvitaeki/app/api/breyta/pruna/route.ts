import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Breyta → Hraðbreyta — prunaai/p-image-edit á Replicate
// (https://replicate.com/prunaai/p-image-edit). Multi-image edit undir
// sekúndu, 45M+ keyrslur, $0.01 per mynd — passar vel í ítrun og tilraunir.

export const maxDuration = 60;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    image?: string;
    prompt?: string;
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
  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }

  // prunaai/p-image-edit tekur `images` (array af uri) ekki `image`
  // (staðfest 2026-10-28: 422 „input: images is required"). Við sendum enn
  // eina mynd frá client-inu og vefjum í array hér.
  const input: Record<string, unknown> = {
    images: [body.image],
    prompt,
    disable_safety_checker: body.disableSafetyChecker === true,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    const output = await runReplicate({
      token,
      owner: "prunaai",
      name: "p-image-edit",
      input,
      functionStart,
      budgetMs: 30_000,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
