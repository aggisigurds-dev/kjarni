import { NextRequest, NextResponse } from "next/server";

// Skýjaleið fyrir Ljósmyndaviðgerð: kallar tencentarc/gfpgan á Replicate
// (https://replicate.com/tencentarc/gfpgan) í stað staðbundins netþjóns —
// engin uppsetning hjá notanda, en kostar smá upphæð per mynd og myndin
// fer út af vélinni. Þarf REPLICATE_API_TOKEN sem umhverfisbreytu
// (Vercel Settings → Environment Variables).
//
// Flæði (öll köll staðfest gegn https://replicate.com/docs/reference/http):
//   1) GET  /v1/models/tencentarc/gfpgan        → latest_version.id
//   2) POST /v1/predictions (Prefer: wait)       → keyrir líkanið
//   3) ef ekki búið innan "wait"-gluggans: póllum urls.get þangað til
//   4) sækjum úttaksslóðina (replicate.delivery, þarf líka Authorization)
//      og sendum bæturnar beint til baka — tókinn fer aldrei til vafrans.

export const maxDuration = 60;

const REPLICATE_API = "https://api.replicate.com/v1";
const MODEL_OWNER = "tencentarc";
const MODEL_NAME = "gfpgan";
const MAX_DATA_URL_LENGTH = 8 * 1024 * 1024; // grófur hemill — vafrinn minnkar myndina áður en hún er send

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls: { get: string };
};

async function resolveLatestVersion(token: string): Promise<string> {
  const res = await fetch(`${REPLICATE_API}/models/${MODEL_OWNER}/${MODEL_NAME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fann ekki GFPGAN-líkanið á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new Error("Replicate skilaði engri útgáfu af GFPGAN");
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
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: { imageDataUrl?: string; scale?: number; version?: "v1.3" | "v1.4" };
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
    return bad(413, "Myndin er of stór fyrir skýjaleiðina — reyndu minni mynd eða staðbundna netþjóninn.");
  }

  try {
    const version = await resolveLatestVersion(token);
    const createRes = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        version,
        input: {
          img: imageDataUrl,
          version: body.version ?? "v1.4",
          scale: body.scale ?? 2,
        },
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return bad(502, `Replicate hafnaði beiðninni (${createRes.status}): ${text.slice(0, 300)}`);
    }

    let prediction = (await createRes.json()) as ReplicatePrediction;
    if (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
      prediction = await pollPrediction(token, prediction.urls.get, Date.now() + 55_000);
    }
    if (prediction.status !== "succeeded" || !prediction.output) {
      return bad(502, prediction.error || "GFPGAN á Replicate mistókst");
    }

    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    const imageRes = await fetch(outputUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!imageRes.ok || !imageRes.body) return bad(502, "Gat ekki sótt útkomuna af Replicate");

    const headers = new Headers();
    headers.set("content-type", imageRes.headers.get("content-type") || "image/png");
    headers.set("cache-control", "no-store");
    return new Response(imageRes.body, { status: 200, headers });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Óvænt villa við Replicate-kall");
  }
}
