import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Breyta → Headshot — flux-kontext-apps/professional-headshot á Replicate
// (https://replicate.com/flux-kontext-apps/professional-headshot). Tekur
// hvaða portrett-mynd sem er og endurgerir hana sem faglegt headshot.
//
// Perfect fyrir Slökkvitæki/Brunahólf — "Pétur í geymslunni" → "Pétur á
// grafitt bakgrunni", gegn ~$0.05 á mynd.

export const maxDuration = 60;

const BACKGROUNDS = ["neutral", "white", "black", "gray", "office"];

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
    gender?: string;
    background?: string;
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

  const input: Record<string, unknown> = {
    input_image: body.image,
    // flux-kontext-apps/professional-headshot schema: background er enum
    // með 5 gildum (neutral/white/black/gray/office). Ekki frjáls texti.
    background: BACKGROUNDS.includes(body.background || "") ? body.background : "neutral",
    disable_safety_checker: body.disableSafetyChecker === true,
  };
  if (body.gender === "male" || body.gender === "female") input.gender = body.gender;

  try {
    const output = await runReplicate({
      token,
      owner: "flux-kontext-apps",
      name: "professional-headshot",
      input,
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
