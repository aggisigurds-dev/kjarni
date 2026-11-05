import { NextRequest, NextResponse } from "next/server";
import { badReplicate, outputToUrls, runReplicate } from "@/app/api/_lib/replicate";
import { isOwnStorageUrl } from "../_lib/storageUrl";

// Andlitslás — noahgsolomon/face-swap á eina mynd (sama líkan og Endurljós
// og Hraðbreyta nota fyrir „halda andliti“). Móta myndbandshamur setur
// andlitið úr fyrsta myndbandinu á upphafsramma hvers framhalds, svo
// andlitið reki ekki út um þúfur eftir 2–4 framhöld.
//   POST { image, face } → { image: url }
//   image = ramminn sem andlitið fer á; face = myndin sem andlitið kemur úr.

export const maxDuration = 60;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const functionStart = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return bad(500, "REPLICATE_API_TOKEN vantar í umhverfisbreytur — sjá Vercel Settings → Environment Variables.");
  }

  let body: { image?: string; face?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }
  if (typeof body.image !== "string" || !isOwnStorageUrl(body.image)) return bad(400, "image vantar");
  if (typeof body.face !== "string" || !isOwnStorageUrl(body.face)) return bad(400, "face vantar");

  try {
    const output = await runReplicate({
      token,
      owner: "noahgsolomon",
      name: "face-swap",
      input: { input_image: body.image, swap_image: body.face },
      functionStart,
    });
    const urls = outputToUrls(output);
    if (!urls[0]) return bad(502, "Andlitslás skilaði engri mynd");
    return NextResponse.json({ image: urls[0] });
  } catch (err) {
    const r = badReplicate(err);
    return bad(r.status, r.error);
  }
}
