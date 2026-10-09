import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTCRAFT_APPS,
  ARTCRAFT_APP_IDS,
  ARTCRAFT_INTERFACES,
  artcraftAppHref,
  artcraftInterfaceFromPath,
  artcraftReleaseUrl,
  artcraftStaticPath,
  artcraftStudioHref,
  getArtcraftApp,
  isArtcraftAppId,
} from "./apps.ts";

test("all seven Crafting Apps are installed in Kjarni", () => {
  assert.equal(ARTCRAFT_APPS.length, 7);
  assert.deepEqual(ARTCRAFT_APP_IDS, [
    "photocraft",
    "vectorcraft",
    "filmcraft",
    "lightcraft",
    "pdfcraft",
    "effectcraft",
    "designcraft",
  ]);
});

test("each app has a pinned web zip, sha256 and kjarni route", () => {
  for (const app of ARTCRAFT_APPS) {
    assert.equal(app.zip, `${app.id}-web-${app.version}.zip`);
    assert.match(app.sha256, /^[0-9a-f]{64}$/);
    assert.equal(artcraftAppHref(app.id), `/kjarni/artcraft/${app.id}`);
    assert.equal(artcraftStaticPath(app.id), `/artcraft/${app.id}/index.html`);
    assert.equal(
      artcraftReleaseUrl(app),
      `https://github.com/storytold/${app.id}/releases/download/${app.tag}/${app.zip}`,
    );
  }
});

test("private studio is a dedicated route, not a Crafting App", () => {
  assert.equal(artcraftStudioHref(), "/kjarni/artcraft/studio");
  assert.equal(isArtcraftAppId("studio"), false);
});

test("kjarni can open every ArtCraft interface from one list", () => {
  assert.deepEqual(
    ARTCRAFT_INTERFACES.map((item) => item.id),
    ["hub", ...ARTCRAFT_APP_IDS, "studio"],
  );
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft"), "hub");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/"), "hub");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/photocraft"), "photocraft");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/studio?x=1"), "studio");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/missing"), "hub");
});

test("lookup rejects unknown slugs", () => {
  assert.equal(isArtcraftAppId("photocraft"), true);
  assert.equal(isArtcraftAppId("photoshop"), false);
  assert.equal(getArtcraftApp("missing"), undefined);
  assert.equal(getArtcraftApp("pdfcraft")?.name, "PdfCraft");
});
