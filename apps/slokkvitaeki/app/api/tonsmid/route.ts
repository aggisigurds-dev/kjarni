import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";

// Tónsmíð — elevenlabs/music á Replicate. Semur heilt lag úr texta-prompt-i.
// Keyrsla tekur 30–60s svo við notum async-mynstur eins og Wan 2.2:
//   POST /api/tonsmid         → {predictionId} eða {audio: [...]}
//   GET  /api/tonsmid/status  → {status, audio?, error?}

export const maxDuration = 30;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function clampLengthMs(sec: unknown): number {
  const num = typeof sec === "number" ? sec : 30;
  if (!Number.isFinite(num)) return 30_000;
  return Math.min(300_000, Math.max(10_000, Math.round(num * 1000)));
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    prompt?: string;
    lengthSeconds?: number;
    forceInstrumental?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");

  const input: Record<string, unknown> = {
    prompt,
    music_length_ms: clampLengthMs(body.lengthSeconds),
    force_instrumental: body.forceInstrumental === true,
  };

  try {
    const prediction = await submitReplicate({
      token,
      owner: "elevenlabs",
      name: "music",
      input,
    });
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({ audio: outputToUrls(prediction.output) });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return bad(502, prediction.error || "Tónsmíð mistókst strax");
    }
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
