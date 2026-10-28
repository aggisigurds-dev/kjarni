/** Sameiginleg leið til að keyra Replicate-líkön úr Netflix-serverless föllum
 * án þess að endurtaka alla boilerplate-ina í hverri route.
 *
 * Sama mynstur og handskrifuðu route-urnar í /api/skyjastudio/replicate og
 * /api/skyjastudio/flux-fill:
 *   1) GET  /v1/models/{owner}/{name}   → latest_version.id
 *   2) POST /v1/predictions (Prefer: wait=3) → keyrir líkanið
 *   3) ef ekki búið innan "wait"-gluggans: póllum urls.get þangað til
 *   4) skilum output BEINT — kallandinn ákveður hvernig á að túlka það.
 *
 * `Prefer: wait=3` er mikilvægt: ber "wait" án töflu er 60s sem er ALLUR
 * maxDuration-budget-inn, svo Vercel drepur fallið mid-wait og við týnum
 * borgaðri keyrslu. 3s wait + okkar eigin loopa gefur okkur stjórn.
 *
 * `budgetMs` er m.v. upphaf fallsins (functionStart), ekki þegar þessi fall
 * byrjar — kallandinn mælir functionStart ÁÐUR en json-ið er parse-að og
 * sendir hingað, svo deadlineinn er alltaf réttur. */

export type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  urls: { get: string };
};

export class ReplicateError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ReplicateError";
  }
}

const REPLICATE_API = "https://api.replicate.com/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveLatestVersion(token: string, owner: string, name: string): Promise<string> {
  const res = await fetch(`${REPLICATE_API}/models/${owner}/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ReplicateError(502, `Fann ekki ${owner}/${name} á Replicate (${res.status})`);
  const data = (await res.json()) as { latest_version?: { id?: string } };
  const id = data.latest_version?.id;
  if (!id) throw new ReplicateError(502, `Replicate skilaði engri útgáfu af ${owner}/${name}`);
  return id;
}

async function pollPrediction(token: string, getUrl: string, deadline: number): Promise<ReplicatePrediction> {
  for (;;) {
    const res = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ReplicateError(502, `Replicate svaraði ${res.status} við eftirfylgni`);
    const prediction = (await res.json()) as ReplicatePrediction;
    if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
      return prediction;
    }
    if (Date.now() > deadline) throw new ReplicateError(504, "Replicate svaraði ekki í tæka tíð");
    await sleep(1500);
  }
}

export async function runReplicate(opts: {
  token: string;
  owner: string;
  name: string;
  input: Record<string, unknown>;
  functionStart: number;
  /** Default 55000ms — passar við maxDuration=60 í route-unum. */
  budgetMs?: number;
}): Promise<unknown> {
  const budgetMs = opts.budgetMs ?? 55_000;
  const version = await resolveLatestVersion(opts.token, opts.owner, opts.name);
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
      Prefer: "wait=3",
    },
    body: JSON.stringify({ version, input: opts.input }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new ReplicateError(502, `Replicate hafnaði beiðninni (${createRes.status}): ${text.slice(0, 300)}`);
  }
  let prediction = (await createRes.json()) as ReplicatePrediction;
  if (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    prediction = await pollPrediction(opts.token, prediction.urls.get, opts.functionStart + budgetMs);
  }
  if (prediction.status !== "succeeded" || prediction.output == null) {
    throw new ReplicateError(502, prediction.error || `${opts.owner}/${opts.name} á Replicate mistókst`);
  }
  return prediction.output;
}

/** Þægindalag: útkoman úr Replicate getur verið strengur, listi af strengjum,
 * eða hlutur með {url}; þetta pakkar í einfaldan lista. */
export function outputToUrls(output: unknown): string[] {
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) {
    return output
      .map((item) => (typeof item === "string" ? item : typeof (item as { url?: string })?.url === "string" ? (item as { url: string }).url : null))
      .filter((v): v is string => typeof v === "string");
  }
  if (output && typeof output === "object" && typeof (output as { url?: string }).url === "string") {
    return [(output as { url: string }).url];
  }
  return [];
}

export function badReplicate(err: unknown): { status: number; error: string } {
  if (err instanceof ReplicateError) return { status: err.status, error: err.message };
  return { status: 502, error: err instanceof Error ? err.message : "Óvænt villa við Replicate-kall" };
}
