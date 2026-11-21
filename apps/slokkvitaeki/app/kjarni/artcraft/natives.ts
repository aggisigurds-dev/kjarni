/** Official desktop / CLI builds from each Crafting App GitHub release.
 *  The WASM zip in public/artcraft is the in-browser viewer only.
 *  Native packages stay on GitHub — Kjarni does not host 60–270 MB binaries. */

export type ArtcraftNativePack = {
  id: "macos" | "windows" | "linux-appimage" | "linux-tar";
  label: string;
  hint: string;
  file: string;
};

export function artcraftNativePacks(app: { id: string; version: string }): ArtcraftNativePack[] {
  const { id, version } = app;
  return [
    {
      id: "macos",
      label: "macOS",
      hint: "Disk image, Apple silicon og Intel",
      file: `${id}-${version}-macos-universal.dmg`,
    },
    {
      id: "windows",
      label: "Windows",
      hint: "Uppsetning, 64-bita Windows 10 og 11",
      file: `${id}-${version}-windows-x64.msi`,
    },
    {
      id: "linux-appimage",
      label: "Linux AppImage",
      hint: "Öll distro, x86_64 — merktu keyranlegt og keyrðu",
      file: `${id}-${version}-linux-x86_64.AppImage`,
    },
    {
      id: "linux-tar",
      label: "Linux tar",
      hint: "Forrit + CLI, x86_64 — afþjappa og keyra",
      file: `${id}-${version}-linux-x86_64.tar.gz`,
    },
  ];
}

export function artcraftNativeUrl(repo: string, tag: string, file: string): string {
  return `${repo}/releases/download/${tag}/${file}`;
}

export function artcraftSumsUrl(repo: string, tag: string): string {
  return artcraftNativeUrl(repo, tag, "SHA256SUMS.txt");
}

/** ArtCraft Launcher 0.41.1 — one installer that opens and updates every Crafting App. */
export const ARTCRAFT_LAUNCHER = {
  name: "ArtCraft Launcher",
  version: "0.41.1",
  tag: "artcraft-v0.41.1",
  repo: "https://github.com/storytold/artcraft",
  site: "https://getartcraft.com",
  desc: "Eitt forrit sem opnar og uppfærir öll Crafting Apps á vélinni.",
  packs: [
    {
      id: "macos",
      label: "macOS",
      hint: "Disk image, Apple silicon og Intel",
      file: "ArtCraft_0.41.1_universal.dmg",
    },
    {
      id: "windows",
      label: "Windows",
      hint: "Uppsetning, 64-bita Windows 10 og 11",
      file: "ArtCraft_0.41.1_x64_en-US.msi",
    },
    {
      id: "linux-appimage",
      label: "Linux AppImage",
      hint: "Öll distro, x86_64 — merktu keyranlegt og keyrðu",
      file: "artcraft-0.41.1-linux-x86_64.AppImage",
    },
  ],
} as const;
