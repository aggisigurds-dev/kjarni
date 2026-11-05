import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { download } from "./install-artcraft.mjs";

function fakeFetch(steps) {
  let i = 0;
  const fn = async () => {
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step === "net") throw new TypeError("fetch failed");
    return new Response(step === 200 ? "zipbytes" : "err", { status: step });
  };
  fn.calls = () => i;
  return fn;
}

test("transient GitHub 504s are retried with growing waits, then succeed", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ac-dl-"));
  try {
    const waits = [];
    const f = fakeFetch([504, 504, 200]);
    const n = await download("https://x/a.zip", path.join(dir, "a.zip"), { fetchImpl: f, wait: async (ms) => waits.push(ms) });
    assert.equal(n, 8);
    assert.equal(readFileSync(path.join(dir, "a.zip"), "utf8"), "zipbytes");
    assert.deepEqual(waits, [2000, 4000]);
    assert.equal(f.calls(), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("network errors and 429 are retried too", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ac-dl-"));
  try {
    const f = fakeFetch(["net", 429, 200]);
    await download("https://x/b.zip", path.join(dir, "b.zip"), { fetchImpl: f, wait: async () => {} });
    assert.equal(f.calls(), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("404 fails at once; a lasting 504 fails after the last attempt", async () => {
  const f404 = fakeFetch([404]);
  await assert.rejects(download("https://x/c.zip", "/nonexistent/c.zip", { fetchImpl: f404, wait: async () => {} }), /→ 404/);
  assert.equal(f404.calls(), 1);
  const waits = [];
  const f504 = fakeFetch([504]);
  await assert.rejects(download("https://x/d.zip", "/nonexistent/d.zip", { fetchImpl: f504, wait: async (ms) => waits.push(ms) }), /→ 504/);
  assert.equal(f504.calls(), 4);
  assert.deepEqual(waits, [2000, 4000, 8000]);
});
