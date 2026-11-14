"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X, Check, Cloud, Download, Loader2 } from "lucide-react";
import {
  listBoards,
  listBoardsLocal,
  erBordOfflineTilbuid,
  g_oraBordOfflineTilbuid,
  getCurrentBoardId,
  type BoardListEntry,
} from "../../lib/board/persistence";
import { toast } from "sonner";

// Forsíða TurboPaint (Agnar 2026-11-14: „mættir alveg bæta við einhverri forsíðu með fyrri verkefnum. Vill geta
// opnað það sem ég vil þaðan"). Einfaldur, síma-vænn listi yfir borðin — stórir smelltakkar, leit, offline ✓.
// Opnast sjálfkrafa á síma við ræsingu (nema djúptengill sé í slóðinni) og með Verkefni-hnappnum hvenær sem er.

type OfflineStada = "nei" | "saekja" | "ja" | "villa";

function dags(iso: string) {
  return iso ? iso.slice(0, 10).split("-").reverse().join(".") : "";
}

export function Verkefni({
  onOpen,
  onNew,
  onClose,
  maLoka,
}: {
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Loka forsíðunni án þess að velja (aðeins ef borð er þegar opið). */
  onClose: () => void;
  maLoka: boolean;
}) {
  const [bord, setBord] = useState<BoardListEntry[] | null>(null);
  const [leit, setLeit] = useState("");
  const [offline, setOffline] = useState<Record<string, OfflineStada>>({});

  useEffect(() => {
    // Staðbundni listinn birtist strax; ský-listinn sameinast þegar hann kemur.
    void listBoardsLocal().then((l) => setBord((prev) => (prev && prev.length && !l.length ? prev : l)));
    void listBoards().then((all) => {
      setBord(all);
      for (const b of all) {
        void erBordOfflineTilbuid(b.id).then((t) =>
          setOffline((o) => (o[b.id] === "saekja" ? o : { ...o, [b.id]: t ? "ja" : o[b.id] ?? "nei" }))
        );
      }
    });
  }, []);

  const synileg = useMemo(() => {
    const q = leit.trim().toLowerCase();
    const l = bord ?? [];
    if (!q) return l;
    return l.filter((b) => (b.name || "").toLowerCase().includes(q));
  }, [bord, leit]);

  const saekjaOffline = async (id: string) => {
    setOffline((o) => ({ ...o, [id]: "saekja" }));
    try {
      const r = await g_oraBordOfflineTilbuid(id);
      if (r.ok) {
        setOffline((o) => ({ ...o, [id]: "ja" }));
        toast.success("Tilbúið án nets");
      } else {
        setOffline((o) => ({ ...o, [id]: "villa" }));
        toast.error(r.vantar < 0 ? "Náði ekki í borðið — ertu án nets?" : `Vantar ${r.vantar} myndir — reyndu með neti`);
      }
    } catch {
      setOffline((o) => ({ ...o, [id]: "villa" }));
      toast.error("Eitthvað fór úrskeiðis");
    }
  };

  const núverandi = getCurrentBoardId();

  return (
    <div className="tp-root dark absolute inset-0 z-50 flex flex-col bg-[#0f1117] text-stone-100">
      {/* Haus */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#FE653F] text-lg font-bold text-white">T</div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold tracking-tight">Verkefni</div>
          <div className="text-xs text-stone-500">TurboPaint · veldu teikningu til að opna</div>
        </div>
        {maLoka ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            title="Til baka í teikninguna"
            className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      {/* Leit */}
      <div className="shrink-0 px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1d2e] px-3">
          <Search className="size-4 shrink-0 text-stone-500" />
          <input
            value={leit}
            onChange={(e) => setLeit(e.target.value)}
            placeholder="Leita að verkefni…"
            className="min-w-0 flex-1 bg-transparent py-3 text-base text-stone-100 outline-none placeholder:text-stone-500"
            enterKeyHint="search"
          />
          {leit ? (
            <button type="button" onClick={() => setLeit("")} aria-label="Hreinsa leit" className="text-stone-500 hover:text-white">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Listinn */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Nýtt verkefni */}
          <button
            type="button"
            onClick={onNew}
            className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-[#14172200] px-4 py-3 text-left hover:border-[#FE653F]/60 hover:bg-white/5 active:translate-y-px"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FE653F]/15 text-[#FE653F]">
              <Plus className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-stone-100">Nýtt verkefni</div>
              <div className="text-xs text-stone-500">Byrja á auðu borði</div>
            </div>
          </button>

          {bord === null ? (
            <div className="col-span-full flex items-center justify-center gap-2 py-10 text-stone-500">
              <Loader2 className="size-4 animate-spin" /> Sæki verkefni…
            </div>
          ) : synileg.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-stone-500">
              {leit ? "Ekkert verkefni fannst." : "Engin verkefni enn — búðu til nýtt."}
            </div>
          ) : (
            synileg.map((b) => {
              const st = offline[b.id];
              return (
                <div
                  key={b.id}
                  className="group relative flex min-h-[4.5rem] items-stretch rounded-2xl border border-white/10 bg-[#1a1d2e] hover:border-white/25"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(b.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:translate-y-px"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-sm font-bold text-stone-300">
                      {(b.name || "?").trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-stone-100">{b.name || "Ónefnt verkefni"}</span>
                        {b.id === núverandi ? (
                          <span className="shrink-0 rounded-full bg-[#FE653F]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#FE653F]">opið</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                        <span>{dags(b.updatedAt)}</span>
                        {b.remote ? <Cloud className="size-3" /> : null}
                        {st === "ja" ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-500">
                            <Check className="size-3" /> án nets
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  {/* Sækja fyrir offline (sama og í borðalistanum) */}
                  <button
                    type="button"
                    disabled={st === "saekja"}
                    onClick={() => st !== "saekja" && void saekjaOffline(b.id)}
                    title={
                      st === "ja"
                        ? "Tilbúið án nets (smelltu til að uppfæra)"
                        : st === "villa"
                          ? "Náðist ekki alveg — reyndu aftur"
                          : "Sækja fyrir offline — geymir í símann"
                    }
                    aria-label="Sækja fyrir offline"
                    className={
                      "flex w-12 shrink-0 items-center justify-center rounded-r-2xl border-l border-white/10 hover:bg-white/5 " +
                      (st === "ja" ? "text-emerald-500" : st === "villa" ? "text-amber-500" : "text-stone-400")
                    }
                  >
                    {st === "saekja" ? <Loader2 className="size-4 animate-spin" /> : st === "ja" ? <Check className="size-4" /> : <Download className="size-4" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
