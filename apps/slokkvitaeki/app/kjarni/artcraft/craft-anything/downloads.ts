/** Official Craft Anything 0.6.1 desktop/CLI builds. The WASM zip is the web viewer only;
 *  Study → Build → Check (320 tools, MCP, Claude Code) is these native packages. */

export const CRAFT_ANYTHING_TAG = "v0.6.1";
export const CRAFT_ANYTHING_REPO = "https://github.com/storytold/craft-anything";

export const CRAFT_ANYTHING_NATIVE = [
  {
    id: "macos",
    label: "macOS",
    hint: "Disk image, Apple silicon og Intel",
    file: "craft-anything-0.6.1-macos-universal.dmg",
    sha256: "bbb777d221a4ffe693323c1b6e625f02e71bfa04d74d32a5d50c4542655ed664",
  },
  {
    id: "windows",
    label: "Windows",
    hint: "Uppsetning, 64-bita Windows 10 og 11",
    file: "craft-anything-0.6.1-windows-x64.msi",
    sha256: "e0d4daf96d657f98efda7348b20d399b183f2411cde00aea0116a685e6af2cdd",
  },
  {
    id: "linux-appimage",
    label: "Linux AppImage",
    hint: "Öll distro, x86_64 — merktu keyranlegt og keyrðu",
    file: "craft-anything-0.6.1-linux-x86_64.AppImage",
    sha256: "7eadde1d74ab42cc838862fe3f831e3cf3c9fa6ba5e2bf04e2824bbc47146134",
  },
  {
    id: "linux-tar",
    label: "Linux tar",
    hint: "Forrit + CLI, x86_64 — afþjappa og keyra",
    file: "craft-anything-0.6.1-linux-x86_64.tar.gz",
    sha256: "83ec0730c9117f399122b315c63ed4c3a8d31ac55bddd74cb8b33cd2f76ef704",
  },
  {
    id: "cli-macos",
    label: "CLI (macOS)",
    hint: "Skipanalína og MCP án borðtölvu-apps",
    file: "craft-anything-cli-0.6.1-macos-universal.zip",
    sha256: "ddbae05f52a5526e149f656b0b44cf73a60ad9ec0a33d718f330bf231b988c2f",
  },
] as const;

export type CraftAnythingNative = (typeof CRAFT_ANYTHING_NATIVE)[number];

export function craftAnythingNativeUrl(file: string): string {
  return `${CRAFT_ANYTHING_REPO}/releases/download/${CRAFT_ANYTHING_TAG}/${file}`;
}

export function craftAnythingSumsUrl(): string {
  return craftAnythingNativeUrl("SHA256SUMS.txt");
}
