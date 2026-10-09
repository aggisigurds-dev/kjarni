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

function parseApps(source) {
  const blocks = [...source.matchAll(/\{\s*id:\s*"([^"]+)"([\s\S]*?)\n\s*\},?/g)];
  return blocks.map((block) => {
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

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, bytes);
  return bytes.length;
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
    return;
  }
  const url = `${app.repo}/releases/download/${app.tag}/${app.zip}`;
  const zip = path.join(tmp, app.zip);
  console.log(`artcraft: downloading ${app.zip}`);
  await download(url, zip);
  const digest = sha256File(zip);
  if (digest !== app.sha256) {
    throw new Error(`${app.zip} sha256 mismatch\n expected ${app.sha256}\n      got ${digest}`);
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
}

async function main() {
  if (!existsSync(APPS_PATH)) throw new Error(`missing ${APPS_PATH}`);
  const apps = parseApps(readFileSync(APPS_PATH, "utf8"));
  if (apps.length !== 7) throw new Error(`expected 7 apps, got ${apps.length}`);
  mkdirSync(DEST, { recursive: true });
  const tmp = path.join(os.tmpdir(), `kjarni-artcraft-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  try {
    await Promise.all(apps.map((app) => installOne(app, tmp)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
