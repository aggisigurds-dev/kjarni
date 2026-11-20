import { NextRequest, NextResponse } from "next/server";
import {
  extraStudyHosts,
  MAX_STUDY_BYTES,
  parseStudyUrl,
} from "@/app/kjarni/artcraft/craft-anything/study";

export const maxDuration = 15;

const STUDY_HEADERS = {
  accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
  "user-agent": "Kjarni-CraftAnything/1",
};

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function fetchAllowed(start: URL, extra: string[], signal: AbortSignal) {
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal,
      headers: STUDY_HEADERS,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false as const, error: "Beining án slóðar" };
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false as const, error: "Ógild beining" };
      }
      const parsed = parseStudyUrl(next.href, extra);
      if (!parsed.ok) {
        return { ok: false as const, error: `Beining fór á óleyfðan hýsil (${next.hostname})` };
      }
      current = parsed.url;
      continue;
    }
    return { ok: true as const, res, url: current };
  }
  return { ok: false as const, error: "Of margar beiningar" };
}

async function readCapped(res: Response, max: number) {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > max) return { ok: false as const, error: "Síðan er of stór" };
  const reader = res.body?.getReader();
  if (!reader) return { ok: true as const, buf: new Uint8Array(0) };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return { ok: false as const, error: "Síðan er of stór" };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const chunk of chunks) {
    buf.set(chunk, off);
    off += chunk.byteLength;
  }
  return { ok: true as const, buf };
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
  let fetched: Awaited<ReturnType<typeof fetchAllowed>>;
  try {
    fetched = await fetchAllowed(parsed.url, extra, ctrl);
  } catch {
    return bad(502, "Gat ekki sótt síðuna");
  }
  if (!fetched.ok) return bad(400, fetched.error);

  const { res: upstream, url: finalUrl } = fetched;
  const type = upstream.headers.get("content-type") || "";
  if (type && !/text\/html|xhtml|text\/plain|javascript|json|xml/i.test(type)) {
    return bad(415, "Svarið er ekki HTML eða texti");
  }

  const read = await readCapped(upstream, MAX_STUDY_BYTES);
  if (!read.ok) return bad(413, read.error);
  const html = new TextDecoder("utf-8", { fatal: false }).decode(read.buf);

  return NextResponse.json({
    url: parsed.url.toString(),
    finalUrl: finalUrl.toString(),
    status: upstream.status,
    html,
  });
}
