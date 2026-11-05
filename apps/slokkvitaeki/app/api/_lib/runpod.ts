/** RunPod Serverless keyrslur — sama hugmynd og replicateAsync.ts en fyrir
 * eigin GPU-ið okkar á RunPod.
 *
 * Mynstur:
 *   1) POST /v2/<endpoint>/run — alltaf async, skilar {id, status: "IN_QUEUE"}
 *   2) GET  /v2/<endpoint>/status/<id> á 5s fresti þangað til status er
 *      COMPLETED/FAILED/CANCELLED/TIMED_OUT
 *   3) COMPLETED svar inniheldur `output` (worker-specific; getur verið strengur,
 *      hlutur, data-URL, o.s.frv.) — kallandinn parsar.
 *
 * Cold start fyrst eftir deploy getur verið 10-15 mín (model download);
 * warm cold-start eftir það er 5-30s. */

const RUNPOD_API = "https://api.runpod.ai/v2";

export type RunpodStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";

export type RunpodJob = {
  id: string;
  status: RunpodStatus;
  output?: unknown;
  error?: string;
  delayTime?: number;
  executionTime?: number;
};

export class RunpodError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RunpodError";
  }
}

export async function submitRunpod(opts: {
  token: string;
  endpointId: string;
  input: Record<string, unknown>;
}): Promise<RunpodJob> {
  const res = await fetch(`${RUNPOD_API}/${opts.endpointId}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: opts.input }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new RunpodError(502, `RunPod hafnaði beiðninni (${res.status}): ${text.slice(0, 400)}`);
  }
  return (await res.json()) as RunpodJob;
}

export async function getRunpodJob(opts: {
  token: string;
  endpointId: string;
  jobId: string;
}): Promise<RunpodJob> {
  const res = await fetch(`${RUNPOD_API}/${opts.endpointId}/status/${opts.jobId}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) throw new RunpodError(res.status, `RunPod svaraði ${res.status} við status-fyrirspurn`);
  return (await res.json()) as RunpodJob;
}

/** Þýðir RunPod-stöðuna yfir í sömu nöfn og Replicate notar í restinni af
 *  codebase — svo client-kóðinn þurfi ekki að hugsa um hvora þjónustuna er að
 *  tala við. */
export function normalizeRunpodStatus(status: RunpodStatus): "starting" | "processing" | "succeeded" | "failed" | "canceled" {
  switch (status) {
    case "IN_QUEUE":
      return "starting";
    case "IN_PROGRESS":
      return "processing";
    case "COMPLETED":
      return "succeeded";
    case "CANCELLED":
      return "canceled";
    case "FAILED":
    case "TIMED_OUT":
    default:
      return "failed";
  }
}

export function badRunpod(err: unknown): { status: number; error: string } {
  if (err instanceof RunpodError) return { status: err.status, error: err.message };
  return { status: 502, error: err instanceof Error ? err.message : "Óvænt villa við RunPod-kall" };
}
