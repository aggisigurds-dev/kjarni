"use client";

// Hamstikan: velur ham og sýnir aðgerðir hans (lib/board/hamir.ts). Efst í hægra hliðarspjaldinu (Agnar 03.10.2026:
// „frekar sett þetta í hægri sidepannel — of mikið fyrir þarna" — á borðinu sjálfu skyggði hún á teikninguna).

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
    <div className="border-b border-white/8 px-3 py-2.5" title={h.lysing}>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Hamur">
        {HAMIR.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === hamur}
            title={x.lysing}
            onClick={() => setHamur(x.id)}
            className={`rounded-md px-2 py-1 text-[11.5px] font-semibold whitespace-nowrap transition-colors ${
              x.id === hamur ? "bg-[#FE653F] text-white" : "bg-white/5 text-stone-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {x.stutt}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {h.adgerdir.map((a) => {
          const d = ADGERDIR[a];
          return (
            <button
              key={a}
              type="button"
              title={d.titill}
              onClick={() => onAdgerd(a)}
              className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] font-medium text-stone-100 hover:bg-white/12"
            >
              {d.takn}
              {d.texti}
            </button>
          );
        })}
      </div>
    </div>
  );
}
