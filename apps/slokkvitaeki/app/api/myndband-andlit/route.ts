import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, submitReplicate } from "@/app/api/_lib/replicateAsync";

// Myndband-andlit — arabyai-replicate/roop_face_swap á Replicate
// (https://replicate.com/arabyai-replicate/roop_face_swap). Tekur video og
// eina andlits-tilvísunarmynd og setur andlitið af myndinni á allt andlitið
// í myndbandinu, frame-fyrir-frame.
//
// Notkun:
//   - Chain-ast á eftir Skýjahreyfimynd ef persónan ber ekki eins og
//     frumritið (model-drift í Wan 2.2 getur breytt andlitinu).
//   - Chain-ast á eftir Myndbanda-upplyftingu þegar upplausnin er orðin há
//     en andlitið ekki rétt.
//   - Ein-skots deepfake innan Kjarna (sama andlits-leyfi og á öðrum
//     face-swap tólum okkar).
//
// Keyrsla getur tekið 2-10 mín eftir videoe-lengd, svo við notum async-
// mynstrið (submit → predictionId → poll /status route-ið).

export const maxDuration = 30;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    video?: string;
    videoUrl?: string;
    faceImage?: string;
    faceImageUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const videoInput =
    typeof body.video === "string" && body.video.startsWith("data:video/")
      ? body.video
      : typeof body.videoUrl === "string" && /^https?:\/\//i.test(body.videoUrl)
        ? body.videoUrl
        : null;
  if (!videoInput) return bad(400, "video vantar (data:video/... eða https://...)");

  const faceInput =
    typeof body.faceImage === "string" && body.faceImage.startsWith("data:image/")
      ? body.faceImage
      : typeof body.faceImageUrl === "string" && /^https?:\/\//i.test(body.faceImageUrl)
        ? body.faceImageUrl
        : null;
  if (!faceInput) return bad(400, "faceImage vantar (data:image/... eða https://...)");

  try {
    const prediction = await submitReplicate({
      token,
      owner: "arabyai-replicate",
      name: "roop_face_swap",
      input: {
        target_video: videoInput,
        swap_image: faceInput,
      },
    });
    if (prediction.status === "succeeded" && prediction.output != null) {
      return NextResponse.json({ videos: outputToUrls(prediction.output) });
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return bad(502, prediction.error || "Myndband-andlit mistókst strax");
    }
    return NextResponse.json({ predictionId: prediction.id, status: prediction.status });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
