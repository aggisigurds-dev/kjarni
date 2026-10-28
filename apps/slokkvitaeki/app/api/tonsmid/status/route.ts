import { NextRequest, NextResponse } from "next/server";
import { badReplicate, getReplicatePrediction, outputToUrls } from "@/app/api/_lib/replicateAsync";

// Status-fyrirspurn fyrir Tónsmíð — client pollar þetta route þegar
// POST /api/tonsmid skilar {predictionId}.

export const maxDuration = 15;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur");
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return bad(400, "id vantar eða er ógilt");
  }

  try {
    const prediction = await getReplicatePrediction({ token, predictionId: id });
    const logs = typeof prediction.logs === "string" ? prediction.logs : undefined;
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({
        status: "succeeded",
        audio: outputToUrls(prediction.output),
        logs,
      });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return NextResponse.json({
        status: prediction.status,
        error: prediction.error || "Tónsmíð mistókst",
        logs,
      });
    }
    return NextResponse.json({ status: prediction.status, logs });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
