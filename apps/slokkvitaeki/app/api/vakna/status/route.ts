import { NextRequest, NextResponse } from "next/server";
import { badRunpod, getRunpodJob, normalizeRunpodStatus } from "@/app/api/_lib/runpod";

// Status-fyrirspurn fyrir Vakna. Client pollar þetta route þangað til status
// er "succeeded" (COMPLETED) eða "failed"/"canceled". Þegar succeeded skilum
// við `video` reitnum úr output-inu beint — það er data:video/mp4;base64,...
// strengur. Client decode-ar í Blob.

export const maxDuration = 15;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const token = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_VAKNA_ENDPOINT;
  if (!token || !endpointId) return bad(500, "RUNPOD-env vantar");

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[a-z0-9-]+$/i.test(id)) return bad(400, "id vantar eða er ógilt");

  try {
    const job = await getRunpodJob({ token, endpointId, jobId: id });
    const status = normalizeRunpodStatus(job.status);
    if (job.status === "COMPLETED") {
      const out = job.output as { video?: string; images?: string[] } | string | undefined;
      let video: string | undefined;
      if (typeof out === "string") video = out;
      else if (out && typeof out === "object") video = out.video ?? out.images?.[0];
      if (!video) {
        return NextResponse.json({ status: "failed", error: "RunPod skilaði engu myndbandi í output" });
      }
      return NextResponse.json({
        status,
        video,
        delayTime: job.delayTime,
        executionTime: job.executionTime,
      });
    }
    if (job.status === "FAILED" || job.status === "CANCELLED" || job.status === "TIMED_OUT") {
      return NextResponse.json({ status, error: job.error || `RunPod ${job.status}` });
    }
    return NextResponse.json({ status, delayTime: job.delayTime, executionTime: job.executionTime });
  } catch (err) {
    const r = badRunpod(err);
    return bad(r.status, r.error);
  }
}
