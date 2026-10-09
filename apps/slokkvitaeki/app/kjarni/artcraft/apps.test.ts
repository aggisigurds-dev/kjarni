import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTCRAFT_APPS,
  ARTCRAFT_APP_IDS,
  artcraftAppHref,
  artcraftReleaseUrl,
  artcraftStaticPath,
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

test("lookup rejects unknown slugs", () => {
  assert.equal(isArtcraftAppId("photocraft"), true);
  assert.equal(isArtcraftAppId("photoshop"), false);
  assert.equal(getArtcraftApp("missing"), undefined);
  assert.equal(getArtcraftApp("pdfcraft")?.name, "PdfCraft");
});
