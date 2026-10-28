/** Async-leið fyrir Replicate-líkön sem taka 1–10 mínútur (video, upscalers
 * með mikilli upplausn o.s.frv.). Sync-leiðin í `replicate.ts` passar bara
 * við líkön sem klára innan Vercel's maxDuration (300s á Pro, 60s á Hobby).
 *
 * Mynstur:
 *   1) POST /predictions með Prefer: wait=5 — ef líkanið klárar innan 5s
 *      skilum við strax niðurstöðu, annars skilum við prediction-id.
 *   2) Client pollar status-route-ið (sem notar `getReplicatePrediction`
 *      hér) á 5s fresti þangað til status er succeeded/failed/canceled.
 *
 * Þannig þurfum við ekki eitt stórt Vercel-fall sem bíður í 10 mín. */

const REPLICATE_API = "https://api.replicate.com/v1";

export type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  urls: { get: string };
  logs?: string;
  metrics?: { predict_time?: number };
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

export async function submitReplicate(opts: {
  token: string;
  owner: string;
  name: string;
  input: Record<string, unknown>;
}): Promise<ReplicatePrediction> {
  const version = await resolveLatestVersion(opts.token, opts.owner, opts.name);
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
      // Mjög stuttur wait: ef líkanið er warm og klárar á 5s þá sparar það
      // einn client round-trip. Annars föllum við strax í pollun.
      Prefer: "wait=5",
    },
    body: JSON.stringify({ version, input: opts.input }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new ReplicateError(502, `Replicate hafnaði beiðninni (${createRes.status}): ${text.slice(0, 400)}`);
  }
  return (await createRes.json()) as ReplicatePrediction;
}

export async function getReplicatePrediction(opts: {
  token: string;
  predictionId: string;
}): Promise<ReplicatePrediction> {
  const res = await fetch(`${REPLICATE_API}/predictions/${opts.predictionId}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) throw new ReplicateError(res.status, `Replicate svaraði ${res.status} við status-fyrirspurn`);
  return (await res.json()) as ReplicatePrediction;
}

export function outputToUrls(output: unknown): string[] {
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) {
    return output
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof (item as { url?: string })?.url === "string"
            ? (item as { url: string }).url
            : null,
      )
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
