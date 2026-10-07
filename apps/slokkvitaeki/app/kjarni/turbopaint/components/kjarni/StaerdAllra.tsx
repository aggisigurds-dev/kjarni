"use client";

// „Stærð allra merkja" (Agnar 07.10.2026: „ég get heldur ekki breytt stærðunum á öllum merkingunum í einu, þarf að gera
// hvert fyrir sig"). Sleði í Tæki staðarins: öll úttektartákn hæðarinnar stækka/minnka í einu, hvert um sína miðju —
// einn dráttur = eitt ⌘Z-skref. Talan er sú sama og „Stærð tákna" í Teikning-glugganum (stimpilStaerd hæðarinnar,
// 10–160 px) og vistast á hæðina með „Vista í úttekt". Líka: stærð VALINNA tákna í eiginleikaspjaldinu (öll valin í einu).

import { Minus, Plus, Equal } from "lucide-react";
import { useRef } from "react";
import { STAERD_MAX, STAERD_MIN } from "../../lib/board/merkjasafn";
import {
  einingTakns,
  eldriTengingarValinna,
  jafnaHaed,
  setjaStaerdValinna,
  skalaAllaHaed,
  skalaValin,
  skrefStaerdar,
  staerdHaedar,
  taknHaedar,
  upphafStaerdar,
  type StaerdarUpphaf,
} from "../../lib/board/staerd-allra";
import { useBoardStore } from "../../lib/board/store";
import type { BoardObject, ImageObject, SymbolObject } from "../../lib/board/types";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";

/** Setur uppfærða hluti á borðið án sögu (kallandinn hefur þegar tekið sögu-skrefið). */
function setja(map: Map<string, BoardObject>) {
  if (!map.size) return;
  useBoardStore.getState().updateObjects([...map.keys()], (o) => map.get(o.id) ?? o, false);
}

/** stimpilStaerd hæðarinnar í úttektinni (fyrir eldri tengingar). */
function haedTUttektar(haedId: string | undefined): number | null {
  const g = useUttektGogn.getState().gogn;
  const h = haedId ? g?.haedir.find((x) => x.id === haedId) : null;
  return h ? Number(h.stimpilStaerd) || null : null;
}

const takki =
  "flex items-center justify-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-stone-200 hover:bg-white/10";

export function StaerdAllraMerkja({ myndId }: { myndId: string }) {
  const mynd = useBoardStore((s) => s.objects.find((o): o is ImageObject => o.id === myndId && o.type === "image") ?? null);
  const fjoldi = useBoardStore((s) => (mynd ? taknHaedar(s.objects, myndId).length : 0));
  useUttektGogn((s) => s.gogn); // endurteiknast þegar hæðirnar koma (eldri tengingar)
  const drag = useRef<StaerdarUpphaf | null>(null);
  if (!mynd?.uttekt) return null;
  const T = staerdHaedar(mynd, haedTUttektar(mynd.uttekt.haedId));

  const upphaf = () => {
    const st = useBoardStore.getState();
    const m = st.objects.find((o): o is ImageObject => o.id === myndId && o.type === "image");
    return m ? upphafStaerdar(st.objects, m, haedTUttektar(m.uttekt?.haedId)) : null;
  };
  /** Eitt sögu-skref í byrjun dráttar; síðan uppfært lifandi án sögu. */
  const draga = (v: number) => {
    if (!drag.current) {
      drag.current = upphaf();
      if (!drag.current) return;
      useBoardStore.getState().commitHistory();
    }
    setja(skalaAllaHaed(useBoardStore.getState().objects, drag.current, v));
  };
  const ljuka = () => {
    drag.current = null;
  };
  const skref = (f: (u: StaerdarUpphaf) => Map<string, BoardObject>) => {
    const u = upphaf();
    if (!u) return;
    useBoardStore.getState().commitHistory();
    setja(f(u));
  };

  return (
    <div data-staerd-allra className="space-y-1 rounded border border-white/8 bg-white/3 px-2 py-1.5">
      <label className="flex items-center justify-between gap-2 text-[11px] text-stone-300" htmlFor={`staerd-allra-${myndId}`}>
        <span className="font-semibold">Stærð allra merkja</span>
        <span data-staerd-gildi className="tabular-nums text-stone-400">
          {Math.round(T)} px · {fjoldi} merki
        </span>
      </label>
      <input
        id={`staerd-allra-${myndId}`}
        type="range"
        min={STAERD_MIN}
        max={STAERD_MAX}
        step={1}
        value={Math.round(T)}
        aria-label="Stærð allra merkja"
        title="Stækkar/minnkar öll tæki og merki hæðarinnar í einu (hvert um sína miðju) — sama tala og „Stærð tákna“ í Teikning. ⌘Z afturkallar dráttinn."
        onChange={(e) => draga(Number(e.target.value))}
        onPointerUp={ljuka}
        onKeyUp={ljuka}
        onBlur={ljuka}
        className="h-1 w-full cursor-pointer accent-[#FE653F]"
      />
      <div className="flex gap-1">
        <button type="button" className={`${takki} flex-1`} title="Öll merki 15 % minni" onClick={() => skref((u) => skalaAllaHaed(useBoardStore.getState().objects, u, skrefStaerdar(u.T0, -1)))}>
          <Minus className="size-3" />
          Minni
        </button>
        <button type="button" className={`${takki} flex-1`} title="Öll merki 15 % stærri" onClick={() => skref((u) => skalaAllaHaed(useBoardStore.getState().objects, u, skrefStaerdar(u.T0, 1)))}>
          <Plus className="size-3" />
          Stærri
        </button>
        <button
          type="button"
          className={`${takki} flex-1`}
          title="Öll merki jafnstór — í stærð hæðarinnar (eigin stærðir einstakra merkja hverfa)"
          onClick={() => skref((u) => jafnaHaed(useBoardStore.getState().objects, u))}
        >
          <Equal className="size-3" />
          Jafna
        </button>
      </div>
      <div className="text-[10px] leading-snug text-stone-500">Eins og „Stærð tákna“ í Teikning — vistast á hæðina með „Vista í úttekt“.</div>
    </div>
  );
}

