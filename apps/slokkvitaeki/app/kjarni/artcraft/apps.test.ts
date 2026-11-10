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
  artcraftBakgrunnurHref,
  artcraftStudioHref,
  artcraftToolsHref,
  getArtcraftApp,
  isArtcraftAppId,
  isOfficecraftApp,
  OFFICECRAFT_APP_IDS,
  OFFICECRAFT_INTERFACES,
  officecraftHubHref,
} from "./apps.ts";

test("all thirteen Crafting Apps are installed in Kjarni", () => {
  assert.equal(ARTCRAFT_APPS.length, 13);
  assert.deepEqual(ARTCRAFT_APP_IDS, [
    "photocraft",
    "vectorcraft",
    "filmcraft",
    "lightcraft",
    "pdfcraft",
    "effectcraft",
    "designcraft",
    "figcraft",
    "wordcraft",
    "soundcraft",
    "deckcraft",
    "cadcraft",
    "gridcraft",
  ]);
});

test("each app has a pinned web zip, sha256 and kjarni route", () => {
  for (const app of ARTCRAFT_APPS) {
    assert.equal(app.zip, `${app.id}-web-${app.version}.zip`);
    assert.match(app.sha256, /^[0-9a-f]{64}$/);
    const suite = isOfficecraftApp(app.id) ? "officecraft" : "artcraft";
    assert.equal(artcraftAppHref(app.id), `/kjarni/${suite}/${app.id}`);
    assert.equal(artcraftStaticPath(app.id), `/artcraft/${app.id}/index.html`);
    assert.equal(
      artcraftReleaseUrl(app),
      `https://github.com/storytold/${app.id}/releases/download/${app.tag}/${app.zip}`,
    );
  }
});

test("private studio is a dedicated route, not a Crafting App", () => {
  assert.equal(artcraftStudioHref(), "/kjarni/artcraft/studio");
  assert.equal(artcraftToolsHref(), "/kjarni/artcraft/tol");
  assert.equal(artcraftBakgrunnurHref(), "/kjarni/artcraft/bakgrunnur");
  assert.equal(isArtcraftAppId("studio"), false);
  assert.equal(isArtcraftAppId("bakgrunnur"), false);
});

test("kjarni can open every ArtCraft interface from one list", () => {
  assert.deepEqual(
    ARTCRAFT_INTERFACES.map((item) => item.id),
    [
      "hub",
      "vinnslur",
      "photocraft",
      "filmcraft",
      "lightcraft",
      "effectcraft",
      "designcraft",
      "tol",
      "bakgrunnur",
      "svidsmynd",
      "fjarlaegjahlut",
      "andlitsfegrun",
      "himinn",
      "studio",
      "kastljos",
      "vidgerd",
      "mota",
      "likami",
      "comfy",
      "hreyfimynd",
      "skyjastudio",
      "skyjahreyfimynd",
      "video-upplyfting",
      "myndband-andlit",
      "myndband-framhald",
      "myndband-saumur",
      "myndband-portret-andlit",
      "upplyfting",
      "breyta",
      "tonsmid",
      "tonklippa",
      "endurljos",
      "innblastur",
      "andlit",
      "dypt",
      "litun",
      "utvikka",
      "leidarvisir",
    ],
  );
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft"), "hub");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/"), "hub");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/photocraft"), "photocraft");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/tol"), "tol");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/bakgrunnur"), "bakgrunnur");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/studio?x=1"), "studio");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/hreyfimynd"), "hreyfimynd");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/skyjastudio"), "skyjastudio");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/skyjahreyfimynd"), "skyjahreyfimynd");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/upplyfting"), "upplyfting");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/breyta"), "breyta");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/tonsmid"), "tonsmid");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/tonklippa"), "tonklippa");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/vinnslur"), "vinnslur");
  assert.equal(artcraftInterfaceFromPath("/kjarni/artcraft/missing"), "hub");
});

test("lookup rejects unknown slugs", () => {
  assert.equal(isArtcraftAppId("photocraft"), true);
  assert.equal(isArtcraftAppId("photoshop"), false);
  assert.equal(getArtcraftApp("missing"), undefined);
  assert.equal(getArtcraftApp("pdfcraft")?.name, "PdfCraft");
});

test("office apps live in OfficeCraft, not ArtCraft", () => {
  assert.equal(officecraftHubHref(), "/kjarni/officecraft");
  assert.deepEqual(
    [...OFFICECRAFT_APP_IDS].sort(),
    ["cadcraft", "deckcraft", "figcraft", "gridcraft", "pdfcraft", "soundcraft", "vectorcraft", "wordcraft"],
  );
  assert.deepEqual(
    OFFICECRAFT_INTERFACES.map((i) => i.href),
    OFFICECRAFT_APP_IDS.map((id) => `/kjarni/officecraft/${id}`),
  );
  const artIds = new Set(ARTCRAFT_INTERFACES.map((i) => i.id as string));
  for (const id of OFFICECRAFT_APP_IDS) assert.equal(artIds.has(id), false, `${id} not in ArtCraft`);
  // Hvert opið forrit er á nákvæmlega einum stað.
  assert.equal(
    ARTCRAFT_APP_IDS.filter((id) => !isOfficecraftApp(id)).length + OFFICECRAFT_APP_IDS.length,
    ARTCRAFT_APP_IDS.length,
  );
});

test("Stjórnstöð menu: OfficeCraft and Ajour-Craft groups, no office apps under ArtCraft", async () => {
  const { QUICK_GROUPS } = await import("../data.ts");
  const { SYSTEMS } = await import("../stod-gogn.ts");
  const group = (t: string) => QUICK_GROUPS.find((g) => g.title === t);
  assert.deepEqual(
    group("Ajour-Craft")?.items.slice(0, 2).map((i) => i.label),
    ["Skráning", "Yfirsýn þéttinga"],
  );
  assert.equal(group("OfficeCraft")?.items.length, OFFICECRAFT_APP_IDS.length);
  const artLabels = group("ArtCraft")?.items.map((i) => i.label) ?? [];
  for (const id of OFFICECRAFT_APP_IDS) assert.equal(artLabels.includes(getArtcraftApp(id)!.name), false);
  assert.equal(artLabels.includes("Skráning"), false);
  assert.equal(artLabels.includes("Yfirsýn þéttinga"), false);
  const names = SYSTEMS.map((s) => s.name);
  assert.ok(names.indexOf("OfficeCraft") === names.indexOf("Marks") + 1, "OfficeCraft right after Marks");
  assert.ok(names.includes("Ajour-Craft"));
  assert.ok(names.includes("Bakgrunnur"));
  assert.ok(group("Kjarni")?.items.some((i) => i.label === "Bakgrunnur"));
  assert.equal(artLabels.includes("Bakgrunnur"), false);
});
