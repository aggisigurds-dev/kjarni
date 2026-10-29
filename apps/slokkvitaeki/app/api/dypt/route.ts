import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Dýpt — cjwbw/depth-anything á Replicate
// (https://replicate.com/cjwbw/depth-anything). Depth Anything V1 (Apache-2.0,
// commercial-safe), DINOv2-DPT. Tekur mynd og skilar grátóna dýptarkorti —
// hvítt = nálægt, svart = fjarlægt. Classical CV — enginn safety filter.
//
// Hornsteinn „depth analyser for relight" sem Agnar bað um: Dýptarkort er
// hægt að nota sem viðmið fyrir Endurljós (sjá sem Normal map), fyrir
// bakgrunns-fókus (unsharp bak við mótíf), eða fyrir hreyfimynd (parallax).

export const maxDuration = 60;

const ENCODERS = ["vits", "vitb", "vitl"] as const;
type Encoder = (typeof ENCODERS)[number];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: { image?: string; encoder?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }
  const encoder: Encoder = ENCODERS.includes(body.encoder as Encoder)
    ? (body.encoder as Encoder)
    : "vitl";

  try {
    const output = await runReplicate({
      token,
      owner: "cjwbw",
      name: "depth-anything",
      input: { image: body.image, encoder },
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
