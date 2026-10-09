/** Official ArtCraft Crafting Apps hosted in Kjarni from their GitHub web builds. */

export const ARTCRAFT_APPS = [
  {
    id: "photocraft",
    name: "PhotoCraft",
    role: "Myndvinnsla",
    desc: "Lög, grímur, stillingar og raunveruleg PSD-skjöl — opin uppspretta.",
    icon: "🖼️",
    status: "Snemm-alfa",
    version: "0.5.0",
    tag: "v0.5.0",
    zip: "photocraft-web-0.5.0.zip",
    sha256: "855da01e7ce518049c6f3a090f1218864f7b780811e340db409e5c3cef93cd6d",
    repo: "https://github.com/storytold/photocraft",
    site: "https://getartcraft.com/apps/photocraft",
    license: "MIT OR Apache-2.0",
  },
  {
    id: "vectorcraft",
    name: "VectorCraft",
    role: "Vektorteikning",
    desc: "Hraðvirk vektorteikning, endurskrifuð í Rust.",
    icon: "✏️",
    status: "Í þróun",
    version: "0.7.0",
    tag: "v0.7.0",
    zip: "vectorcraft-web-0.7.0.zip",
    sha256: "743399a836b82eedf6d1c96eeed89d1a1e1087a964b0ad7d3c8a5810326f999a",
    repo: "https://github.com/storytold/vectorcraft",
    site: "https://getartcraft.com/apps/vectorcraft",
    license: "MIT OR Apache-2.0",
  },
  {
    id: "filmcraft",
    name: "FilmCraft",
    role: "Myndbönd",
    desc: "Myndbandsvinnsla, litur og hljóð — endurbyggð frá grunni.",
    icon: "🎬",
    status: "Í þróun",
    version: "0.4.0",
    tag: "v0.4.0",
    zip: "filmcraft-web-0.4.0.zip",
    sha256: "0dec892acec8e65e2af0177e96f958877f50e2aea0f0e6385128322b679519d9",
    repo: "https://github.com/storytold/filmcraft",
    site: "https://getartcraft.com/apps/filmcraft",
    license: "MIT OR Apache-2.0",
  },
  {
    id: "lightcraft",
    name: "LightCraft",
    role: "Myndasafn",
    desc: "Myndasafn og RAW-framköllun sem keyrir á vélinni þinni.",
    icon: "📷",
    status: "Í þróun",
    version: "0.4.0",
    tag: "v0.4.0",
    zip: "lightcraft-web-0.4.0.zip",
    sha256: "1c0c0d760f290993903a1399f054900faa2aa410737aca0d43f16127ec9554af",
    repo: "https://github.com/storytold/lightcraft",
    site: "https://getartcraft.com/apps/lightcraft",
    license: "MIT OR Apache-2.0",
  },
  {
    id: "pdfcraft",
    name: "PdfCraft",
    role: "PDF-vinnuborð",
    desc: "Lesa, raða, sameina, kljúfa og læsa PDF-skjölum.",
    icon: "📄",
    status: "Snemm-alfa",
    version: "0.4.0",
    tag: "v0.4.0",
    zip: "pdfcraft-web-0.4.0.zip",
    sha256: "9fc19ab631e4a8c1889f227e01a1d9ff3e7a983a7b56ad4e56686d6b94b2bcbe",
    repo: "https://github.com/storytold/pdfcraft",
    site: "https://getartcraft.com/apps/pdfcraft",
    license: "MIT OR Apache-2.0",
  },
  {
    id: "effectcraft",
    name: "EffectCraft",
    role: "Hreyfimyndir",
    desc: "Hreyfimyndir og sjónbrellur, skrifaðar í hreinu Rust.",
    icon: "✨",
    status: "Í þróun",
    version: "0.6.0",
    tag: "v0.6.0",
    zip: "effectcraft-web-0.6.0.zip",
    sha256: "396e490f66dc94780fcafeea4a389b7b6202b8053165754d0b26a442e0ab245b",
    repo: "https://github.com/storytold/effectcraft",
    site: "https://getartcraft.com/apps/effectcraft",
    license: "MIT OR Apache-2.0",
  },
  {
    id: "designcraft",
    name: "DesignCraft",
    role: "Umbrot",
    desc: "Síðuhönnun og útgáfa, endurbyggð í hreinu Rust.",
    icon: "📰",
    status: "Í þróun",
    version: "0.4.0",
    tag: "v0.4.0",
    zip: "designcraft-web-0.4.0.zip",
    sha256: "9fb8b1416c16757e7f54b429d3fe29577cf838a8be1b64afd14e55574a02dfec",
    repo: "https://github.com/storytold/designcraft",
    site: "https://getartcraft.com/apps/designcraft",
    license: "MIT OR Apache-2.0",
  },
] as const;

export type ArtcraftApp = (typeof ARTCRAFT_APPS)[number];
export type ArtcraftAppId = ArtcraftApp["id"];

export const ARTCRAFT_APP_IDS: ArtcraftAppId[] = ARTCRAFT_APPS.map((app) => app.id);

export function isArtcraftAppId(id: string): id is ArtcraftAppId {
  return ARTCRAFT_APP_IDS.includes(id as ArtcraftAppId);
}

export function getArtcraftApp(id: string): ArtcraftApp | undefined {
  return ARTCRAFT_APPS.find((app) => app.id === id);
}

export function artcraftHubHref(): string {
  return "/kjarni/artcraft";
}

export function artcraftStudioHref(): string {
  return "/kjarni/artcraft/studio";
}

export function artcraftAppHref(id: ArtcraftAppId): string {
  return `/kjarni/artcraft/${id}`;
}

export function artcraftStaticPath(id: ArtcraftAppId): string {
  return `/artcraft/${id}/index.html`;
}

export function artcraftReleaseUrl(app: ArtcraftApp): string {
  return `${app.repo}/releases/download/${app.tag}/${app.zip}`;
}
