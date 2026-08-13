"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stop = {
  s: { id: number; naesta_thjonusta: string | null; tidni: string };
  k: { id: number; nafn: string; stadur?: string; heimilisfang?: string } | undefined;
};

const TOWNS: Record<string, [number, number]> = {
  "Reykjavík": [64.1355, -21.895],
  "Kópavogur": [64.1122, -21.913],
  "Hafnarfjörður": [64.067, -21.956],
};
function coord(stadur: string | undefined, id: number): [number, number] {
  const base = TOWNS[stadur || ""] || TOWNS["Reykjavík"];
  const j = (n: number) => (((id * n) % 22) - 11) / 450;
  return [base[0] + j(7), base[1] + j(13)];
}
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("is-IS", { day: "2-digit", month: "2-digit" }) : "—");

export function KerfiUtkeyrsla({ stops }: { stops: Stop[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visited, setVisited] = useState<Record<number, boolean>>({});

  const byTown = useMemo(() => {
    const m: Record<string, Stop[]> = {};
    for (const st of stops) (m[st.k?.stadur || "Annað"] ||= []).push(st);
    return m;
  }, [stops]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any;
    let cancelled = false;
    function init() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (!L || !ref.current || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ref.current as any)._leaflet_id) return;
      map = L.map(ref.current, { scrollWheelZoom: false }).setView([64.1, -21.93], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      stops.forEach(({ s, k }) => {
        if (!k) return;
        const c = coord(k.stadur, k.id);
        L.marker(c).addTo(map).bindPopup(`<b>${k.nafn}</b><br>${k.heimilisfang || ""}${k.stadur ? ", " + k.stadur : ""}<br>Næst: ${fmt(s.naesta_thjonusta)}`);
      });
      setTimeout(() => map && map.invalidateSize(), 200);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) init();
    else {
      if (!document.getElementById("leaflet-css")) {
        const l = document.createElement("link");
        l.id = "leaflet-css"; l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(l);
      }
      let sc = document.getElementById("leaflet-js") as HTMLScriptElement | null;
      if (!sc) {
        sc = document.createElement("script");
        sc.id = "leaflet-js"; sc.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; sc.onload = init;
        document.body.appendChild(sc);
      } else {
        sc.addEventListener("load", init);
      }
    }
    return () => { cancelled = true; if (map) map.remove(); };
  }, [stops]);

  return (
    <>
      <h1 className="k-h1">Útkeyrsla</h1>
      <p className="k-lede">Leið dagsins — fyrirtæki í þjónustu, hópað eftir svæði. Hakaðu við þegar heimsókn er lokið.</p>
      <div className="k-utk">
        <div className="k-utk-list">
          {Object.entries(byTown).map(([town, list]) => (
            <div className="k-card" key={town}>
              <div className="k-card-h"><h2>{town}</h2><span>{list.length}</span></div>
              <div className="k-list">
                {list.map(({ s, k }) => (
                  <label className={`k-stop ${visited[s.id] ? "done" : ""}`} key={s.id}>
                    <input type="checkbox" checked={!!visited[s.id]} onChange={() => setVisited((v) => ({ ...v, [s.id]: !v[s.id] }))} />
                    <span className="k-stop-nafn">{k?.nafn}</span>
                    <span className="k-stop-addr">{k?.heimilisfang}</span>
                    <span className="k-stop-date">{fmt(s.naesta_thjonusta)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {stops.length === 0 && <p className="k-empty">Engin fyrirtæki í þjónustu — bættu við á „Fyrirtæki í þjónustu".</p>}
        </div>
        <div className="k-map" ref={ref} />
      </div>
    </>
  );
}
