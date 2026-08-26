import { NextRequest, NextResponse } from "next/server";

// Proxy fyrir TurboPaint: sækir gólfplan af leyfðum ytri slóðum (CORS bannar
// vafranum að gera það sjálfur). Skilur FotoWeb-permalink skjalasafns
// Reykjavíkur (…/<skrá>.tif.info): les asset-JSON og velur bestu rendition
// sem er opin nafnlausum — ORIGINAL ef hún svarar, annars stærsta
// quickRendition (cache-JPEG, t.d. 6006px). Beinar skráaslóðir á leyfðum
// hýslum streymast óbreyttar.

export const maxDuration = 60;

const ALLOWED_HOSTS = new Set(["skjalasafn.reykjavik.is"]);
const MAX_BYTES = 80 * 1024 * 1024;
const OK_TYPES = /^(image\/|application\/pdf)/i;

type FotowebAsset = {
  filename?: string;
  renditions?: { href?: string; original?: boolean; width?: number; height?: number }[];
  quickRenditions?: { href?: string; size?: number }[];
};

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function passThrough(upstream: Response, filename: string) {
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "application/octet-stream");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);
  headers.set("x-plan-filename", encodeURIComponent(filename));
  headers.set("cache-control", "public, max-age=3600");
  return new Response(upstream.body, { status: 200, headers });
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
      const baseName = (asset.filename || target.pathname.split("/").pop() || "teikning")
        .replace(/\.info$/i, "");

      const candidates: { href: string; name: string }[] = [];
      const original = asset.renditions?.find((r) => r.original && r.href);
      if (original?.href) candidates.push({ href: original.href, name: baseName });
      const quick = [...(asset.quickRenditions ?? [])]
        .filter((q) => q.href)
        .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      for (const q of quick) candidates.push({ href: q.href as string, name: `${baseName}.jpg` });

      for (const cand of candidates) {
        const href = cand.href.startsWith("http") ? cand.href : base + cand.href;
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
