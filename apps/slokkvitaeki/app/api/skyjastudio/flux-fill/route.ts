import { NextRequest, NextResponse } from "next/server";

// Skýjastúdíó — inpaint-valkostur með black-forest-labs/flux-fill-dev á
// Replicate (https://replicate.com/black-forest-labs/flux-fill-dev), til
// hliðar við stability-ai/sdxl (app/api/skyjastudio/replicate/route.ts).
// Sama "skýjaleið" og ekkert staðbundið að setja upp, en Flux's T5
// texta-encoder skilur prómt mun betur en SDXL's CLIP-encoder — gott t.d.
// þegar á að fjarlægja hlut sem hylur eitthvað og endurgera það sem er
// undir.
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API
// (GET /v1/models/black-forest-labs/flux-fill-dev — openapi_schema), ekki
// giskað, sama mynstur og SDXL-leiðin:
//   1) GET  /v1/models/black-forest-labs/flux-fill-dev → latest_version.id
//   2) POST /v1/predictions (Prefer: wait)               → keyrir líkanið
//   3) ef ekki búið innan "wait"-gluggans: póllum urls.get þangað til
//   4) skilum úttaksslóðunum (replicate.delivery) BEINT til vafrans — sömu
//      ástæður og SDXL-leiðin núna gerir (sjá þá skrá): slóðirnar eru
//      sjálfar opinberlega sækjanlegar, óþarfi að proxy-a bætunum og
//      áhættusamt að base64-encode margar myndir inn í eitt JSON-svar.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "black-forest-labs";
const MODEL_NAME = "flux-fill-dev";

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
  if (!res.ok) throw new Error(`Fann ekki Flux Fill á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af Flux Fill");
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

function clampGuidance(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, num));
}

function clampSteps(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(50, Math.max(1, Math.round(num)));
}

function clampNumOutputs(n: unknown, fallback: number): number {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(4, Math.max(1, Math.round(num)));
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    prompt?: string;
    guidance?: number;
    steps?: number;
    numOutputs?: number;
    seed?: number;
    disableSafetyChecker?: boolean;
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
  if (!hasImage || !hasMask) return bad(400, "image og mask vantar — Flux Fill er eingöngu fyrir inpaint");

  const input: Record<string, unknown> = {
    prompt,
    image: body.image,
    mask: body.mask,
    guidance: clampGuidance(body.guidance, 30),
    num_inference_steps: clampSteps(body.steps, 28),
    num_outputs: clampNumOutputs(body.numOutputs, 1),
    disable_safety_checker: body.disableSafetyChecker === true,
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
      return bad(502, prediction.error || "Flux Fill á Replicate mistókst");
    }

    return NextResponse.json({ images: prediction.output });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