/** Stærð VALINNA tákna (eiginleikaspjaldið): sleðinn setur öll valin tákn í sömu stærð (Teikning-px á tengdri hæð),
 * Minni/Stærri skala þau um 15 % — eitt ⌘Z-skref í hvert sinn. */
export function StaerdValinna({ takn }: { takn: SymbolObject[] }) {
  const objects = useBoardStore((s) => s.objects);
  const drag = useRef(false);
  if (!takn.length) return null;
  const ids = takn.map((t) => t.id);
  const e = einingTakns(objects, takn[0]);
  const gildi = Math.round(e ? takn[0].size / e : takn[0].size);
  const min = e ? STAERD_MIN : 4;
  const max = e ? STAERD_MAX : Math.max(200, gildi * 2);

  /** Eldri tengingar uppfærðar í sama skrefi (svo stærðin vistist eins og hún sést). */
  const byrja = () => {
    const st = useBoardStore.getState();
    st.commitHistory();
    setja(eldriTengingarValinna(st.objects, ids, (h) => haedTUttektar(h)));
  };
  const draga = (v: number) => {
    if (!drag.current) {
      drag.current = true;
      byrja();
    }
    setja(setjaStaerdValinna(useBoardStore.getState().objects, ids, v));
  };
  const ljuka = () => {
    drag.current = false;
  };
  const skala = (f: number) => {
    byrja();
    setja(skalaValin(useBoardStore.getState().objects, ids, f));
  };

  return (
    <div data-staerd-valinna className="space-y-1.5">
      <label className="flex items-center justify-between text-[11px] font-medium tracking-wide text-stone-400" htmlFor="staerd-valinna">
        <span>Stærð{takn.length > 1 ? ` · ${takn.length} tákn` : ""}</span>
        <span data-staerd-gildi className="tabular-nums text-stone-300">
          {gildi} px{e ? "" : " (borð)"}
        </span>
      </label>
      <input
        id="staerd-valinna"
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.min(max, Math.max(min, gildi))}
        aria-label={takn.length > 1 ? "Stærð valinna tákna" : "Stærð tákns"}
        title={
          (takn.length > 1 ? "Öll valin tákn fá þessa stærð" : "Stærð táknsins") +
          (e ? " — í px eins og „Stærð tákna“ í Teikning; vistast sem eigin stærð merkisins" : "") +
          ". ⌘Z afturkallar."
        }
        onChange={(ev) => draga(Number(ev.target.value))}
        onPointerUp={ljuka}
        onKeyUp={ljuka}
        onBlur={ljuka}
        className="h-1 w-full cursor-pointer accent-[#FE653F]"
      />
      <div className="flex gap-1">
        <button type="button" className={`${takki} flex-1`} onClick={() => skala(0.85)} title="Valin tákn 15 % minni">
          <Minus className="size-3" />
          Minni
        </button>
        <button type="button" className={`${takki} flex-1`} onClick={() => skala(1.15)} title="Valin tákn 15 % stærri">
          <Plus className="size-3" />
          Stærri
        </button>
      </div>
    </div>
  );
}
