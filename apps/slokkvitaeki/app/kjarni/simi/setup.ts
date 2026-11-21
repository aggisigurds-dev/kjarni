/** Phone → PC control. Commands go through Desktop Commander Remote (Claude/ChatGPT
 *  on the phone). The screen uses RustDesk (Moonlight as visual fallback).
 *  Kjarni does not proxy a shell — that would be an open remote-control API. */

export const SIMI_HREF = "/kjarni/simi";
export const SIMI_STORE_KEY = "kjarni_simi_velar_v1";

export const CLAUDE_HREF = "https://claude.ai/new";
export const CHATGPT_HREF = "https://chatgpt.com";
export const DESKTOP_COMMANDER_DEVICES = "https://mcp.desktopcommander.app";
export const DESKTOP_COMMANDER_CLAUDE = "https://desktopcommander.app/mcp/claude-web/";
export const DESKTOP_COMMANDER_MCP = "https://mcp.desktopcommander.app/mcp";

export const RUSTDESK_PLAY = "https://play.google.com/store/apps/details?id=com.carriez.flutter_hbb";
export const RUSTDESK_SITE = "https://rustdesk.com";
export const MOONLIGHT_PLAY = "https://play.google.com/store/apps/details?id=com.moonlight_stream.moonlight";
export const MOONLIGHT_SITE = "https://moonlight-stream.org";
export const TAILSCALE_PLAY = "https://play.google.com/store/apps/details?id=com.tailscale.ipn";
export const TAILSCALE_ADMIN = "https://login.tailscale.com/admin/machines";

export const DC_SETUP = {
  windows:
    "irm -ErrorAction Stop https://raw.githubusercontent.com/wonderwhy-er/DesktopCommanderMCP/main/scripts/remote/remote-windows.ps1 | iex",
  macos: "curl -fsSL https://raw.githubusercontent.com/wonderwhy-er/DesktopCommanderMCP/main/scripts/remote/remote-macos.sh | sh",
  linux: "curl -fsSL https://raw.githubusercontent.com/wonderwhy-er/DesktopCommanderMCP/main/scripts/remote/remote-linux.sh | sh",
  npx: "npx @wonderwhy-er/desktop-commander@latest remote",
} as const;

export type SimiVel = {
  id: string;
  name: string;
  hint: string;
  rustdeskId: string;
  tailscale: string;
};

export const DEFAULT_VELAR: SimiVel[] = [
  { id: "skrifstofa", name: "Skrifstofa", hint: "Aðalvélin á skrifstofunni", rustdeskId: "", tailscale: "" },
  { id: "heimili", name: "Heimili", hint: "Heimavélin", rustdeskId: "", tailscale: "" },
  { id: "vel-3", name: "Vél 3", hint: "", rustdeskId: "", tailscale: "" },
  { id: "vel-4", name: "Vél 4", hint: "", rustdeskId: "", tailscale: "" },
];

export function rustdeskDigits(id: string): string {
  return id.replace(/\D/g, "");
}

/** Official RustDesk deep link. Empty / too-short IDs return null so the button stays a no-op. */
export function rustdeskHref(id: string): string | null {
  const digits = rustdeskDigits(id);
  if (digits.length < 6) return null;
  return `rustdesk://connection/new/${digits}`;
}

export function tailscaleMachineHref(name: string): string | null {
  const host = name.trim().toLowerCase().replace(/\s+/g, "-");
  if (!host || !/^[a-z0-9][a-z0-9.-]{0,62}$/.test(host)) return null;
  return `http://${host}`;
}

export function mergeVelar(stored: unknown): SimiVel[] {
  const rows = Array.isArray(stored) ? stored : [];
  const byId = new Map<string, Partial<SimiVel>>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = "id" in row && typeof row.id === "string" ? row.id : "";
    if (id) byId.set(id, row as Partial<SimiVel>);
  }
  return DEFAULT_VELAR.map((base) => {
    const extra = byId.get(base.id) ?? {};
    return {
      ...base,
      name: typeof extra.name === "string" && extra.name.trim() ? extra.name.trim() : base.name,
      hint: typeof extra.hint === "string" ? extra.hint : base.hint,
      rustdeskId: typeof extra.rustdeskId === "string" ? extra.rustdeskId : "",
      tailscale: typeof extra.tailscale === "string" ? extra.tailscale : "",
    };
  });
}
