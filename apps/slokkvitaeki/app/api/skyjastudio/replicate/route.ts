import { NextRequest, NextResponse } from "next/server";

// Skýjastúdíó: texti → mynd með stability-ai/sdxl á Replicate
// (https://replicate.com/stability-ai/sdxl) — ekkert staðbundið að setja
// upp (ólíkt Einkastúdíó/ComfyUI), en kostar smá upphæð per mynd og myndin
// fer út af vélinni.
//
// Valið fram yfir önnur SDXL-afbrigði því þetta er eina líkanið sem
// útsetur disable_safety_checker/apply_watermark sem skjalfesta
// API-breytu, sjá https://replicate.com/docs/how-does-replicate-work#safety.
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API
// (GET /v1/models/stability-ai/sdxl — openapi_schema), ekki giskað, sama
// mynstur og app/api/vidgerd/replicate/route.ts, með einni breytingu:
//   1) GET  /v1/models/stability-ai/sdxl          → latest_version.id
//   2) POST /v1/predictions (Prefer: wait)         → keyrir líkanið
//   3) ef ekki búið innan "wait"-gluggans: póllum urls.get þangað til
//   4) skilum úttaksslóðunum (replicate.delivery) BEINT til vafrans — EKKI
//      base64-encoded í JSON-inu. Staðfest að þær slóðir eru sjálfar
//      opinberlega sækjanlegar án Authorization (Access-Control-Allow-
//      Origin: *), svo það þarf ekki að proxy-a bætunum í gegnum þessa
//      leið. Að base64-encode allt að 4 SDXL-myndir hér myndi geta farið
//      yfir Vercel's 4.5MB svarstærðarmörk fyrir Serverless Functions og
//      týnt niðurstöðu úr borgaðri keyrslu — sjá PR #256 review.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "stability-ai";
const MODEL_NAME = "sdxl";
const SCHEDULERS = ["DDIM", "DPMSolverMultistep", "HeunDiscrete", "KarrasDPM", "K_EULER_ANCESTRAL", "K_EULER", "PNDM"];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[] | null;
  error?: string | null;
  urls: { get: string };
};

async function resolveLatestVersion(token: string): Promise<string> {
  const res = await fetch(`${REPLICATE_API}/models/${MODEL_OWNER}/${MODEL_NAME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fann ekki SDXL á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af SDXL");
  return id;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollPrediction(token: string, getUrl: string, deadline: number): Promise<ReplicatePrediction> {
  for (;;) {
    const res = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Replicate svaraði ${res.status} við eftirfylgni`);
    const prediction = (await res.json()) as ReplicatePrediction;
    if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
      return prediction;
    }
    if (Date.now() > deadline) throw new Error("Replicate svaraði ekki í tæka tíð");
    await sleep(1500);
  }
}

function clampSize(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1536, Math.max(512, Math.round(num / 8) * 8));
}

function clampSteps(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(1, Math.round(num)));
}

function clampGuidance(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(50, Math.max(1, num));
}

function clampNumOutputs(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(4, Math.max(1, Math.round(num)));
}

function clampStrength(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
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
    width?: number;
    height?: number;
    steps?: number;
    guidanceScale?: number;
    scheduler?: string;
    numOutputs?: number;
    seed?: number;
    disableSafetyChecker?: boolean;
    applyWatermark?: boolean;
    promptStrength?: number;
    image?: string;
    mask?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");

  const hasImage = typeof body.image === "string" && body.image.startsWith("data:image/");
  const hasMask = typeof body.mask === "string" && body.mask.startsWith("data:image/");
  if (hasMask && !hasImage) return bad(400, "mask krefst image (inpaint þarf bæði)");

  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: body.negativePrompt || "",
    width: clampSize(body.width, 1024),
    height: clampSize(body.height, 1024),
    num_inference_steps: clampSteps(body.steps, 50),
    guidance_scale: clampGuidance(body.guidanceScale, 7.5),
    scheduler: SCHEDULERS.includes(body.scheduler || "") ? body.scheduler : "K_EULER",
    num_outputs: clampNumOutputs(body.numOutputs, 1),
    disable_safety_checker: body.disableSafetyChecker === true,
    apply_watermark: body.applyWatermark !== false,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);
  if (hasImage) {
    input.image = body.image;
    input.prompt_strength = clampStrength(body.promptStrength, 0.8);
  }
  if (hasMask) input.mask = body.mask;

  try {
    const version = await resolveLatestVersion(token);
    const createRes = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // A bare "Prefer: wait" defaults to the full 60s — which alone can
        // exhaust this function's entire maxDuration budget before our own
        // poll loop even starts, losing a successful paid prediction when
        // Vercel kills the function mid-wait. Ask Replicate for a short
        // synchronous wait instead and hand control back to our own loop,
        // which budgets the *remaining* time precisely (see functionStart
        // below) — verified against https://replicate.com/docs/reference/http.
        Prefer: "wait=3",
      },
      body: JSON.stringify({ version, input }),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return bad(502, `Replicate hafnaði beiðninni (${createRes.status}): ${text.slice(0, 300)}`);
    }

    let prediction = (await createRes.json()) as ReplicatePrediction;
    if (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
      // Deadline is relative to when THIS function started, not to when the
      // initial fetch above returned — the initial wait already spent some
      // of our maxDuration budget, so the poll loop must account for that.
      prediction = await pollPrediction(token, prediction.urls.get, functionStart + 55_000);
    }
    if (prediction.status !== "succeeded" || !prediction.output?.length) {
      return bad(502, prediction.error || "SDXL á Replicate mistókst");
    }

    return NextResponse.json({ images: prediction.output });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
