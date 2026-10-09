import assert from "node:assert/strict";
import { test } from "node:test";
import { artcraftBakgrunnurHref, artcraftToolsHref } from "./apps.ts";
import { AUTO_TOOLS, artcraftBakgrunnurWhiteHref } from "./tol.ts";

test("auto tools live on their own Kjarni page", () => {
  assert.equal(artcraftToolsHref(), "/kjarni/artcraft/tol");
  assert.equal(artcraftBakgrunnurHref(), "/kjarni/artcraft/bakgrunnur");
  assert.equal(artcraftBakgrunnurWhiteHref(), "/kjarni/artcraft/bakgrunnur?botn=hvitt");
  assert.deepEqual(
    AUTO_TOOLS.map((tool) => tool.id),
    ["bakgrunnur", "hvitt", "studio"],
  );
  assert.equal(AUTO_TOOLS.every((tool) => tool.href.startsWith("/kjarni/artcraft/")), true);
});
