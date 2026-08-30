import { NextRequest, NextResponse } from "next/server";
import { fotowebDownloadOrder, type FotowebAsset } from "../fotoweb-pick";

// Proxy fyrir TurboPaint: sækir gólfplan af leyfðum ytri slóðum (CORS bannar
// vafranum að gera það sjálfur). Skilur FotoWeb-permalink skjalasafns
// Reykjavíkur (…/<skrá>.tif.info): les asset-JSON og velur cache-JPEG
// (t.d. 6006 px) á undan ORIGINAL TIF svo síminn frjósi ekki við afþjöppun.

export const maxDuration = 60;

const ALLOWED_HOSTS = new Set(["skjalasafn.reykjavik.is"]);
const MAX_BYTES = 80 * 1024 * 1024;
const OK_TYPES = /^(image\/|application\/pdf)/i;

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function passThrough(upstream: Response, filename: string) {
  const headers = new Headers();
  let type = upstream.headers.get("content-type") || "application/octet-stream";
  // Background-task TIF kemur sem octet-stream — merkja rétt eftir endingu.
  if (/octet-stream/i.test(type) && /\.tiff?$/i.test(filename)) type = "image/tiff";
  headers.set("content-type", type);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);
  headers.set("x-plan-filename", encodeURIComponent(filename));
  headers.set("cache-control", "public, max-age=3600");
  return new Response(upstream.body, { status: 200, headers });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// FotoWeb "rendition request": Download-hnappurinn á safninu notar þetta flæði
// og það er opið nafnlausum þó bein GET á ORIGINAL skili 404 — POST á
// /fotoweb/services/renditions gefur 202 + Location á background-task sem
// skilar fullu skránni (t.d. 9933px TIF) þegar hún er tilbúin.
async function tryRenditionRequest(base: string, renditionHref: string, filename: string) {
  const res = await fetch(`${base}/fotoweb/services/renditions`, {
    method: "POST",
    headers: {
      "content-type": "application/vnd.fotoware.rendition-request+json",
      accept: "application/vnd.fotoware.rendition-response+json",
    },
    body: JSON.stringify({ href: renditionHref }),
  });
  if (res.status !== 202 && res.status !== 200) return null;
  let location = res.headers.get("location");
  if (!location) {
    const body = (await res.json().catch(() => null)) as { href?: string } | null;
    location = body?.href ?? null;
  }
  if (!location) return null;
  const taskUrl = location.startsWith("http") ? location : base + location;
  for (let attempt = 0; attempt < 22; attempt++) {
    if (attempt) await sleep(1500);
    const file = await fetch(taskUrl, { redirect: "follow" });
    if (file.status === 200) {
      const type = file.headers.get("content-type") || "";
      if (/text\/html|json/i.test(type)) continue;
      const len = Number(file.headers.get("content-length") || 0);
      if (len > MAX_BYTES) throw new Error("too-large");
      return passThrough(file, filename);
    }
    if (file.status >= 400 && file.status !== 404) return null;
  }
  return null;
}

async function tryFetchFile(url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "";
  if (!OK_TYPES.test(type)) return null;
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("too-large");
  return res;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return bad(400, "url-breytu vantar");
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return bad(400, "Ógild slóð");
  }
  if (target.protocol !== "https:") return bad(400, "Aðeins https-slóðir");
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return bad(403, `Hýsillinn ${target.hostname} er ekki á leyfilistanum (skjalasafn.reykjavik.is)`);
  }

  try {
    // FotoWeb-permalink (…/<skrá>.info) → asset-JSON → besta rendition.
    if (target.pathname.endsWith(".info")) {
      const meta = await fetch(target.href, {
        headers: { accept: "application/vnd.fotoware.asset+json" },
        redirect: "follow",
      });
      if (!meta.ok) return bad(502, `Skjalasafnið svaraði ${meta.status} fyrir permalinkinn`);
      const asset = (await meta.json()) as FotowebAsset;
      const base = `${target.protocol}//${target.host}`;

      // JPEG (≈6000 px) á undan ORIGINAL TIF (≈10000 px / 70 MP).
      // Fullt TIF afþjappað í vafranum frysti innflutninginn á síma.
      for (const cand of fotowebDownloadOrder(asset, target.pathname)) {
        const href = cand.href.startsWith("http") ? cand.href : base + cand.href;
        if (cand.kind === "original") {
          try {
            const full = await tryRenditionRequest(base, cand.href, cand.name);
            if (full) return full;
          } catch (err) {
            if (err instanceof Error && err.message === "too-large") throw err;
          }
        }
        const res = await tryFetchFile(href);
        if (res) return passThrough(res, cand.name);
      }
      return bad(502, "Fann enga sækjanlega útgáfu af skránni á permalinkinum");
    }

    // Bein skráaslóð á leyfðum hýsli.
    const res = await tryFetchFile(target.href);
    if (!res) return bad(502, "Slóðin skilaði ekki mynd eða PDF");
    return passThrough(res, target.pathname.split("/").pop() || "teikning");
  } catch (err) {
    if (err instanceof Error && err.message === "too-large") {
      return bad(413, "Skráin er stærri en 80 MB");
    }
    return bad(502, "Gat ekki sótt af slóðinni");
  }
}
