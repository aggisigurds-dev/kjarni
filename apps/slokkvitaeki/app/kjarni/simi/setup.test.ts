import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DC_SETUP,
  DEFAULT_VELAR,
  DESKTOP_COMMANDER_MCP,
  mergeVelar,
  rustdeskDigits,
  rustdeskHref,
  tailscaleMachineHref,
} from "./setup.ts";

test("RustDesk links only fire with a real id", () => {
  assert.equal(rustdeskDigits("1 234 567 890"), "1234567890");
  assert.equal(rustdeskHref(""), null);
  assert.equal(rustdeskHref("12"), null);
  assert.equal(rustdeskHref("123 456 789"), "rustdesk://connection/new/123456789");
});

test("Tailscale MagicDNS rejects junk", () => {
  assert.equal(tailscaleMachineHref("DESKTOP-509MN7M"), "http://desktop-509mn7m");
  assert.equal(tailscaleMachineHref("bad name!"), null);
  assert.equal(tailscaleMachineHref(""), null);
});

test("saved machine rows merge onto the four slots; drafts always persist", () => {
  const merged = mergeVelar([
    { id: "skrifstofa", rustdeskId: "111 222 333", name: "Skrifstofuvélin" },
    { id: "ghost", rustdeskId: "999" },
  ]);
  assert.equal(merged.length, DEFAULT_VELAR.length);
  assert.equal(merged[0].name, "Skrifstofuvélin");
  assert.equal(merged[0].rustdeskId, "111 222 333");
  assert.equal(merged[1].rustdeskId, "");
  assert.equal(merged.some((v) => v.id === "ghost"), false);
});

test("Desktop Commander setup is the official remote scripts, not a Kjarni proxy", () => {
  assert.match(DC_SETUP.windows, /remote-windows\.ps1/);
  assert.match(DC_SETUP.macos, /remote-macos\.sh/);
  assert.match(DC_SETUP.linux, /remote-linux\.sh/);
  assert.equal(DESKTOP_COMMANDER_MCP, "https://mcp.desktopcommander.app/mcp");
});
