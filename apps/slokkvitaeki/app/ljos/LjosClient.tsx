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

// Herbergi úr teikningu Langamýri 22 (einfölduð, ekki í réttum mælikvarða).
const HERBERGI = [
  { key: "hjon", nafn: "Hjón", x: 185, y: 150, w: 265, h: 355 },
  { key: "barn1", nafn: "Barn", x: 455, y: 150, w: 195, h: 350 },
  { key: "stofa", nafn: "Stofa", x: 655, y: 150, w: 305, h: 550 },
  { key: "thvottur", nafn: "Þvottur", x: 185, y: 510, w: 160, h: 250 },
  { key: "hol", nafn: "Sjónvarpshol", x: 350, y: 510, w: 300, h: 355 },
  { key: "barn2", nafn: "Barn", x: 185, y: 770, w: 230, h: 325 },
  { key: "bad", nafn: "Bað", x: 420, y: 870, w: 150, h: 225 },
  { key: "anddyri", nafn: "Anddyri", x: 575, y: 870, w: 175, h: 225 },
  { key: "eldhus", nafn: "Eldhús", x: 755, y: 710, w: 205, h: 385 },
  { key: "svalir", nafn: "Svalir", x: 655, y: 20, w: 305, h: 125 },
] as const;
const NAFN: Record<string, string> = {
  hjon: "Hjón", barn1: "Barn (norður)", barn2: "Barn (suður)", stofa: "Stofa", thvottur: "Þvottur",
  hol: "Sjónvarpshol", bad: "Bað", anddyri: "Anddyri", eldhus: "Eldhús", svalir: "Svalir",
};

