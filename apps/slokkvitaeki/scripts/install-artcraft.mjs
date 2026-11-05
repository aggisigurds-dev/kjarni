#!/usr/bin/env node
/**
 * Fetch official ArtCraft web (WASM) builds into public/artcraft/<id>/.
 * Binaries stay out of git; Vercel runs this on `prebuild`.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "public", "artcraft");
const APPS_PATH = path.join(ROOT, "app/kjarni/artcraft/apps.ts");
// Zip-skrárnar geymdar í byggingarskyndiminni Next/Vercel (.next/cache er
// endurheimt fyrir hverja byggingu), svo næsta bygging þurfi ekki GitHub.
const ZIP_CACHE = path.join(ROOT, ".next", "cache", "artcraft-zips");
// Strangt = niðurhalsvilla fellir bygginguna. Sjálfgefið strangt í production
// (Vercel heldur þá fyrri, heilu útgáfunni í loftinu í stað þess að birta vef án
// forrits) en ekki í forsýnum (þar er forritinu sleppt). ARTCRAFT_STRICT=1/0 ræður.
export function isStrict(env = process.env) {
  if (env.ARTCRAFT_STRICT === "1") return true;
  if (env.ARTCRAFT_STRICT === "0") return false;
  return env.VERCEL_ENV === "production";
}
const STRICT = isStrict();

function parseApps(source) {
  const blocks = [...source.matchAll(/\{\s*id:\s*"([^"]+)"([\s\S]*?)\n\s*\},?/g)];
  // Aðeins uppsetjanleg öpp (með útgáfumerki): leiðsagnarfærslur eins og { id: "hub" } og { id: "studio" } í
  // ARTCRAFT_NAV hafa ekkert tag og eiga ekki heima hér (#183 braut bygginguna: „hub missing tag").
  return blocks.filter((block) => /\btag:\s*"/.test(block[2])).map((block) => {
    const id = block[1];
    const body = block[2];
    const field = (name) => {
      const match = body.match(new RegExp(`${name}:\\s*"([^"]+)"`));
      if (!match) throw new Error(`${id} missing ${name}`);
      return match[1];
    };
    return {
      id,
      tag: field("tag"),
      zip: field("zip"),
      sha256: field("sha256"),
      repo: field("repo"),
    };
  });
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function lockPath(id) {
  return path.join(DEST, id, ".artcraft-lock");
}

function alreadyInstalled(app) {
  const file = lockPath(app.id);
  if (!existsSync(file) || !existsSync(path.join(DEST, app.id, "index.html"))) return false;
  const text = readFileSync(file, "utf8").trim();
  return text === `${app.id}\n${app.tag}\n${app.sha256}`;
}

function writeLock(app) {
  writeFileSync(lockPath(app.id), `${app.id}\n${app.tag}\n${app.sha256}\n`);
}

const RETRIES = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GitHub-útgáfur skila stöku sinnum 502/503/504 þegar 13 skrár eru sóttar í
 *  einu — ein slík felldi alla Vercel-bygginguna. Reynt aftur (2, 4, 8 s) við
 *  5xx, 429 og netvillur; 404 og aðrar 4xx-villur stöðva strax. */
export async function download(url, dest, { retries = RETRIES, wait = sleep, fetchImpl = fetch } = {}) {
  for (let attempt = 1; ; attempt++) {
    let status = 0;
    try {
      const res = await fetchImpl(url, { redirect: "follow" });
      status = res.status;
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        writeFileSync(dest, bytes);
        return bytes.length;
      }
      if (status < 500 && status !== 429) throw Object.assign(new Error(`GET ${url} → ${status}`), { fatal: true });
    } catch (err) {
      if (err && err.fatal) throw err;
      if (attempt >= retries) throw new Error(`GET ${url} → ${status || (err instanceof Error ? err.message : err)}`);
    }
    if (attempt >= retries) throw new Error(`GET ${url} → ${status}`);
    const ms = 2000 * 2 ** (attempt - 1);
    console.log(`artcraft: ${path.basename(dest)} → ${status || "netvilla"}, reyni aftur eftir ${ms / 1000} s (${attempt}/${retries - 1})`);
    await wait(ms);
  }
}

