"use client";

// Hamstikan: velur ham og sýnir aðgerðir hans (lib/board/hamir.ts). Situr efst til vinstri á borðinu, hægra megin við
// verkfærasúluna. Á síma er hamurinn valinn úr fellilista og aðgerðirnar skruna lárétt.

import {
  Box,
  BrickWall,
  CheckSquare,
  Crosshair,
  Eraser,
  Flame,
  Ruler,
  ScanSearch,
  Square,
  Waypoints,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { HAMIR, getHamur, hladaHam, useHamur, type HamAdgerd } from "../../lib/board/hamir";

const ADGERDIR: Record<HamAdgerd, { texti: string; titill: string; takn: ReactNode }> = {
  kvarda: { texti: "Kvarða", titill: "Kvarða teikninguna á þekktri lengd (K)", takn: <Ruler className="size-3.5" /> },
  hreinsa: { texti: "Hreinsa", titill: "Hreinsa teikningu — sýna bara veggi og þær merkingar sem þú velur", takn: <Eraser className="size-3.5" /> },
  veggir: { texti: "Veggir", titill: "Greina veggi — úr vigur-PDF þegar það er til, annars úr myndinni", takn: <BrickWall className="size-3.5" /> },
  thrividd: { texti: "3D", titill: "Hús í 3D — veggir og tæki á öllum hæðum", takn: <Box className="size-3.5" /> },
  "slt-brsl": { texti: "SLT / BRSL af teikningu", titill: "Lesa SLT, BRSL og skilti af teikningunni og setja tækin á hönnuðu staðina (165.BR1)", takn: <ScanSearch className="size-3.5" /> },
  ei: { texti: "EI-30 / EI-60", titill: "Lesa EI-merkingar og merkja eldveggina", takn: <Flame className="size-3.5 text-[#FE653F]" /> },
  eldveggur: { texti: "Eldveggur", titill: "Teikna eldvegg horn af horni — Enter lýkur, Esc hættir", takn: <Waypoints className="size-3.5" /> },
  gegnumtok: { texti: "Gegnumtök", titill: "Merkja þar sem lagnir krossa veggi — sterkari merki á EI-veggjum", takn: <Crosshair className="size-3.5" /> },
  rymi: { texti: "Teikna rými", titill: "Teikna rými — ferningar sem mynda eitt rými; Enter lýkur", takn: <Square className="size-3.5" /> },
  gatreitur: { texti: "Gátreitur", titill: "Setja gátreit — hakað = klárt", takn: <CheckSquare className="size-3.5" /> },
};

export function HamStika({ onAdgerd }: { onAdgerd: (a: HamAdgerd) => void }) {
  const hamur = useHamur((s) => s.hamur);
  const setHamur = useHamur((s) => s.setHamur);
  useEffect(() => hladaHam(), []);
  const h = getHamur(hamur);

  return (
    <div className="pointer-events-auto flex max-w-[min(calc(100vw-5.5rem),680px)] flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 p-1.5 text-stone-100 shadow-2xl">
      <div className="hidden items-center gap-0.5 sm:flex" role="tablist" aria-label="Hamur">
        {HAMIR.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === hamur}
            title={x.lysing}
            onClick={() => setHamur(x.id)}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap transition-colors ${
              x.id === hamur ? "bg-[#FE653F] text-white" : "text-stone-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {x.stutt}
          </button>
        ))}
      </div>
      <select
        aria-label="Hamur"
        value={hamur}
        onChange={(e) => setHamur(e.target.value as typeof hamur)}
        className="rounded-lg border border-white/15 bg-[#11131f] px-2 py-1 text-[12px] font-semibold text-white sm:hidden"
      >
        {HAMIR.map((x) => (
          <option key={x.id} value={x.id}>
            {x.heiti}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1 overflow-x-auto">
        {h.adgerdir.map((a) => {
          const d = ADGERDIR[a];
          return (
            <button
              key={a}
              type="button"
              title={d.titill}
              onClick={() => onAdgerd(a)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11.5px] font-medium text-stone-100 hover:bg-white/15"
            >
              {d.takn}
              {d.texti}
            </button>
          );
        })}
      </div>
      <p className="hidden px-1 text-[10.5px] leading-snug text-stone-400 md:block">{h.lysing}</p>
    </div>
  );
}
