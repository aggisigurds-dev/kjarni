// Ljósastýring Langamýri 22.
//  - Philips Hue: Remote API (skýið). Env: HUE_REMOTE_TOKEN, HUE_USERNAME.
//  - IKEA Dirigera: aðeins á staðarneti → litla brúin í tools/ljos-bridge keyrir heima
//    og er gerð aðgengileg með t.d. Cloudflare Tunnel. Env: LJOS_BRIDGE_URL, LJOS_BRIDGE_TOKEN.
// Ljós-id eru með forskeyti: "h:" = Hue, "i:" = IKEA (brú).
// Án neinnar tengingar = sýnihamur. Skrif krefjast alltaf LJOS_PIN (fail closed).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = "https://api.meethue.com/route/api";

type HueLight = {
  state: { on: boolean; bri?: number; xy?: [number, number]; ct?: number; reachable: boolean };
  name: string;
  type: string;
};

export type Ljos = {
  id: string;
  name: string;
  on: boolean;
  bri: number; // 1-100
  reachable: boolean;
  color: string; // hex, áætlað
  canColor: boolean;
};

const DEMO: Ljos[] = [
  { id: "h:d1", name: "Loft (sýni)", on: true, bri: 70, reachable: true, color: "#FFD9A0", canColor: false },
  { id: "i:d2", name: "Standlampi (sýni)", on: false, bri: 40, reachable: true, color: "#FFC27A", canColor: true },
];

const cfg = () => {
  const token = process.env.HUE_REMOTE_TOKEN;
  const user = process.env.HUE_USERNAME;
  return token && user ? { token, user } : null;
};

function hexToXy(hex: string): [number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const s = X + Y + Z || 1;
  return [Number((X / s).toFixed(4)), Number((Y / s).toFixed(4))];
}

function approxColor(l: HueLight): string {
  if (l.state.ct) return l.state.ct > 370 ? "#FFC27A" : l.state.ct > 250 ? "#FFE2B8" : "#EEF3FF";
  return "#FFD9A0";
}

async function hue(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hue ${res.status}`);
  return res.json();
}

const bridge = () => {
  const url = process.env.LJOS_BRIDGE_URL;
  const token = process.env.LJOS_BRIDGE_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
};

async function bridgeCall(path: string, init?: RequestInit) {
  const b = bridge()!;
  const res = await fetch(`${b.url}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Brú ${res.status}`);
  return res.json();
}

export async function GET() {
  const c = cfg();
  const b = bridge();
  if (!c && !b) return NextResponse.json({ demo: true, lights: DEMO });
  const [hueRes, ikeaRes] = await Promise.allSettled([
    c
      ? (hue(`/${c.user}/lights`, c.token) as Promise<Record<string, HueLight>>).then((raw) =>
          Object.entries(raw).map(([id, l]): Ljos => ({
            id: `h:${id}`,
            name: l.name,
            on: l.state.on,
            bri: Math.max(1, Math.round(((l.state.bri ?? 254) / 254) * 100)),
            reachable: l.state.reachable,
            color: approxColor(l),
            canColor: Boolean(l.state.xy),
          })),
        )
      : Promise.resolve([] as Ljos[]),
    b
      ? (bridgeCall("/lights") as Promise<Ljos[]>).then((ls) => ls.map((l) => ({ ...l, id: `i:${l.id}` })))
      : Promise.resolve([] as Ljos[]),
  ]);
  const lights = [
    ...(hueRes.status === "fulfilled" ? hueRes.value : []),
    ...(ikeaRes.status === "fulfilled" ? ikeaRes.value : []),
  ];
  const errors = [
    hueRes.status === "rejected" ? "Hue" : "",
    ikeaRes.status === "rejected" ? "IKEA-brú" : "",
  ].filter(Boolean);
  if (lights.length === 0 && errors.length) {
    return NextResponse.json({ error: `Næ ekki sambandi: ${errors.join(", ")}` }, { status: 502 });
  }
  return NextResponse.json({ demo: false, lights, errors });
}

export async function PUT(req: Request) {
  const pin = process.env.LJOS_PIN;
  if (!pin || req.headers.get("x-ljos-pin") !== pin) {
    return NextResponse.json({ error: "Rangt PIN" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    ids?: unknown;
    on?: unknown;
    bri?: unknown;
    color?: unknown;
  } | null;
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 50) {
    return NextResponse.json({ error: "Ógild beiðni" }, { status: 400 });
  }
  const ids = body.ids.map(String).filter((i) => /^[hi]:[A-Za-z0-9_-]{1,80}$/.test(i));
  const state: { on?: boolean; bri?: number; color?: string } = {};
  if (typeof body.on === "boolean") state.on = body.on;
  if (typeof body.bri === "number") {
    state.bri = Math.min(100, Math.max(1, Math.round(body.bri)));
    if (body.on === undefined) state.on = true;
  }
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) {
    state.color = body.color;
    state.on = true;
  }
  if (Object.keys(state).length === 0 || ids.length === 0) {
    return NextResponse.json({ error: "Ekkert að breyta" }, { status: 400 });
  }
  const c = cfg();
  const b = bridge();
  if (!c && !b) return NextResponse.json({ ok: true, demo: true });
  const hueIds = ids.filter((i) => i.startsWith("h:")).map((i) => i.slice(2));
  const ikeaIds = ids.filter((i) => i.startsWith("i:")).map((i) => i.slice(2));
  const hueState: Record<string, unknown> = {};
  if (state.on !== undefined) hueState.on = state.on;
  if (state.bri !== undefined) hueState.bri = Math.round((state.bri / 100) * 254);
  if (state.color) hueState.xy = hexToXy(state.color);
  try {
    await Promise.all([
      ...(c ? hueIds : []).map((id) =>
        hue(`/${c!.user}/lights/${id}/state`, c!.token, { method: "PUT", body: JSON.stringify(hueState) }),
      ),
      ...(b && ikeaIds.length ? [bridgeCall("/state", { method: "PUT", body: JSON.stringify({ ids: ikeaIds, ...state }) })] : []),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ljósin hafna skipuninni" }, { status: 502 });
  }
}