/** Keyrir `fn` á hvert stak, mest `limit` í einu. */
async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function unzip(zip, dest) {
  mkdirSync(dest, { recursive: true });
  const result = spawnSync("unzip", ["-q", "-o", zip, "-d", dest], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`unzip ${zip} failed: ${result.stderr || result.stdout}`);
  }
}

const CARGO_TARGET_DIRS = [
  "deps",
  "incremental",
  "build",
  "examples",
  ".fingerprint",
];

function flattenExtract(extractRoot, dest) {
  const listing = spawnSync("find", [extractRoot, "-mindepth", "1", "-maxdepth", "1"], {
    encoding: "utf8",
  });
  const entries = listing.stdout.trim().split("\n").filter(Boolean);
  const only = entries.length === 1 ? entries[0] : null;
  const from =
    only && existsSync(path.join(only, "index.html")) ? only : extractRoot;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  const moved = spawnSync("cp", ["-a", `${from}/.`, dest], { encoding: "utf8" });
  if (moved.status !== 0) throw new Error(moved.stderr || "copy failed");
  for (const name of CARGO_TARGET_DIRS) {
    rmSync(path.join(dest, name), { recursive: true, force: true });
  }
  for (const name of [".cargo-artifact-lock", ".cargo-build-lock", ".cargo-lock"]) {
    rmSync(path.join(dest, name), { force: true });
  }
}

async function installOne(app, tmp) {
  if (alreadyInstalled(app)) {
    console.log(`artcraft: ${app.id} ${app.tag} already present`);
    return { id: app.id };
  }
  const url = `${app.repo}/releases/download/${app.tag}/${app.zip}`;
  const cached = path.join(ZIP_CACHE, app.zip);
  let zip = path.join(tmp, app.zip);
  if (existsSync(cached) && sha256File(cached) === app.sha256) {
    console.log(`artcraft: ${app.zip} úr byggingarskyndiminni`);
    zip = cached;
  } else {
    console.log(`artcraft: downloading ${app.zip}`);
    try {
      await download(url, zip);
    } catch (err) {
      // GitHub-útgáfa ónáanleg (5xx/netvilla eftir endurtilraunir): ekki fella
      // allan Kjarnann fyrir eitt innfellt forrit — síðan sýnir „ekki uppsett“.
      if (STRICT || (err && err.fatal)) throw err;
      return { id: app.id, skipped: err instanceof Error ? err.message : String(err) };
    }
    const digest = sha256File(zip);
    if (digest !== app.sha256) {
      throw new Error(`${app.zip} sha256 mismatch\n expected ${app.sha256}\n      got ${digest}`);
    }
    try {
      mkdirSync(ZIP_CACHE, { recursive: true });
      writeFileSync(cached, readFileSync(zip));
    } catch {
      /* skyndiminni er valfrjálst */
    }
  }
  const extract = path.join(tmp, `${app.id}-extract`);
  rmSync(extract, { recursive: true, force: true });
  unzip(zip, extract);
  const dest = path.join(DEST, app.id);
  flattenExtract(extract, dest);
  if (!existsSync(path.join(dest, "index.html"))) {
    throw new Error(`${app.id} extract has no index.html`);
  }
  writeLock(app);
  console.log(`artcraft: installed ${app.id} ${app.tag}`);
  return { id: app.id };
}

async function main() {
  if (!existsSync(APPS_PATH)) throw new Error(`missing ${APPS_PATH}`);
  const apps = parseApps(readFileSync(APPS_PATH, "utf8"));
  if (apps.length !== 13) throw new Error(`expected 13 apps, got ${apps.length}`);
  mkdirSync(DEST, { recursive: true });
  const tmp = path.join(os.tmpdir(), `kjarni-artcraft-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const skipped = [];
  try {
    await mapLimit(apps, 4, async (app) => {
      const r = await installOne(app, tmp);
      if (r && r.skipped) skipped.push(r);
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  for (const s of skipped) {
    console.warn(`artcraft: ⚠ ${s.id} ekki sett upp (GitHub ónáanlegt: ${s.skipped}) — síðan sýnir „ekki uppsett“; næsta bygging reynir aftur.`);
  }
}

// Keyrt beint (prebuild / artcraft:install), ekki þegar prófið flytur inn `download`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
