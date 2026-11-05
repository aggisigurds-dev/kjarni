import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";
import { isOwnStorageUrl } from "../_lib/storageUrl";

// Video Upplyfting — lucataco/real-esrgan-video á Replicate
// (https://replicate.com/lucataco/real-esrgan-video). Frame-for-frame
// video upscale með Real-ESRGAN. Styður FHD / 2K / 4K útgáfur og þrjú
// líkön: Standard (fólk, vörur), Anime 6B (anime/cartoon), realesr-
// animevideov3 (snöggt anime video). Keyrsla getur tekið 2-10 mín eftir
// upprunaupplausn, FPS og útkomustærð — notum því async-mynstrið:
//   POST /api/video-upplyfting        → {predictionId} eða {videos: [...]}
//   GET  /api/video-upplyfting/status?id=... → {status, videos?, error?}

export const maxDuration = 30;

const MODELS = ["RealESRGAN_x4plus", "RealESRGAN_x4plus_anime_6B", "realesr-animevideov3"];
const RESOLUTIONS = ["FHD", "2k", "4k"];

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    videoUrl?: string;
    model?: string;
    resolution?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const videoInput = typeof body.videoUrl === "string" && isOwnStorageUrl(body.videoUrl) ? body.videoUrl : null;
  if (!videoInput) {
    return bad(400, "video vantar");
  }

  const input: Record<string, unknown> = {
    video_path: videoInput,
    model: MODELS.includes(body.model || "") ? body.model : "RealESRGAN_x4plus",
    resolution: RESOLUTIONS.includes(body.resolution || "") ? body.resolution : "FHD",
  };

  try {
    const prediction = await submitReplicate({
      token,
      owner: "lucataco",
      name: "real-esrgan-video",
      input,
    });
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({ videos: outputToUrls(prediction.output) });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return bad(502, prediction.error || "Video upscale mistókst strax");
    }
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
