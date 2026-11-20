import { NextRequest, NextResponse } from "next/server";
import {
  extraStudyHosts,
  MAX_STUDY_BYTES,
  parseStudyUrl,
} from "@/app/kjarni/artcraft/craft-anything/study";

export const maxDuration = 15;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Allowlisted HTML/text fetch for Craft Anything. Not an open URL proxy. */
export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Ógilt JSON");
  }
  const extra = extraStudyHosts(req.headers.get("host") ?? "");
  const parsed = parseStudyUrl(typeof body.url === "string" ? body.url : "", extra);
  if (!parsed.ok) return bad(400, parsed.error);

  const ctrl = AbortSignal.timeout(10_000);
  let upstream: Response;
  try {
    upstream = await fetch(parsed.url, {
      redirect: "follow",
      signal: ctrl,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
        "user-agent": "Kjarni-CraftAnything/1",
      },
    });
  } catch {
    return bad(502, "Gat ekki sótt síðuna");
  }

  const allowedAgain = parseStudyUrl(upstream.url, extra);
  if (!allowedAgain.ok) {
    return bad(400, `Beining fór á óleyfðan hýsil (${new URL(upstream.url).hostname})`);
  }

  const type = upstream.headers.get("content-type") || "";
  if (type && !/text\/html|xhtml|text\/plain|javascript|json|xml/i.test(type)) {
    return bad(415, "Svarið er ekki HTML eða texti");
  }
  const len = Number(upstream.headers.get("content-length") || 0);
  if (len > MAX_STUDY_BYTES) return bad(413, "Síðan er of stór");

  const buf = new Uint8Array(await upstream.arrayBuffer());
  if (buf.byteLength > MAX_STUDY_BYTES) return bad(413, "Síðan er of stór");
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  return NextResponse.json({
    url: parsed.url.toString(),
    finalUrl: upstream.url,
    status: upstream.status,
    html,
  });
}