export default function LjosClient() {
  const [ljos, setLjos] = useState<Ljos[]>([]);
  const [demo, setDemo] = useState(false);
  const [villa, setVilla] = useState("");
  const [pin, setPin] = useState("");
  const [opid, setOpid] = useState<string | null>(null);
  const [rym, setRym] = useState<Record<string, string>>({}); // ljós-id -> herbergi
  const [val, setVal] = useState<string | null>(null);

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
      setRym(JSON.parse(localStorage.getItem("ljos-herbergi") ?? "{}"));
    } catch {}
    lesa();
  }, [lesa]);

  function setHerbergi(id: string, key: string) {
    const nytt = { ...rym, [id]: key };
    if (!key) delete nytt[id];
    setRym(nytt);
    try { localStorage.setItem("ljos-herbergi", JSON.stringify(nytt)); } catch {}
  }

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

  const ljosI = (key: string) => ljos.filter((l) => rym[l.id] === key && l.reachable);
  function haettaHerbergi(key: string) {
    const ls = ljosI(key);
    setVal(key);
    if (ls.length === 0) return;
    senda(ls.map((l) => l.id), { on: !ls.some((l) => l.on) });
  }

  const kveikt = ljos.filter((l) => l.on && l.reachable).length;
  const nåanleg = ljos.filter((l) => l.reachable).map((l) => l.id);
  const opna = ljos.find((l) => l.id === opid);
  const synd = val ? ljos.filter((l) => rym[l.id] === val) : ljos;

  return (
    <main style={{ minHeight: "100vh", background: "#101217", color: "#F2F2EE", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "28px 20px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#A3A8B4", fontWeight: 600, letterSpacing: ".04em" }}>LJÓS</p>
            <h1 style={{ margin: "4px 0", fontSize: 30, fontWeight: 800 }}>Langamýri 22</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#A3A8B4" }}>{kveikt} af {ljos.length} ljósum kveikt</p>
          </div>
          <button onClick={() => senda(nåanleg, { on: false })} aria-label="Slökkva á öllum ljósum"
            style={{ width: 48, height: 48, borderRadius: 24, border: "1px solid #2E323D", background: "#1A1D24", color: "#F2F2EE", fontSize: 20, cursor: "pointer" }}>⏻</button>
        </header>

        {demo && (
          <p style={{ margin: 0, padding: 12, borderRadius: 12, background: "#2A2216", color: "#F5B544", fontSize: 13 }}>
            Sýnihamur: Hue er ekki tengt. Stilltu HUE_REMOTE_TOKEN, HUE_USERNAME og LJOS_PIN í Vercel.
          </p>
        )}
        {villa && <p role="alert" style={{ margin: 0, color: "#FF8A8A", fontSize: 14 }}>{villa}</p>}

        <label style={{ fontSize: 13, color: "#A3A8B4", display: "flex", gap: 8, alignItems: "center" }}>
          PIN
          <input type="password" inputMode="numeric" value={pin}
            onChange={(e) => { setPin(e.target.value); try { sessionStorage.setItem("ljos-pin", e.target.value); } catch {} }}
            style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid #2E323D", background: "#1A1D24", color: "#F2F2EE", padding: "0 12px", fontSize: 16 }} />
        </label>

        <svg viewBox="170 0 810 1110" role="group" aria-label="Grunnmynd af Langamýri 22" style={{ width: "100%", background: "#14161C", borderRadius: 20 }}>
          {HERBERGI.map((h) => {
            const ls = ljosI(h.key);
            const lit = ls.filter((l) => l.on);
            const fill = lit.length ? lit[0].color : "#1A1D24";
            const op = lit.length ? 0.35 + (lit.reduce((a, l) => a + l.bri, 0) / lit.length / 100) * 0.6 : 1;
            const merkt = val === h.key;
            return (
              <g key={h.key} role="button" tabIndex={0} aria-pressed={lit.length > 0}
                aria-label={`${NAFN[h.key]}${ls.length ? "" : " (engin ljós skráð)"}`}
                onClick={() => haettaHerbergi(h.key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); haettaHerbergi(h.key); } }}
                style={{ cursor: "pointer", outline: "none" }}>
                <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={10} fill={fill} fillOpacity={op}
                  stroke={merkt ? "#F5B544" : "#5B3BC4"} strokeWidth={merkt ? 8 : 5} />
                <text x={h.x + h.w / 2} y={h.y + h.h / 2} textAnchor="middle" fontSize={34} fontWeight={700}
                  fill={lit.length ? "#101217" : "#C9CCD4"}>{h.nafn}</text>
                <text x={h.x + h.w / 2} y={h.y + h.h / 2 + 38} textAnchor="middle" fontSize={26}
                  fill={lit.length ? "#101217" : "#A3A8B4"}>{ls.length ? `${lit.length}/${ls.length} kveikt` : "–"}</text>
              </g>
            );
          })}
        </svg>
        {val && (
          <button onClick={() => setVal(null)} style={{ minHeight: 44, borderRadius: 22, border: "1px solid #2E323D", background: "#1A1D24", color: "#F2F2EE", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
            Sýna öll ljós (nú: {NAFN[val]})
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
          {SENUR.map((s) => (
            <button key={s.key} onClick={() => senda(nåanleg, s.on ? { on: true, bri: s.bri, color: s.color } : { on: false })}
              style={{ minHeight: 76, borderRadius: 18, border: "1px solid #262A33", background: "#1A1D24", color: "#F2F2EE", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              <span style={{ width: 28, height: 28, borderRadius: 14, background: s.swatch }} />
              {s.label}
            </button>
          ))}
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {synd.map((l) => {
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
                    <button onClick={() => setOpid(opid === l.id ? null : l.id)} aria-label={`Litir fyrir ${l.name}`}
                      style={{ minWidth: 44, minHeight: 44, borderRadius: 22, border: "1px solid #2E323D", background: "transparent", color: "#F2F2EE", cursor: "pointer" }}>🎨</button>
                  )}
                  {l.reachable && (
                    <button role="switch" aria-checked={l.on} aria-label={(l.on ? "Slökkva á " : "Kveikja á ") + l.name}
                      onClick={() => senda([l.id], { on: !l.on })}
                      style={{ width: 52, height: 32, borderRadius: 16, border: 0, padding: 0, position: "relative", background: l.on ? "#F5B544" : "#2E323D", cursor: "pointer" }}>
                      <span style={{ position: "absolute", top: 3, left: l.on ? 23 : 3, width: 26, height: 26, borderRadius: 13, background: "#fff", transition: "left .15s" }} />
                    </button>
                  )}
                </div>
                <label style={{ paddingLeft: 52, fontSize: 13, color: "#A3A8B4", display: "flex", gap: 8, alignItems: "center" }}>
                  Herbergi
                  <select value={rym[l.id] ?? ""} onChange={(e) => setHerbergi(l.id, e.target.value)}
                    style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid #2E323D", background: "#101217", color: "#F2F2EE", padding: "0 8px", fontSize: 15 }}>
                    <option value="">Óskráð</option>
                    {HERBERGI.map((h) => <option key={h.key} value={h.key}>{NAFN[h.key]}</option>)}
                  </select>
                </label>
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
          Herbergjaskráning er geymd í þessum vafra. Aðeins Philips Hue er stýrt úr skýinu; IKEA Dirigera og Luminus eru ekki með.
        </p>
      </div>
    </main>
  );
}
