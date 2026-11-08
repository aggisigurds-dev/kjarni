"use client";

import { useCallback, useEffect, useState } from "react";
import type { Ljos } from "../api/ljos/route";

const SENUR = [
  { key: "kosy10", label: "Kósý 10%", swatch: "#FFB066", on: true, bri: 10, color: "#FFB066" },
  { key: "kosy", label: "Kósý", swatch: "#FFC27A", on: true, bri: 40, color: "#FFC27A" },
  { key: "bjart", label: "Bjart", swatch: "#FFF4E0", on: true, bri: 100, color: "#FFF4E0" },
  { key: "slokkt", label: "Slökkt", swatch: "#2E323D", on: false },
] as const;

const LITIR = ["#FF5A5A", "#FF9A3C", "#FFD84A", "#7CE07C", "#3FD6C8", "#5CC8FF", "#4C7DFF", "#B07CFF", "#FF6FC8", "#FFC27A"];

export default function LjosClient() {
  const [ljos, setLjos] = useState<Ljos[]>([]);
  const [demo, setDemo] = useState(false);
  const [villa, setVilla] = useState("");
  const [pin, setPin] = useState("");
  const [opid, setOpid] = useState<string | null>(null);

  const lesa = useCallback(async () => {
    try {
      const r = await fetch("/api/ljos", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLjos(j.lights);
      setDemo(j.demo);
      setVilla("");
    } catch (e) {
      setVilla(e instanceof Error ? e.message : "Villa");
    }
  }, []);

  useEffect(() => {
    try {
      setPin(sessionStorage.getItem("ljos-pin") ?? "");
    } catch {}
    lesa();
  }, [lesa]);

  async function senda(ids: string[], body: { on?: boolean; bri?: number; color?: string }) {
    setLjos((cur) => cur.map((l) => (ids.includes(l.id) ? { ...l, ...body, color: body.color ?? l.color } : l)));
    const r = await fetch("/api/ljos", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-ljos-pin": pin },
      body: JSON.stringify({ ids, ...body }),
    });
    if (!r.ok) {
      setVilla((await r.json().catch(() => ({}))).error ?? "Villa");
      lesa();
    } else setVilla("");
  }

  const kveikt = ljos.filter((l) => l.on && l.reachable).length;
  const nåanleg = ljos.filter((l) => l.reachable).map((l) => l.id);
  const opna = ljos.find((l) => l.id === opid);

  return (
    <main style={{ minHeight: "100vh", background: "#101217", color: "#F2F2EE", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "28px 20px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#A3A8B4", fontWeight: 600, letterSpacing: ".04em" }}>LJÓS</p>
            <h1 style={{ margin: "4px 0", fontSize: 30, fontWeight: 800 }}>Langamýri 22</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#A3A8B4" }}>
              {kveikt} af {ljos.length} ljósum kveikt
            </p>
          </div>
          <button
            onClick={() => senda(nåanleg, { on: false })}
            aria-label="Slökkva á öllum ljósum"
            style={{ width: 48, height: 48, borderRadius: 24, border: "1px solid #2E323D", background: "#1A1D24", color: "#F2F2EE", fontSize: 20, cursor: "pointer" }}
          >
            ⏻
          </button>
        </header>

        {demo && (
          <p style={{ margin: 0, padding: 12, borderRadius: 12, background: "#2A2216", color: "#F5B544", fontSize: 13 }}>
            Sýnihamur: Hue er ekki tengt. Stilltu HUE_REMOTE_TOKEN, HUE_USERNAME og LJOS_PIN í Vercel.
          </p>
        )}
        {villa && <p role="alert" style={{ margin: 0, color: "#FF8A8A", fontSize: 14 }}>{villa}</p>}

        <label style={{ fontSize: 13, color: "#A3A8B4", display: "flex", gap: 8, alignItems: "center" }}>
          PIN
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              try { sessionStorage.setItem("ljos-pin", e.target.value); } catch {}
            }}
            style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid #2E323D", background: "#1A1D24", color: "#F2F2EE", padding: "0 12px", fontSize: 16 }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
          {SENUR.map((s) => (
            <button
              key={s.key}
              onClick={() => senda(nåanleg, s.on ? { on: true, bri: s.bri, color: s.color } : { on: false })}
              style={{ minHeight: 76, borderRadius: 18, border: "1px solid #262A33", background: "#1A1D24", color: "#F2F2EE", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 14, background: s.swatch }} />
              {s.label}
            </button>
          ))}
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {ljos.map((l) => {
            const lit = l.on && l.reachable;
            return (
              <li key={l.id} style={{ borderRadius: 20, padding: "14px 16px", background: "#1A1D24", border: "1px solid #2E323D", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0, background: lit ? l.color : "#23262F", boxShadow: lit ? `0 0 18px ${l.color}66` : "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 13, color: l.reachable ? "#A3A8B4" : "#F5A524" }}>
                      {l.reachable ? (l.on ? "Kveikt" : "Slökkt") : "Ekki í sambandi"}
                    </div>
                  </div>
                  {l.canColor && l.reachable && (
                    <button onClick={() => setOpid(opid === l.id ? null : l.id)} aria-label={`Litir fyrir ${l.name}`} style={{ minWidth: 44, minHeight: 44, borderRadius: 22, border: "1px solid #2E323D", background: "transparent", color: "#F2F2EE", cursor: "pointer" }}>
                      🎨
                    </button>
                  )}
                  {l.reachable && (
                    <button
                      role="switch"
                      aria-checked={l.on}
                      aria-label={(l.on ? "Slökkva á " : "Kveikja á ") + l.name}
                      onClick={() => senda([l.id], { on: !l.on })}
                      style={{ width: 52, height: 32, borderRadius: 16, border: 0, padding: 0, position: "relative", background: l.on ? "#F5B544" : "#2E323D", cursor: "pointer" }}
                    >
                      <span style={{ position: "absolute", top: 3, left: l.on ? 23 : 3, width: 26, height: 26, borderRadius: 13, background: "#fff", transition: "left .15s" }} />
                    </button>
                  )}
                </div>
                {lit && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 52 }}>
                    <input type="range" min={1} max={100} value={l.bri} aria-label={`Birta ${l.name}`} style={{ flex: 1 }}
                      onChange={(e) => setLjos((cur) => cur.map((x) => (x.id === l.id ? { ...x, bri: Number(e.target.value) } : x)))}
                      onPointerUp={(e) => senda([l.id], { bri: Number((e.target as HTMLInputElement).value) })}
                      onKeyUp={(e) => senda([l.id], { bri: Number((e.target as HTMLInputElement).value) })} />
                    <span style={{ width: 38, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{l.bri}%</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {opna && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
            {LITIR.map((c) => (
              <button key={c} aria-label={`Litur ${c}`} onClick={() => senda([opna.id], { color: c })}
                style={{ aspectRatio: "1", minHeight: 52, borderRadius: "50%", background: c, border: 0, cursor: "pointer" }} />
            ))}
          </div>
        )}

        <p style={{ margin: 0, fontSize: 12, color: "#6B7080" }}>
          Aðeins Philips Hue er stýrt úr skýinu. IKEA Dirigera og Luminus eru bara á staðarneti og eru ekki með.
        </p>
      </div>
    </main>
  );
}
