import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CRAFT_ANYTHING_NATIVE,
  CRAFT_ANYTHING_TAG,
  craftAnythingNativeUrl,
  craftAnythingSumsUrl,
} from "./downloads.ts";

test("native downloads are the official 0.6.1 desktop and CLI builds", () => {
  assert.equal(CRAFT_ANYTHING_TAG, "v0.6.1");
  assert.equal(CRAFT_ANYTHING_NATIVE.length, 5);
  const ids = CRAFT_ANYTHING_NATIVE.map((d) => d.id);
  assert.deepEqual(ids, ["macos", "windows", "linux-appimage", "linux-tar", "cli-macos"]);
  for (const pack of CRAFT_ANYTHING_NATIVE) {
    assert.match(pack.sha256, /^[0-9a-f]{64}$/);
    assert.match(pack.file, /^craft-anything/);
    assert.equal(
      craftAnythingNativeUrl(pack.file),
      `https://github.com/storytold/craft-anything/releases/download/v0.6.1/${pack.file}`,
    );
  }
  assert.equal(
    craftAnythingSumsUrl(),
    "https://github.com/storytold/craft-anything/releases/download/v0.6.1/SHA256SUMS.txt",
  );
});
