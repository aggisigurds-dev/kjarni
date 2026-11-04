import { NextRequest, NextResponse } from "next/server";
import { isOwnStorageUrl } from "../../_lib/storageUrl";

// Fjarlægja hlut — sjálfstætt ArtCraft-tól sem gerir það sem PhotoDirector/
// Snapseed's "lækningabursti" / Picsart's object-removal gera: máluðu yfir
// óæskilegan hlut (fólk, kapal, skilti, vatnsmerki) með bursta, AI fjarlægir
// hann og endurgerir það sem var undir. Notar bria/eraser — þjálfað
// eingöngu á leyfisskyldum gögnum, öruggt í viðskiptalegri notkun.
//
// Grímu-merkingin staðfest beint gegn Replicate (ekki giskað): sótti
// bria/eraser's eigið default_example (image+mask+output, demo-mynd af
// "uppvakningi" í bakgrunni ljósmyndar) og skoðaði grímuna — hvít flögin
// nákvæmlega yfir hlutnum sem átti að hverfa, svart allt annað staðar.
// Sama mynstur og bria/genfill (sjá app/api/svidsmynd/replicate/route.ts).
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API (GET
// /v1/models/bria/eraser — openapi_schema):
//   1) GET  /v1/models/bria/eraser         → latest_version.id
//   2) POST /v1/predictions (Prefer: wait=3) → keyrir líkanið
//   3) ef ekki búið innan þess glugga: póllum urls.get þangað til
//   4) skilum úttaksslóðinni (replicate.delivery) BEINT til vafrans.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "bria";
const MODEL_NAME = "eraser";

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | null;
  error?: string | null;
  urls: { get: string };
};

async function resolveLatestVersion(token: string): Promise<string> {
  const res = await fetch(`${REPLICATE_API}/models/${MODEL_OWNER}/${MODEL_NAME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fann ekki Fjarlægja hlut-líkanið á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af Fjarlægja hlut-líkaninu");
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

  let body: { imageUrl?: string; maskUrl?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const imageUrl = body.imageUrl;
  if (!imageUrl || !isOwnStorageUrl(imageUrl)) {
    return bad(400, "imageUrl vantar eða er ekki frá okkar eigin geymslu");
  }
  const maskUrl = body.maskUrl;
  if (!maskUrl || !isOwnStorageUrl(maskUrl)) {
    return bad(400, "maskUrl vantar — málaðu yfir hlutinn sem á að fjarlægja fyrst");
  }

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
      body: JSON.stringify({
        version,
        input: {
          image: imageUrl,
          mask: maskUrl,
          preserve_alpha: false,
        },
      }),
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
    if (prediction.status !== "succeeded" || !prediction.output) {
      return bad(502, prediction.error || "Fjarlægja hlut-líkanið á Replicate mistókst");
    }

    return NextResponse.json({ image: prediction.output });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
