import { NextRequest, NextResponse } from "next/server";

// Bakgrunnur — skýjaleið með 851-labs/background-remover á Replicate
// (https://replicate.com/851-labs/background-remover), til hliðar við
// staðbundna @imgly/background-removal WASM-leiðina (í vafra, ókeypis).
//
// Valið fram yfir önnur bakgrunns-líkön á Replicate eftir samanburð á
// run-count og eigin collection Replicate (/v1/collections/remove-backgrounds
// — 851-labs er efst, 36M+ keyrslur, langt umfram næsta valkost); engin
// alvöru "Photoroom" líkan fannst á Replicate (GET /v1/models/photoroom →
// 404). Prófað beint gegn alvöru vörumynd úr versluninni (public/vorur/12.jpg)
// fyrir kóðun — hrein klipping, gegnsæi í lagi, <1 sek keyrsla.
//
// Flæði og input/output-skema staðfest beint gegn Replicate's API
// (GET /v1/models/851-labs/background-remover — openapi_schema), ekki
// giskað, sama mynstur og hinar Replicate-leiðirnar:
//   1) GET  /v1/models/851-labs/background-remover → latest_version.id
//   2) POST /v1/predictions (Prefer: wait=3)         → keyrir líkanið
//   3) ef ekki búið innan þess glugga: póllum urls.get þangað til
//   4) skilum úttaksslóðinni (replicate.delivery) BEINT til vafrans — staðfest
//      opinberlega sækjanleg án Authorization (Access-Control-Allow-Origin: *).

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "851-labs";
const MODEL_NAME = "background-remover";
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
  if (!res.ok) throw new Error(`Fann ekki bakgrunnslíkanið á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af bakgrunnslíkaninu");
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

  let body: { imageDataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const imageDataUrl = body.imageDataUrl;
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    return bad(400, "imageDataUrl vantar eða er ekki data-URL mynd");
  }
  if (imageDataUrl.length > MAX_DATA_URL_LENGTH) {
    return bad(413, "Myndin er of stór fyrir skýjaleiðina — reyndu minni mynd eða vafra-leiðina.");
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
          image: imageDataUrl,
          background_type: "rgba",
          format: "png",
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
      return bad(502, prediction.error || "Bakgrunnslíkanið á Replicate mistókst");
    }

    return NextResponse.json({ image: prediction.output });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
