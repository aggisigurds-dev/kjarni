import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Litun — piddnad/ddcolor á Replicate
// (https://replicate.com/piddnad/ddcolor). Dual-decoder colorization —
// litar svart/hvítt myndir (eða þegar það vantar lit á gamalli mynd).
// Classical ML, enginn safety filter.
//
// Notkun hjá Slökkvitæki: gamlar skoðunarmyndir, archive-ljósmyndir,
// svarthvítar vörumyndir sem þarf að endurlita fyrir vefinn.

export const maxDuration = 60;

const MODEL_SIZES = ["large", "tiny"] as const;
type ModelSize = (typeof MODEL_SIZES)[number];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: { image?: string; modelSize?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }
  const modelSize: ModelSize = MODEL_SIZES.includes(body.modelSize as ModelSize)
    ? (body.modelSize as ModelSize)
    : "large";

  try {
    const output = await runReplicate({
      token,
      owner: "piddnad",
      name: "ddcolor",
      input: { image: body.image, model_size: modelSize },
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
