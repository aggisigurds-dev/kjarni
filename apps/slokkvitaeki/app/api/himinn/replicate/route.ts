import { NextRequest, NextResponse } from "next/server";
import { isOwnStorageUrl } from "../../_lib/storageUrl";

// Himinn — sjálfstætt ArtCraft-tól sem gerir það sem PhotoDirector's AI
// Sky Replacement gerir: málaðu yfir himininn, lýstu nýjum himni í texta,
// AI setur hann inn og heldur restinni af myndinni óbreyttri. Notar
// bria/genfill — sama líkan og var upphaflega prófað fyrir Sviðsmynd (sjá
// þá skrá) áður en generate-background varð fyrir valinu þar (því það
// þurfti enga grímu fyrir ALLA myndina). Hér er gríma einmitt rétta
// aðferðin: notandi afmarkar nákvæmlega himin-svæðið, ekkert "finna
// vöruna sjálfkrafa" sem þarf.
//
// Engin alvöru "sky replacement" líkan fannst á Replicate (leitað beint —
// hvorki /v1/models?query=sky né hinir þekktu eigenda-slug-ar sem reynt
// var gáfu neitt). Prófað beint gegn alvöru mynd (sama demo-mynd og
// Fjarlægja hlut notar, mála efsta þriðjung) fyrir kóðun — himinninn
// skiptist út, ljós á skýjum/byggingum fylgdi með, restin óbreytt.
//
// Grímu-merkingin staðfest beint gegn Replicate (sama og í Sviðsmynd):
// hvítt = mála hér, svart = halda óbreyttu.
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API (GET
// /v1/models/bria/genfill — openapi_schema):
//   1) GET  /v1/models/bria/genfill        → latest_version.id
//   2) POST /v1/predictions (Prefer: wait=3) → keyrir líkanið
//   3) ef ekki búið innan þess glugga: póllum urls.get þangað til
//   4) skilum úttaksslóðinni (replicate.delivery) BEINT til vafrans.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "bria";
const MODEL_NAME = "genfill";

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
  if (!res.ok) throw new Error(`Fann ekki Himinn-líkanið á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af Himinn-líkaninu");
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

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: { imageUrl?: string; maskUrl?: string; prompt?: string; negativePrompt?: string; seed?: number };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar — lýstu himninum sem á að setja inn");

  const imageUrl = body.imageUrl;
  if (!imageUrl || !isOwnStorageUrl(imageUrl)) {
    return bad(400, "imageUrl vantar eða er ekki frá okkar eigin geymslu");
  }
  const maskUrl = body.maskUrl;
  if (!maskUrl || !isOwnStorageUrl(maskUrl)) {
    return bad(400, "maskUrl vantar — málaðu yfir himininn fyrst");
  }

  const input: Record<string, unknown> = {
    image: imageUrl,
    mask: maskUrl,
    prompt,
    preserve_alpha: false,
    num_results: 1,
  };
  if (body.negativePrompt?.trim()) input.negative_prompt = body.negativePrompt.trim();
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

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
      return bad(502, prediction.error || "Himinn-líkanið á Replicate mistókst");
    }

    return NextResponse.json({ images: prediction.output });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
