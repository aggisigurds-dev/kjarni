import assert from "node:assert/strict";
import { test } from "node:test";
import {
  erSkonnudTif,
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

test("a PDF drawing downloads the vector original before the 6006 px JPEG", () => {
  const asset: FotowebAsset = {
    filename: "2023-11-2843348.pdf",
    renditions: [{ original: true, width: 3368, height: 4768, href: "/x.pdf.info/__renditions/ORIGINAL" }],
    quickRenditions: [
      { size: 6006, width: 4242, height: 6006, href: "/cache/6006.jpg" },
      { size: 2400, width: 1695, height: 2400, href: "/cache/2400.jpg" },
      { size: 800, width: 565, height: 800, href: "/cache/800.jpg" },
    ],
  };
  const order = fotowebDownloadOrder(asset, "/archives/2023-11-2843348.pdf.info");
  assert.equal(order[0]?.kind, "original");
  assert.equal(order[0]?.name, "2023-11-2843348.pdf");
  assert.equal(order[1]?.kind, "jpeg");
  assert.equal(order[1]?.name, "2023-11-2843348.jpg");
  assert.ok(order[1]?.href.includes("6006.jpg"));
  assert.equal(order.filter((c) => c.kind === "original").length, 1);
});

test("prefer=image keeps the JPEG first even for a PDF drawing", () => {
  const asset: FotowebAsset = {
    filename: "2023-11-2843348.pdf",
    renditions: [{ original: true, href: "/x.pdf.info/__renditions/ORIGINAL" }],
    quickRenditions: [{ size: 6006, width: 4242, height: 6006, href: "/cache/6006.jpg" }],
  };
  const order = fotowebDownloadOrder(asset, "/archives/2023-11-2843348.pdf.info", { preferImage: true });
  assert.equal(order[0]?.kind, "jpeg");
  assert.ok(order[0]?.href.includes("6006.jpg"));
  assert.equal(order[1]?.kind, "original");
});

test("a scanned PDF (large file) keeps the JPEG first — rasterising it made a 63 MB PNG", () => {
  const asset: FotowebAsset = {
    filename: "2022-10-1139929.pdf",
    filesize: 10466028,
    renditions: [{ original: true, href: "/x.pdf.info/__renditions/ORIGINAL" }],
    quickRenditions: [{ size: 6006, width: 6006, height: 4295, href: "/cache/6006.jpg" }],
  };
  const order = fotowebDownloadOrder(asset, "/archives/2022-10-1139929.pdf.info");
  assert.equal(order[0]?.kind, "jpeg");
  assert.equal(order[order.length - 1]?.kind, "original");
  // Lítill vigur heldur PDF-forgangi.
  const vigur = fotowebDownloadOrder({ ...asset, filesize: 417934 }, "/archives/x.pdf.info");
  assert.equal(vigur[0]?.kind, "original");
});

test("preferOriginal (Há gæði í leit) puts the 9k original TIF first, cache JPEG only as fallback", () => {
  const order = fotowebDownloadOrder(SKUTUVOGUR, "/archives/2021-01-2631662.tif.info", { preferOriginal: true });
  assert.equal(order[0]?.kind, "original");
  assert.equal(order[0]?.name, "2021-01-2631662.tif");
  assert.equal(order[1]?.kind, "jpeg");
  assert.equal(order[1]?.href, "/fotoweb/cache/v2/6006.jpg");
  assert.equal(order.filter((c) => c.kind === "original").length, 1);
});

test("preferOriginal also takes a scanned PDF original before the cache JPEG", () => {
  const scan: FotowebAsset = {
    filename: "2022-10-1139928.pdf",
    filesize: 10_289_152,
    renditions: [{ original: true, href: "/fotoweb/archives/x/2022-10-1139928.pdf.info/__renditions/ORIGINAL" }],
    quickRenditions: [{ size: 6006, width: 6006, height: 4297, href: "/fotoweb/cache/v2/scan6006.jpg" }],
  };
  const order = fotowebDownloadOrder(scan, "/archives/2022-10-1139928.pdf.info", { preferOriginal: true });
  assert.deepEqual(order.map((c) => c.kind), ["original", "jpeg"]);
  // án preferOriginal helst gamla röðin: skannað PDF → JPEG fyrst
  assert.equal(fotowebDownloadOrder(scan, "/archives/2022-10-1139928.pdf.info")[0]?.kind, "jpeg");
});

// Center Hótel Þingholt, kjallari: 7016 × 4961 TIF (Orientation 3, litaspjald) — JPEG skjalasafnsins 6006 × 4251.
const THINGHOLT: FotowebAsset = {
  filename: "2014-06-2461_3.tif",
  renditions: [{ original: true, width: 7016, height: 4961, href: "/fotoweb/archives/x/2014-06-2461_3.tif.info/__renditions/ORIGINAL" }],
  quickRenditions: [
    { size: 6006, width: 6006, height: 4251, href: "/fotoweb/cache/v2/thingholt6006.jpg" },
    { size: 2400, width: 2400, height: 1699, href: "/fotoweb/cache/v2/thingholt2400.jpg" },
  ],
};

test("skönnun: prefer=tif skilar TIF-frumritinu EINU — aldrei JPEG í staðinn", () => {
  const order = fotowebDownloadOrder(THINGHOLT, "/archives/2014-06-2461_3.tif.info", { preferTif: true });
  assert.deepEqual(order, [{ href: THINGHOLT.renditions![0].href, name: "2014-06-2461_3.tif", kind: "original" }]);
  // PDF eða asset án frumrits: ekkert (fetch-plan svarar 415)
  assert.deepEqual(fotowebDownloadOrder({ filename: "x.pdf", renditions: [{ original: true, href: "/o" }] }, "/x.pdf.info", { preferTif: true }), []);
  assert.deepEqual(fotowebDownloadOrder({ filename: "x.tif", quickRenditions: [{ size: 6006, href: "/j" }] }, "/x.tif.info", { preferTif: true }), []);
});

test("skönnun: JPEG skjalasafnsins er áfram viðmiðið — sjálfgefið og prefer=image (teikn-mynd) halda JPEG fremst", () => {
  // Teikning-glugginn vistar merkin í dílum þessa JPEG (teikn-mynd → fetch-plan?prefer=image) — má aldrei víkja fyrir TIF
  const mynd = fotowebDownloadOrder(THINGHOLT, "/archives/2014-06-2461_3.tif.info", { preferImage: true });
  assert.equal(mynd[0]?.kind, "jpeg");
  assert.ok(mynd[0]?.href.includes("thingholt6006.jpg"));
  assert.equal(fotowebDownloadOrder(THINGHOLT, "/archives/2014-06-2461_3.tif.info")[0]?.kind, "jpeg");
  assert.equal(erSkonnudTif(THINGHOLT, "/x"), true);
  assert.equal(erSkonnudTif({ filename: "a.pdf" }, "/a.pdf.info"), false);
  assert.equal(erSkonnudTif({}, "/archives/b.tiff.info"), true);
});
