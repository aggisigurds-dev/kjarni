import { NextRequest, NextResponse } from "next/server";

// Andlitsfegrun — sjálfstætt ArtCraft-tól sem gerir það sem Airbrush/
// YouCam Perfect gera: jöfn húð, fjarlægja bletti, hvítari tennur, minnka
// hringi undir augum — náttúrulegt portrett-retouch, ekki plastic-skin
// yfirkeyrsla. Notar prunaai/p-image-edit (sama líkan og Breyta's
// "Hraðbreyta" hamur notar, sjá app/kjarni/artcraft/breyta/models.ts),
// en með eigin, sjálfstæðu tóli og forsmíðuðum lagfæringa-prómptum frekar
// en frjálsum texta.
//
// Gæði staðfest fyrir kóðun: keyrði SDXL-búna (ekki alvöru manneskju)
// prufumynd með sýnilegri húðáferð/freknum gegnum nákvæmlega þessar
// leiðbeiningar — húðáferð/svitaholur héldust, blettir/hringir minnkuðu,
// andlitslögun/hár/augu/lýsing/bakgrunnur óbreytt í samsetningu.
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API (GET
// /v1/models/prunaai/p-image-edit — openapi_schema):
//   1) GET  /v1/models/prunaai/p-image-edit → latest_version.id
//   2) POST /v1/predictions (Prefer: wait=3)  → keyrir líkanið
//   3) ef ekki búið innan þess glugga: póllum urls.get þangað til
//   4) skilum úttaksslóðinni (replicate.delivery) BEINT til vafrans.
//
// turbo: false alltaf — sjá athugasemd í breyta/models.ts: sjálfgefið
// turbo:true gefur lágupplausn (~150-300kb) myndir.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "prunaai";
const MODEL_NAME = "p-image-edit";
const MAX_DATA_URL_LENGTH = 8 * 1024 * 1024; // grófur hemill — vafrinn minnkar myndina áður en hún er send

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
  if (!res.ok) throw new Error(`Fann ekki Andlitsfegrun-líkanið á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af Andlitsfegrun-líkaninu");
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

  let body: { imageDataUrl?: string; prompt?: string; seed?: number };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar — veldu að minnsta kosti eina lagfæringu");

  const imageDataUrl = body.imageDataUrl;
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    return bad(400, "imageDataUrl vantar eða er ekki data-URL mynd");
  }
  if (imageDataUrl.length > MAX_DATA_URL_LENGTH) {
    return bad(413, "Myndin er of stór fyrir skýjaleiðina — reyndu minni mynd.");
  }

  const input: Record<string, unknown> = {
    images: [imageDataUrl],
    prompt,
    turbo: false,
  };
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
    if (prediction.status !== "succeeded" || !prediction.output) {
      return bad(502, prediction.error || "Andlitsfegrun-líkanið á Replicate mistókst");
    }

    return NextResponse.json({ image: prediction.output });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
