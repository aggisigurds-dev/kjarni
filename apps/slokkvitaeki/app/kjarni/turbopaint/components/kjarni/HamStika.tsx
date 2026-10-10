"use client";

// Hamstikan: velur ham og sýnir aðgerðir hans (lib/board/hamir.ts). Efst í hægra hliðarspjaldinu (Agnar 03.10.2026:
// „frekar sett þetta í hægri sidepannel — of mikið fyrir þarna" — á borðinu sjálfu skyggði hún á teikninguna).

import {
  PencilLine,
  DoorOpen,
  PanelTop,
  Box,
  Slash,
  Brush,
  BrickWall,
  CheckSquare,
  Crosshair,
  Eraser,
  Flame,
  Ruler,
  ScanSearch,
  Scissors,
  Square,
  SquareDashed,
  Waypoints,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { HAMIR, getHamur, hladaHam, useHamur, type HamAdgerd } from "../../lib/board/hamir";
import { DRAEGI_LYKILL } from "../../lib/board/slt-brsl";

export const ADGERDIR: Record<HamAdgerd, { texti: string; titill: string; takn: ReactNode }> = {
  "croppa-oft": {
    texti: "Croppa oft",
    titill: "Margar grunnmyndir á einu blaði (1., 2., 3. hæð): dragðu kassa yfir hverja, skerðu allar í einu og tengdu hverja við sína hæð",
    takn: <Scissors className="size-3.5" />,
  },
  kvarda: { texti: "Kvarða", titill: "Kvarða teikninguna á þekktri lengd (K)", takn: <Ruler className="size-3.5" /> },
  "eyda-linu": { texti: "Eyða línu", titill: "Smelltu á línu sem á að hverfa (vigur-PDF) — öll línan og bútar hennar fara, ⌘Z afturkallar", takn: <Slash className="size-3.5" /> },
  strokledur: { texti: "Strokleður", titill: "Strjúktu yfir það sem á að hverfa af teikningunni — stærð = línuþykkt neðst, ⌘Z afturkallar", takn: <Brush className="size-3.5" /> },
  "hreinsa-svaedi": { texti: "Hreinsa svæði", titill: "Dragðu kassa yfir það sem á að hverfa af teikningunni — hvítast, ⌘Z afturkallar", takn: <SquareDashed className="size-3.5" /> },
  hreinsa: { texti: "Hreinsa", titill: "Hreinsa teikningu — sýna bara veggi og þær merkingar sem þú velur", takn: <Eraser className="size-3.5" /> },
  veggir: { texti: "Veggir", titill: "Greina veggi — úr vigur-PDF þegar það er til, annars úr myndinni", takn: <BrickWall className="size-3.5" /> },
  "teikna-vegg": { texti: "+ Teikna vegg", titill: "Haltu inni vinstri músartakkanum og dragðu — beinn veggur (0/45/90°, Shift víxlar); slepptu til að ljúka. ⌘Z afturkallar.", takn: <PencilLine className="size-3.5" /> },
  "teikna-hurd": { texti: "+ Hurð", titill: "Haltu inni og dragðu línu á milli hurðarkarmanna — smellur á veggendana; slepptu til að ljúka. ⌘Z afturkallar.", takn: <DoorOpen className="size-3.5" /> },
  "teikna-gler": { texti: "+ Gler", titill: "Haltu inni og dragðu línu yfir gluggann / glervegginn; slepptu til að ljúka. ⌘Z afturkallar.", takn: <PanelTop className="size-3.5" /> },
  "teikna-ei60": {
    texti: "+ Eldveggur EI-60",
    titill: "Haltu inni og dragðu — einn beinn eldveggur EI-60 (rauður), eins og „+ Teikna vegg“: hornalás, smellur á veggenda. Núverandi vegg: veldu hann og ýttu á 4. ⌘Z afturkallar.",
    takn: <Flame className="size-3.5 text-[#d32f2f]" />,
  },
  "teikna-ei30": {
    texti: "EI-30",
    titill: "Haltu inni og dragðu — einn beinn eldveggur EI-30 (ljósrauður). Núverandi vegg: veldu hann og ýttu á 5. ⌘Z afturkallar.",
    takn: <Flame className="size-3.5 text-[#ef5350]" />,
  },
  thrividd: { texti: "3D", titill: "Hús í 3D — veggir og tæki á öllum hæðum", takn: <Box className="size-3.5" /> },
  "slt-brsl": {
    texti: "SLT / BRSL af teikningu",
    titill:
      "Lesa SLT og BRSL af teikningunni: slanga á tákni slöngukeflisins, slökkvitæki við hliðina — tengt við óstaðsett tæki staðarins (annars „ótengt“ → Nýtt við vistun), og skilti. Eldveggir ekki (EI-30 / EI-60). ⌘Z afturkallar.",
    takn: <ScanSearch className="size-3.5" />,
  },
  ei: { texti: "EI-30 / EI-60", titill: "Lesa EI-merkingar og merkja eldveggina", takn: <Flame className="size-3.5 text-[#FE653F]" /> },
  eldveggur: { texti: "Eldveggur", titill: "Teikna eldvegg EI-60 — haltu inni og dragðu", takn: <Waypoints className="size-3.5" /> },
  gegnumtok: { texti: "Gegnumtök", titill: "Merkja þar sem lagnir krossa veggi — sterkari merki á EI-veggjum", takn: <Crosshair className="size-3.5" /> },
  rymi: { texti: "Teikna rými", titill: "Teikna rými — ferningar sem mynda eitt rými; Enter lýkur", takn: <Square className="size-3.5" /> },
  gatreitur: { texti: "Gátreitur", titill: "Setja gátreit — hakað = klárt", takn: <CheckSquare className="size-3.5" /> },
};

export function HamStika({ onAdgerd }: { onAdgerd: (a: HamAdgerd) => void }) {
  const hamur = useHamur((s) => s.hamur);
  const setHamur = useHamur((s) => s.setHamur);
  useEffect(() => hladaHam(), []);
  const h = getHamur(hamur);
  // „Sýna drægi slangna (165.BR1)" — sjálfgefið AF (Agnar 07.10.2026: „og taka þennan rauða hring")
  const [draegi, setDraegi] = useState(false);
  useEffect(() => {
    try {
      setDraegi(localStorage.getItem(DRAEGI_LYKILL) === "1");
    } catch {
      /* einkagluggi */
    }
  }, []);

  return (
    <div className="border-b border-white/8 py-2.5 pr-6 pl-3" title={h.lysing}>
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
      {h.adgerdir.length ? (
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
      ) : null}
      {h.adgerdir.includes("slt-brsl") ? (
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[10.5px] text-stone-400" title="Teiknar 25 m drægi kringum hverja brunaslöngu næst þegar „SLT / BRSL af teikningu“ er keyrt">
          <input
            type="checkbox"
            checked={draegi}
            data-draegi-slangna
            onChange={(e) => {
              setDraegi(e.target.checked);
              try {
                localStorage.setItem(DRAEGI_LYKILL, e.target.checked ? "1" : "0");
              } catch {
                /* einkagluggi */
              }
            }}
          />
          Sýna drægi slangna (165.BR1)
        </label>
      ) : null}
    </div>
  );
}
