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
//
// Útkomustærð + varaauðkenni: `lowres_denoise` + `highres_denoise` ráða hversu
// mikið módelið má endurteikna (lægra = meira trú upprunalegri mynd en flatara
// ljós; hærra = meiri drama en meiri breyting á andliti). `output_quality`
// hækkar webp-gæðin — default 80 skilar oft smárri skrá.

export const maxDuration = 60;

const LIGHT_SOURCES = ["Left Light", "Right Light", "Top Light", "Bottom Light", "None"] as const;
type LightSource = (typeof LIGHT_SOURCES)[number];

const OUTPUT_FORMATS = ["webp", "png", "jpg"] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

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
    prompt?: string;
    appendedPrompt?: string;
    negativePrompt?: string;
    lightSource?: string;
    numResults?: number;
    seed?: number;
    disableSafetyChecker?: boolean;
    lowresDenoise?: number;
    highresDenoise?: number;
    highresScale?: number;
    cfg?: number;
    steps?: number;
    outputFormat?: string;
    outputQuality?: number;
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
  const outputFormat: OutputFormat = OUTPUT_FORMATS.includes(body.outputFormat as OutputFormat)
    ? (body.outputFormat as OutputFormat)
    : "webp";

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
    number_of_images: clampInt(body.numResults, 1, 1, 4),
    cfg: clampFloat(body.cfg, 2, 1, 10),
    steps: clampInt(body.steps, 25, 10, 50),
    highres_scale: clampFloat(body.highresScale, 1.5, 1.0, 1.5),
    highres_denoise: clampFloat(body.highresDenoise, 0.3, 0, 1),
    lowres_denoise: clampFloat(body.lowresDenoise, 0.7, 0, 1),
    output_format: outputFormat,
    output_quality: clampInt(body.outputQuality, 95, 1, 100),
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
