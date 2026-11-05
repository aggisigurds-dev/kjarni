import assert from "node:assert/strict";
import { test } from "node:test";
import { isStudioMode, STUDIO_MODES, studioModeHint, studioModeOf } from "./modes.ts";

test("studio has still, video and person modes", () => {
  assert.deepEqual(
    STUDIO_MODES.map((m) => m.id),
    ["still", "video", "person"],
  );
  assert.deepEqual(
    STUDIO_MODES.map((m) => m.label),
    ["Stakar", "Videó", "Persóna"],
  );
  assert.equal(isStudioMode("video"), true);
  assert.equal(isStudioMode("mesh"), false);
  assert.equal(studioModeOf("video"), "video");
  assert.equal(studioModeOf("nope"), "still");
  assert.match(studioModeHint("still"), /mynd/);
  assert.match(studioModeHint("video"), /sömu ljósmynd/);
  assert.match(studioModeHint("person"), /Prófíll/);
});
