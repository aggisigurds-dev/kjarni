import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Upplyfting — faglegt myndupplyfting með topazlabs/image-upscale á Replicate
// (https://replicate.com/topazlabs/image-upscale). Priced per output
// megapixel ($0.05 per 12 MP unit); gæði-upscale sem þekkt er úr Topaz Photo
// AI. Enhance-líkön og face enhancement passa sig við hvað er á myndinni.

export const maxDuration = 120;

const ENHANCE_MODELS = ["Standard V2", "Low Resolution V2", "CGI", "High Fidelity V2", "Text Refine"];
const UPSCALE_FACTORS = ["None", "2x", "4x", "6x"];
const SUBJECT_DETECTIONS = ["None", "Foreground", "Background", "All"];
const OUTPUT_FORMATS = ["jpg", "png", "webp"];

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
    image?: string;
    enhanceModel?: string;
    upscaleFactor?: string;
    faceEnhancement?: boolean;
    faceEnhancementCreativity?: number;
    faceEnhancementStrength?: number;
    subjectDetection?: string;
    outputFormat?: string;
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
    image: body.image,
    enhance_model: ENHANCE_MODELS.includes(body.enhanceModel || "") ? body.enhanceModel : "Standard V2",
    // Topaz schema krefst enum: "None" | "2x" | "4x" | "6x" (ekki tala, ekki
    // frjáls strengur). Fékk 422 áður þegar við sendum "2" sem passar ekki.
    upscale_factor: UPSCALE_FACTORS.includes(body.upscaleFactor || "") ? body.upscaleFactor : "2x",
    face_enhancement: body.faceEnhancement === true,
    face_enhancement_creativity: clampNumber(body.faceEnhancementCreativity, 0, 0, 1),
    face_enhancement_strength: clampNumber(body.faceEnhancementStrength, 0.8, 0, 1),
    subject_detection: SUBJECT_DETECTIONS.includes(body.subjectDetection || "")
      ? body.subjectDetection
      : "None",
    output_format: OUTPUT_FORMATS.includes(body.outputFormat || "") ? body.outputFormat : "jpg",
  };

  try {
    const output = await runReplicate({
      token,
      owner: "topazlabs",
      name: "image-upscale",
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
