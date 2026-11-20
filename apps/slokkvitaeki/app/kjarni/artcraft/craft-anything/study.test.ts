import assert from "node:assert/strict";
import { test } from "node:test";
import { craftHtml } from "./craft.ts";
import { extraStudyHosts, parseStudyUrl, sniffKind, studyBytes, studyHtml, studyJavascript } from "./study.ts";

test("parseStudyUrl allows company hosts and refuses SSRF", () => {
  assert.equal(parseStudyUrl("https://slokkvitaeki.netlify.app/gatt").ok, true);
  assert.equal(parseStudyUrl("https://evil.example/").ok, false);
  assert.equal(parseStudyUrl("http://slokkvitaeki.netlify.app/").ok, false);
  assert.equal(parseStudyUrl("https://127.0.0.1/").ok, false);
  assert.equal(parseStudyUrl("https://user:pass@kjarni.vercel.app/").ok, false);
  assert.equal(parseStudyUrl("https://kjarni.vercel.app", ["kjarni.vercel.app"]).ok, true);
  assert.deepEqual(extraStudyHosts("evil.com"), []);
  assert.deepEqual(extraStudyHosts("localhost:3000"), []);
  assert.ok(extraStudyHosts("kjarni.vercel.app").includes("kjarni.vercel.app"));
  const spoof = extraStudyHosts("evil.example");
  assert.deepEqual(spoof, []);
  assert.equal(parseStudyUrl("https://evil.example/", spoof).ok, false);
  const preview = extraStudyHosts("kjarni-git-foo.vercel.app");
  assert.deepEqual(preview, ["kjarni-git-foo.vercel.app"]);
  assert.equal(parseStudyUrl("https://kjarni-git-foo.vercel.app/kjarni", preview).ok, true);
});

test("studyHtml extracts visible structure, not just that it is HTML", () => {
  const html = `<!doctype html><html lang="is"><head>
    <title>Slökkvitæki</title>
    <meta name="description" content="Ársskoðun">
    <meta name="generator" content="Kjarni">
    <link rel="stylesheet" href="/theme.css">
    <script src="/_next/static/chunks/main.js"></script>
  </head><body>
    <nav><a href="/">Heim</a><a href="/gatt">Gátt</a></nav>
    <h1>Ársskoðun</h1><h2>Verð</h2>
    <form action="/senda"></form>
    <style>body{color:#102038;font-family:"Playfair Display"}</style>
    <script>window.__NEXT_DATA__={}</script>
  </body></html>`;
  const study = studyHtml(html, "index.html");
  assert.match(study.summary, /Slökkvitæki/);
  assert.ok(study.tech.includes("Next.js"));
  assert.deepEqual(study.nav, ["Heim", "Gátt"]);
  assert.ok(study.headings.includes("Ársskoðun"));
  assert.equal(study.forms, 1);
  assert.ok(study.colors.includes("#102038"));
  assert.ok(study.fonts.some((f) => /Playfair/i.test(f)));
  assert.ok(study.scripts.some((s) => "src" in s && s.src.includes("_next")));
});

test("javascript study counts functions and stack", () => {
  const js = studyJavascript("function a(){} const b = () => 1; webpackJsonp=[]; //# sourceMappingURL=a.js.map", "bundle.js");
  assert.ok(js.tech.includes("webpack"));
  assert.equal(js.facts.find((f) => f.label === "Föll / örvar")?.value, "2");
});

test("binary files are sent to the WASM pane, not parsed as text", () => {
  const wasm = studyBytes("app.wasm", Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
  assert.equal(wasm.kind, "binary");
  assert.equal(sniffKind("app.wasm", wasm && Uint8Array.from([0x00, 0x61, 0x73, 0x6d])), "binary");
  assert.match(wasm.summary, /tvíundar/);
});

test("craftHtml is a clean-room page: request text in, original scripts out", () => {
  const study = studyHtml(
    `<html><head><title>Dæmi</title><script src="https://evil.example/app.js"></script></head><body><nav><a>Bóka</a></nav><h1>Halló</h1></body></html>`,
  );
  const out = craftHtml(study, "Gerðu hausinn bláan");
  assert.match(out, /Gerðu hausinn bláan/);
  assert.match(out, /Bóka/);
  assert.doesNotMatch(out, /evil\.example/);
  assert.doesNotMatch(out, /<script/);
});
