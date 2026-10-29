import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Endurljós — zsxkib/ic-light á Replicate
// (https://replicate.com/zsxkib/ic-light). Lítur á forgrunns-mynd (persóna/vara)
// og lýsir hana upp samkvæmt texta + ljósastefnu. Depth-aware að innan — sér
// formið á modelinu og dreifir ljósinu rétt (rim, soft, moody o.s.frv.).
//
// Perfect fyrir myndatöku: ef lýsingin á stúdíóinu var flöt eða rangri áttu
// stillt getur Endurljós endurlýst myndina á sekúndum án þess að rekast á
// hárið eða fötin.

export const maxDuration = 60;

const LIGHT_SOURCES = ["Left Light", "Right Light", "Top Light", "Bottom Light", "None"] as const;
type LightSource = (typeof LIGHT_SOURCES)[number];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampNumber(n: unknown, fallback: number, min: number, max: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
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
    appendedPrompt?: string;
    negativePrompt?: string;
    lightSource?: string;
    numResults?: number;
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
  const lightSource: LightSource = LIGHT_SOURCES.includes(body.lightSource as LightSource)
    ? (body.lightSource as LightSource)
    : "Left Light";

  const input: Record<string, unknown> = {
    subject_image: body.image,
    prompt,
    light_source: lightSource,
    appended_prompt:
      body.appendedPrompt?.trim() ||
      "best quality, highres, cinematic lighting, intricate details, sharp focus",
    negative_prompt:
      body.negativePrompt?.trim() ||
      "lowres, bad anatomy, bad hands, cropped, worst quality, blurry",
    number_of_images: clampNumber(body.numResults, 1, 1, 4),
    cfg: 2,
    highres_scale: 1.5,
    highres_denoise: 0.5,
    steps: 25,
    output_format: "webp",
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);
  if (body.disableSafetyChecker === true) input.disable_safety_checker = true;

  try {
    const output = await runReplicate({
      token,
      owner: "zsxkib",
      name: "ic-light",
      input,
      functionStart,
    });
    return NextResponse.json({ images: outputToUrls(output) });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
