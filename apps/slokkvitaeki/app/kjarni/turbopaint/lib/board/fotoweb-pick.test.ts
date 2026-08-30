import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOTOWEB_BOARD_JPEG_MIN,
  fotowebBaseName,
  fotowebDownloadOrder,
  type FotowebAsset,
} from "../../../../api/turbopaint/fotoweb-pick";

const SKUTUVOGUR: FotowebAsset = {
  filename: "2021-01-2631662.tif",
  renditions: [
    {
      original: true,
      width: 9933,
      height: 7081,
      href: "/fotoweb/archives/x/2021-01-2631662.tif.info/__renditions/ORIGINAL",
    },
  ],
  quickRenditions: [
    { size: 6006, width: 6006, height: 4282, href: "/fotoweb/cache/v2/6006.jpg" },
    { size: 800, width: 800, height: 570, href: "/fotoweb/cache/v2/800.jpg" },
    { size: 2400, width: 2400, height: 1711, href: "/fotoweb/cache/v2/2400.jpg" },
  ],
};

test("board download prefers the 6006 px cache JPEG over the 9k original TIF", () => {
  const order = fotowebDownloadOrder(SKUTUVOGUR, "/archives/2021-01-2631662.tif.info");
  assert.equal(order[0]?.kind, "jpeg");
  assert.equal(order[0]?.name, "2021-01-2631662.jpg");
  assert.ok(order[0]?.href.includes("6006.jpg"));
  assert.equal(order[1]?.kind, "jpeg");
  assert.ok(order[1]?.href.includes("2400.jpg"));
  const original = order.find((c) => c.kind === "original");
  assert.ok(original);
  assert.ok(order.indexOf(original) > 1);
  assert.equal(FOTOWEB_BOARD_JPEG_MIN, 2400);
});

test("falls back to original TIF when FotoWeb has no large JPEG", () => {
  const asset: FotowebAsset = {
    filename: "plan.tif",
    renditions: [{ original: true, href: "/ORIGINAL" }],
    quickRenditions: [{ width: 800, href: "/tiny.jpg" }],
  };
  const order = fotowebDownloadOrder(asset, "/plan.tif.info");
  assert.equal(order[0]?.kind, "original");
  assert.equal(order[0]?.href, "/ORIGINAL");
  assert.equal(order[1]?.kind, "jpeg");
});

test("strips .info from the FotoWeb filename", () => {
  assert.equal(fotowebBaseName({ filename: "a.tif.info" }, "/x"), "a.tif");
});
