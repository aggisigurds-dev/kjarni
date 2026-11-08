// Tuya Cloud OpenAPI (Luminus-appið er byggt á Tuya). Ekki prófað gegn raunverulegum aðgangi enn.
// Env: TUYA_ACCESS_ID, TUYA_ACCESS_SECRET, TUYA_UID, TUYA_REGION (eu|us|cn|in, sjálfgefið eu).
import { createHash, createHmac } from "node:crypto";
import type { Ljos } from "./route";

type Status = { code: string; value: unknown };
type Device = { id: string; name: string; online: boolean; status?: Status[] };

export const tuyaCfg = () => {
  const id = process.env.TUYA_ACCESS_ID;
  const secret = process.env.TUYA_ACCESS_SECRET;
  const uid = process.env.TUYA_UID;
  if (!id || !secret || !uid) return null;
  const hosts: Record<string, string> = {
    eu: "openapi.tuyaeu.com", us: "openapi.tuyaus.com", cn: "openapi.tuyacn.com", in: "openapi.tuyain.com",
  };
  return { id, secret, uid, host: hosts[process.env.TUYA_REGION ?? "eu"] ?? hosts.eu };
};

let tok: { v: string; exp: number } | null = null;

async function call<T>(method: "GET" | "POST", path: string, token: string, body?: unknown): Promise<T> {
  const c = tuyaCfg()!;
  const t = Date.now().toString();
  const payload = body === undefined ? "" : JSON.stringify(body);
  const toSign = `${method}\n${createHash("sha256").update(payload).digest("hex")}\n\n${path}`;
  const sign = createHmac("sha256", c.secret).update(c.id + token + t + toSign).digest("hex").toUpperCase();
  const res = await fetch(`https://${c.host}${path}`, {
    method,
    headers: {
      client_id: c.id, sign, t, sign_method: "HMAC-SHA256",
      ...(token ? { access_token: token } : {}),
      "Content-Type": "application/json",
    },
    body: payload || undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const j = (await res.json()) as { success: boolean; result: T; msg?: string };
  if (!j.success) throw new Error(`Tuya: ${j.msg ?? res.status}`);
  return j.result;
}

async function token(): Promise<string> {
  if (tok && tok.exp > Date.now() + 60_000) return tok.v;
  const r = await call<{ access_token: string; expire_time: number }>("GET", "/v1.0/token?grant_type=1", "");
  tok = { v: r.access_token, exp: Date.now() + r.expire_time * 1000 };
  return tok.v;
}

const get = (s: Status[] | undefined, ...codes: string[]) => s?.find((x) => codes.includes(x.code));

function hsvOf(s: Status[] | undefined): { h: number; s: number; v: number } | null {
  const c = get(s, "colour_data_v2", "colour_data");
  if (!c) return null;
  try {
    return typeof c.value === "string" ? JSON.parse(c.value) : (c.value as { h: number; s: number; v: number });
  } catch {
    return null;
  }
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

export async function listTuya(): Promise<Ljos[]> {
  const c = tuyaCfg()!;
  const devs = await call<Device[]>("GET", `/v1.0/users/${c.uid}/devices`, await token());
  return devs.map((d) => {
    const on = get(d.status, "switch_led", "switch_1", "switch")?.value === true;
    const b2 = get(d.status, "bright_value_v2");
    const b1 = get(d.status, "bright_value");
    const raw = typeof b2?.value === "number" ? b2.value / 10 : typeof b1?.value === "number" ? (b1.value / 255) * 100 : 100;
    const hsv = hsvOf(d.status);
    const colour = get(d.status, "work_mode")?.value === "colour" && hsv;
    return {
      id: d.id,
      name: d.name,
      on,
      bri: Math.min(100, Math.max(1, Math.round(raw))),
      reachable: d.online,
      color: colour ? hsvToHex(hsv.h, hsv.s / 1000, Math.max(0.5, hsv.v / 1000)) : "#FFD9A0",
      canColor: Boolean(hsv) || Boolean(get(d.status, "colour_data_v2", "colour_data")),
    };
  });
}

function hexToHsv(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round((h * 60 + 360) % 360), s: max ? Math.round((d / max) * 1000) : 0, v: 1000 };
}

export async function setTuya(
  ids: string[],
  state: { on?: boolean; bri?: number; color?: string; white?: "warm" | "neutral" | "cool" },
) {
  const tk = await token();
  await Promise.all(
    ids.map(async (id) => {
      const st = await call<Status[]>("GET", `/v1.0/devices/${id}/status`, tk);
      const onCode = get(st, "switch_led", "switch_1", "switch")?.code ?? "switch_led";
      const commands: Status[] = [];
      if (state.on !== undefined) commands.push({ code: onCode, value: state.on });
      if (state.white) {
        const temp = { warm: 0, neutral: 500, cool: 1000 }[state.white];
        commands.push({ code: "work_mode", value: "white" });
        if (get(st, "temp_value_v2")) commands.push({ code: "temp_value_v2", value: temp });
        else if (get(st, "temp_value")) commands.push({ code: "temp_value", value: Math.round(temp / 4) });
      }
      if (state.color && !state.white && get(st, "colour_data_v2", "colour_data")) {
        const v2 = Boolean(get(st, "colour_data_v2"));
        commands.push({ code: "work_mode", value: "colour" });
        const hsv = hexToHsv(state.color);
        commands.push({ code: v2 ? "colour_data_v2" : "colour_data", value: v2 ? hsv : { h: hsv.h, s: Math.round(hsv.s / 4), v: 255 } });
      }
      if (state.bri !== undefined && !(state.color && !state.white)) {
        const v2 = Boolean(get(st, "bright_value_v2"));
        commands.push({
          code: v2 ? "bright_value_v2" : "bright_value",
          value: v2 ? Math.max(10, Math.round(state.bri * 10)) : Math.max(25, Math.round((state.bri / 100) * 255)),
        });
      }
      if (commands.length) await call("POST", `/v1.0/devices/${id}/commands`, tk, { commands });
    }),
  );
}
