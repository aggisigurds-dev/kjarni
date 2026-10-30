import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";

// Breyta → Hraðbreyta — prunaai/p-image-edit á Replicate
// (https://replicate.com/prunaai/p-image-edit). Multi-image edit undir
// sekúndu, 45M+ keyrslur, $0.01 per mynd — passar vel í ítrun og tilraunir.
//
// preserveFace: Þegar ON chain-ast útkoman gegnum noahgsolomon/face-swap
// með upprunalega myndinni sem andlits-source. Pixel-perfect andlit,
// tvöfaldar kostnað og tíma. Sama mynstur og Endurljós.
//
// autoUpscale: Þegar ON chain-ast útkoman líka gegnum topazlabs/image-upscale
// 2x (Standard V2) í lokin — fullgæða mynd án þess að notandi þurfi að
// skipta um tól. Þetta er pre-upscale pipeline-ið: notandi fær úr Breyta
// strax mynd sem er bæði face-locked og fullupplausn.

// 150s þegar bæði face-swap og auto-upscale keyra á eftir.
export const maxDuration = 150;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: {
    image?: string;
    prompt?: string;
    seed?: number;
    preserveFace?: boolean;
    autoUpscale?: boolean;
    disableSafetyChecker?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return bad(400, "prompt vantar");
  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return bad(400, "image vantar (data:image/... URL)");
  }

  // prunaai/p-image-edit tekur `images` (array af uri) ekki `image`
  // (staðfest 2026-10-28: 422 „input: images is required"). Við sendum enn
  // eina mynd frá client-inu og vefjum í array hér.
  //
  // turbo: Replicate default er TRUE sem gaf aðeins ~150-300kb myndir út
  // (lágupplausn). Við hardcodum ALLTAF FALSE til að fá fullgæða útkomu.
  // Notandi þarf ekki að hugsa um þennan parameter — Kjarni fer alltaf á
  // fullgæði.
  const input: Record<string, unknown> = {
    images: [body.image],
    prompt,
    turbo: false,
    disable_safety_checker: body.disableSafetyChecker === true,
  };
  if (typeof body.seed === "number" && body.seed >= 0) input.seed = Math.trunc(body.seed);

  try {
    // Fyrri skref: pruna breytir myndinni. Budget skiptum við á milli skrefa:
    // 30s á pruna + ~75s á face-swap ef togglad, annars 30s á pruna eitt.
    const prunaBudget = body.preserveFace === true ? 30_000 : 60_000;
    const output = await runReplicate({
      token,
      owner: "prunaai",
      name: "p-image-edit",
      input,
      functionStart,
      budgetMs: prunaBudget,
    });
    let urls = outputToUrls(output);

    // Seinni skref (optional): face-swap með upprunalega andlitinu til að
    // tryggja pixel-perfect identity. Keyrir á hvert pruna-output með
    // upprunalegu myndinni sem andlits-source. Tvöfaldar kostnað og tíma.
    if (body.preserveFace === true && urls.length > 0) {
      const faceSwapped: string[] = [];
      for (const editedUrl of urls) {
        const swapOutput = await runReplicate({
          token,
          owner: "noahgsolomon",
          name: "face-swap",
          input: {
            // input_image: myndin sem andlitið er sett á (breytta myndin)
            // swap_image: andlits-source (upprunalega myndin)
            input_image: editedUrl,
            swap_image: body.image,
          },
          functionStart,
          budgetMs: 90_000,
        });
        const swapped = outputToUrls(swapOutput);
        if (swapped[0]) faceSwapped.push(swapped[0]);
      }
      if (faceSwapped.length > 0) urls = faceSwapped;
    }

    // Þriðja skref (optional): auto-upscale með topazlabs/image-upscale 2x
    // (Standard V2 enhance, enginn face-enhancement því face-swap er núþegar
    // keyrður). Þetta gefur útkomuna strax í fullgæða.
    if (body.autoUpscale === true && urls.length > 0) {
      const upscaled: string[] = [];
      for (const url of urls) {
        try {
          const upOutput = await runReplicate({
            token,
            owner: "topazlabs",
            name: "image-upscale",
            input: {
              image: url,
              enhance_model: "Standard V2",
              upscale_factor: "2x",
              face_enhancement: false,
              face_enhancement_creativity: 0,
              face_enhancement_strength: 0.8,
              subject_detection: "None",
              output_format: "png",
            },
            functionStart,
            budgetMs: 100_000,
          });
          const upUrls = outputToUrls(upOutput);
          if (upUrls[0]) upscaled.push(upUrls[0]);
        } catch {
          // Ef upscale mistekst, höldum upprunalegu útkomunni frekar en að
          // kasta heildinni. Notandi fær pruna-mynd en ekki fullupplausn.
          upscaled.push(url);
        }
      }
      if (upscaled.length > 0) urls = upscaled;
    }

    return NextResponse.json({ images: urls });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
