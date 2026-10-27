import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_VIDGERD_URL, enhancePhoto, normalizeVidgerdUrl, pingVidgerd } from "./server.ts";

test("normalizes local server URLs", () => {
  assert.equal(normalizeVidgerdUrl(""), DEFAULT_VIDGERD_URL);
  assert.equal(normalizeVidgerdUrl("http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
  assert.equal(normalizeVidgerdUrl("http://localhost:9000"), "http://localhost:9000");
  assert.throws(() => normalizeVidgerdUrl("ftp://x"), /http/);
});

test("ping reports a down local server", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;
  try {
    const result = await pingVidgerd("http://127.0.0.1:8787");
    assert.equal(result.ok, false);
  } finally {
    globalThis.fetch = prev;
  }
});

test("ping reports an up local server", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
  try {
    const result = await pingVidgerd("http://127.0.0.1:8787");
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = prev;
  }
});

test("enhancePhoto posts form data and returns the result blob", async () => {
  const prev = globalThis.fetch;
  let capturedUrl = "";
  let capturedForm: FormData | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedForm = init?.body as FormData;
    return new Response(new Blob(["jpeg-bytes"]), { status: 200 });
  }) as typeof fetch;
  try {
    const file = new Blob(["fake-image"], { type: "image/jpeg" });
    const result = await enhancePhoto("http://127.0.0.1:8787", file, {
      face: true,
      redeye: true,
      texture: false,
    });
    assert.equal(capturedUrl, "http://127.0.0.1:8787/enhance");
    assert.equal(capturedForm?.get("face"), "true");
    assert.equal(capturedForm?.get("redeye"), "true");
    assert.equal(capturedForm?.get("texture"), "false");
    assert.ok(result instanceof Blob);
  } finally {
    globalThis.fetch = prev;
  }
});

test("enhancePhoto surfaces the server's error message", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Gat ekki lesið myndina" }), { status: 400 })) as typeof fetch;
  try {
    const file = new Blob(["fake-image"], { type: "image/jpeg" });
    await assert.rejects(
      enhancePhoto("http://127.0.0.1:8787", file, { face: true, redeye: false, texture: false }),
      /Gat ekki lesið myndina/,
    );
  } finally {
    globalThis.fetch = prev;
  }
});
