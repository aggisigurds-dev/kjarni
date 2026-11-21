import assert from "node:assert/strict";
import { test } from "node:test";
import { ARTCRAFT_APPS } from "./apps.ts";
import {
  ARTCRAFT_LAUNCHER,
  artcraftNativePacks,
  artcraftNativeUrl,
  artcraftSumsUrl,
} from "./natives.ts";

test("every Crafting App has macOS, Windows and Linux desktop packs on its own tag", () => {
  for (const app of ARTCRAFT_APPS) {
    const packs = artcraftNativePacks(app);
    assert.deepEqual(
      packs.map((p) => p.id),
      ["macos", "windows", "linux-appimage", "linux-tar"],
    );
    for (const pack of packs) {
      assert.equal(
        artcraftNativeUrl(app.repo, app.tag, pack.file),
        `${app.repo}/releases/download/${app.tag}/${pack.file}`,
      );
      assert.match(pack.file, new RegExp(`^${app.id}-${app.version}-`));
    }
    assert.equal(
      artcraftSumsUrl(app.repo, app.tag),
      `${app.repo}/releases/download/${app.tag}/SHA256SUMS.txt`,
    );
  }
});

test("web catalogs are the current GitHub web zips, not the old 0.1x pins", () => {
  const want: Record<string, string> = {
    photocraft: "0.23.1",
    vectorcraft: "0.24.1",
    filmcraft: "0.20.1",
    lightcraft: "0.21.1",
    pdfcraft: "0.21.1",
    effectcraft: "0.24.1",
    designcraft: "0.20.1",
    figcraft: "0.18.1",
    wordcraft: "0.18.1",
    soundcraft: "0.20.1",
    deckcraft: "0.18.1",
    cadcraft: "0.20.1",
    gridcraft: "0.19.1",
    "craft-anything": "0.6.1",
  };
  for (const app of ARTCRAFT_APPS) {
    assert.equal(app.version, want[app.id], app.id);
    assert.equal(app.zip, `${app.id}-web-${app.version}.zip`);
    assert.match(app.sha256, /^[0-9a-f]{64}$/);
  }
});

test("ArtCraft Launcher points at the official 0.41.1 installers", () => {
  assert.equal(ARTCRAFT_LAUNCHER.version, "0.41.1");
  assert.equal(ARTCRAFT_LAUNCHER.tag, "artcraft-v0.41.1");
  assert.deepEqual(
    ARTCRAFT_LAUNCHER.packs.map((p) => p.file),
    [
      "ArtCraft_0.41.1_universal.dmg",
      "ArtCraft_0.41.1_x64_en-US.msi",
      "artcraft-0.41.1-linux-x86_64.AppImage",
    ],
  );
  for (const pack of ARTCRAFT_LAUNCHER.packs) {
    assert.equal(
      artcraftNativeUrl(ARTCRAFT_LAUNCHER.repo, ARTCRAFT_LAUNCHER.tag, pack.file),
      `https://github.com/storytold/artcraft/releases/download/artcraft-v0.41.1/${pack.file}`,
    );
  }
});
