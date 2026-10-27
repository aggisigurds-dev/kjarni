import { NextRequest, NextResponse } from "next/server";

// Skýjastúdíó: texti → mynd með asiryan/juggernaut-xl-v7 á Replicate
// (https://replicate.com/asiryan/juggernaut-xl-v7) — ekkert staðbundið að
// setja upp (ólíkt Einkastúdíó/ComfyUI), en kostar smá upphæð per mynd og
// myndin fer út af vélinni.
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API
// (GET /v1/models/asiryan/juggernaut-xl-v7 — openapi_schema), ekki giskað,
// sama mynstur og app/api/vidgerd/replicate/route.ts:
//   1) GET  /v1/models/asiryan/juggernaut-xl-v7   → latest_version.id
//   2) POST /v1/predictions (Prefer: wait)         → keyrir líkanið
//   3) ef ekki búið innan "wait"-gluggans: póllum urls.get þangað til
//   4) sækjum úttaksslóðirnar (output er fylki af URI-um) og sendum
//      myndirnar til baka sem base64 data-URL-ar — tókinn fer aldrei til
//      vafrans.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "asiryan";
const MODEL_NAME = "juggernaut-xl-v7";
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
  if (!res.ok) throw new Error(`Fann ekki Juggernaut XL v7 á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af Juggernaut XL v7");
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

async function toDataUrl(token: string, uri: string): Promise<string> {
  const res = await fetch(uri, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

export async function POST(req: NextRequest) {
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
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");

  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: body.negativePrompt || "",
    width: clampSize(body.width, 1024),
    height: clampSize(body.height, 1024),
    num_inference_steps: clampSteps(body.steps, 40),
    guidance_scale: clampGuidance(body.guidanceScale, 7),
    scheduler: SCHEDULERS.includes(body.scheduler || "") ? body.scheduler : "K_EULER_ANCESTRAL",
    num_outputs: clampNumOutputs(body.numOutputs, 1),
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    const version = await resolveLatestVersion(token);
    const createRes = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ version, input }),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return bad(502, `Replicate hafnaði beiðninni (${createRes.status}): ${text.slice(0, 300)}`);
    }

    let prediction = (await createRes.json()) as ReplicatePrediction;
    if (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
      prediction = await pollPrediction(token, prediction.urls.get, Date.now() + 55_000);
    }
    if (prediction.status !== "succeeded" || !prediction.output?.length) {
      return bad(502, prediction.error || "Juggernaut XL v7 á Replicate mistókst");
    }

    const images = await Promise.all(prediction.output.map((uri) => toDataUrl(token, uri)));
    return NextResponse.json({ images });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
