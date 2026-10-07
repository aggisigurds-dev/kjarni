"use client";

import { teiknaEldvegg } from "../../lib/board/veggja-ritill-stada";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SYMBOL_DRAG_TYPE } from "../../lib/board/markup-kit";
import { getSymbol, symbolPaint } from "../../lib/board/symbols";
import {
  getSymbolSettings,
  loadSymbolSettings,
  subscribeSymbolSettings,
} from "../../lib/board/symbol-settings";
import { useBoardStore } from "../../lib/board/store";
import { cn } from "../../lib/utils";
import { SymbolManager } from "./SymbolManager";
import { taknIHamSkipt, useHamur } from "../../lib/board/hamir";
import { MerkiTakn } from "./MerkiTakn";
import { afvopna } from "../../lib/board/uttekt-gogn";

export function SymbolTray() {
  const style = useBoardStore((s) => s.style);
  const setStyle = useBoardStore((s) => s.setStyle);
  const setTool = useBoardStore((s) => s.setTool);
  const [managerOpen, setManagerOpen] = useState(false);
  // Endurteiknar þegar stillingarnar breytast — líka þegar þær koma úr Supabase
  // eftir að slán er þegar teiknuð.
  const [, bump] = useState(0);
  useEffect(() => {
    const off = subscribeSymbolSettings(() => bump((n) => n + 1));
    void loadSymbolSettings();
    return off;
  }, []);
  const settings = getSymbolSettings();
  // Innbyggða úrvalið fyrst, svo táknin sem Agnar bjó til sjálfur — þau eiga
  // alltaf heima í slánni, annars fyndust þau hvergi eftir að þau voru búin til.
  // Hamurinn ræður hvaða tákn standa í slánni (lib/board/hamir.ts); í Teikningarham er sláin falin.
  const hamur = useHamur((s) => s.hamur);
  const iHam = taknIHamSkipt(hamur, settings.custom.map((c) => c.id));
  const synilegt = (id: string) => !settings.overrides[id]?.hidden;
  if (!iHam) return null;
  // Merkjasafn Teikning-gluggans fyrst; aukatákn TurboPaint standa sér á eftir (þau vistast ekki í úttektina).
  const teikning = iHam.teikning.filter(synilegt);
  const auka = iHam.auka.filter(synilegt);
  const visible = [...teikning, ...auka];

  return (
    <div className="pointer-events-auto flex max-w-[min(96vw,820px)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-2 py-1.5 shadow-2xl">
      <button
        type="button"
        onClick={() => setManagerOpen(true)}
        title="Táknin — listi, eigin myndir og hvaða tákn sjást"
        className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
      >
        <span className="text-[13px] leading-none">⚙</span>
        <span className="hidden sm:inline">Táknin</span>
      </button>
      <span className="hidden shrink-0 px-1 text-[10px] font-medium tracking-wide text-white/45 sm:inline">
        DRAGÐU TÁKN
      </span>
      {visible.length === 0 ? (
        <span className="shrink-0 px-2 text-[11px] text-white/40">
          Öll tákn falin — opnaðu ⚙ Táknin
        </span>
      ) : null}
      {visible.map((id, i) => {
        const s = getSymbol(id);
        const skil =
          i === teikning.length && teikning.length > 0 ? (
            <span
              key="skil-auka"
              title="Aukatákn TurboPaint — Teikning-glugginn á þau ekki og þau vistast ekki í úttektina"
              className="ml-1 shrink-0 border-l border-white/15 pl-2 text-[9.5px] font-medium tracking-wide text-white/40"
            >
              AUKA
            </span>
          ) : null;
        const c = symbolPaint(s);
        const ov = settings.overrides[id] ?? {};
        const active = style.symbolId === id;
        return [
          skil,
          <button
            key={id}
            type="button"
            draggable
            data-takn={id}
            title={`${s.name}${s.teikn ? "" : " (aukatákn TurboPaint)"} — dragðu inn á plönið`}
            onDragStart={(e) => {
              e.dataTransfer.setData(SYMBOL_DRAG_TYPE, id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              // Laust tákn úr slánni — tæki/merki sem var valið í tækjalistanum sleppur.
              afvopna();
              setStyle({ symbolId: id });
              if (id === "firewall") {
                // Eldveggur = veggur með tegund EI-60, dreginn eins og „+ Teikna vegg" (Agnar 07.10.2026).
                teiknaEldvegg("ei60");
                toast.message("Eldveggur EI-60: haltu inni og dragðu eftir veggnum — slepptu til að ljúka. EI-30: veldu vegginn og ýttu á 5.");
              } else {
                setTool("symbol");
              }
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] text-stone-200",
              active ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/8"
            )}
          >
            {s.teikn ? (
              <MerkiTakn lykill={s.teikn} size={24} />
            ) : (
            <span
              className="flex size-6 items-center justify-center overflow-hidden rounded-sm text-[8px] font-bold shadow-sm"
              style={ov.imageUrl ? undefined : { background: c.bg, color: c.fg }}
            >
              {ov.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ov.imageUrl}
                  alt=""
                  draggable={false}
                  className="size-full"
                  style={{ objectFit: ov.fit === "cover" ? "cover" : "contain" }}
                />
              ) : (
                s.short.slice(0, 2)
              )}
            </span>
            )}
            <span className="hidden lg:inline">{s.name}</span>
          </button>,
        ];
      })}
      <SymbolManager open={managerOpen} onOpenChange={setManagerOpen} />
    </div>
  );
}
