"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Cloud, Download, Loader2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  eydaBordi,
  g_oraBordOfflineTilbuid,
  getCurrentBoardId,
  listBoards,
  listBoardsLocal,
  offlineStadaBords,
  type BoardListEntry,
} from "../../lib/board/persistence";
import { athugaSync, synUrGeymdu, type SyncKort, type SyncSyn } from "../../lib/board/sync-saekja";
import { SYNC_HEITI, type SyncLjos } from "../../lib/board/sync-stada";

// Forsíða TurboPaint (Agnar 2026-11-14: „mættir alveg bæta við einhverri forsíðu með fyrri verkefnum. Vill geta
// opnað það sem ég vil þaðan"). Einfaldur, síma-vænn listi yfir borðin — stórir smelltakkar, leit, offline ✓.
// Opnast sjálfkrafa á síma við ræsingu (nema djúptengill sé í slóðinni) og með Verkefni-hnappnum hvenær sem er.
//
// Sync-ljós (Agnar 2026-11-15: „Setja rautt eða grænt ljós á hver.. ég eyði þá líklegast þeim úreltu"): hvert kort ber
// ljós um stöðu borðsins gagnvart úttektarteikningunni (lib/board/sync-stada.ts) — rautt úrelt, gult óvistuð vinna á
// borði, grænt í sync, grátt ótengt — og þaðan má sækja ferska útgáfu úr úttekt eða eyða borðinu.

/** „eldri" = borðið er geymt í tækinu, en skýið á nýrri útgáfu (án nets opnaðist sú eldri). */
type OfflineStada = "nei" | "saekja" | "ja" | "villa" | "eldri";
type Sia = "allt" | SyncLjos;

const LITIR: Record<SyncLjos, { punktur: string; rond: string; texti: string }> = {
  graent: { punktur: "bg-emerald-500", rond: "border-l-emerald-500", texti: "text-emerald-400" },
  rautt: { punktur: "bg-red-500", rond: "border-l-red-500", texti: "text-red-400" },
  gult: { punktur: "bg-amber-400", rond: "border-l-amber-400", texti: "text-amber-300" },
  gratt: { punktur: "bg-stone-500", rond: "border-l-stone-600", texti: "text-stone-400" },
};
const SIUR: SyncLjos[] = ["rautt", "gult", "graent", "gratt"];

function dags(iso: string) {
  return iso ? iso.slice(0, 10).split("-").reverse().join(".") : "";
}

function klukkan(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? `kl. ${hm}` : `${dags(d.toISOString())} kl. ${hm}`;
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
  const [sync, setSync] = useState<SyncSyn>({ kl: null, bord: new Map() });
  const [syncStada, setSyncStada] = useState<"kyrr" | "athuga" | "villa">("kyrr");
  const [sia, setSia] = useState<Sia>("allt");
  const [opidKort, setOpidKort] = useState<string | null>(null);
  const [eydir, setEydir] = useState<string | null>(null);

  const keyraSync = useCallback(async (listi: BoardListEntry[]) => {
    setSyncStada("athuga");
    try {
      setSync(await athugaSync(listi));
      setSyncStada("kyrr");
    } catch {
      // Án nets eða gagnagrunnur svarar ekki: síðasta þekkta staða stendur
      setSyncStada("villa");
    }
  }, []);

  useEffect(() => {
    // Staðbundni listinn birtist strax; ský-listinn sameinast þegar hann kemur.
    void listBoardsLocal().then((l) => {
      setBord((prev) => (prev && prev.length && !l.length ? prev : l));
      setSync((s) => (s.bord.size ? s : synUrGeymdu(l)));
    });
    void listBoards().then((all) => {
      setBord(all);
      setSync(synUrGeymdu(all));
      for (const b of all) {
        void offlineStadaBords(b.id, b.updatedAt).then((s) =>
          setOffline((o) => (o[b.id] === "saekja" ? o : { ...o, [b.id]: s === "nei" ? (o[b.id] === "villa" ? "villa" : "nei") : s }))
        );
      }
      if (typeof navigator === "undefined" || navigator.onLine) void keyraSync(all);
    });
  }, [keyraSync]);

  const talning = useMemo(() => {
    const t: Record<SyncLjos, number> = { graent: 0, rautt: 0, gult: 0, gratt: 0 };
    for (const b of bord ?? []) {
      const k = sync.bord.get(b.id);
      if (k) t[k.ljos]++;
    }
    return t;
  }, [bord, sync]);

  const synileg = useMemo(() => {
    const q = leit.trim().toLowerCase();
    return (bord ?? []).filter((b) => {
      if (q && !(b.name || "").toLowerCase().includes(q)) return false;
      if (sia !== "allt" && sync.bord.get(b.id)?.ljos !== sia) return false;
      return true;
    });
  }, [bord, leit, sia, sync]);

  const saekjaOffline = async (id: string) => {
    setOffline((o) => ({ ...o, [id]: "saekja" }));
    try {
      const r = await g_oraBordOfflineTilbuid(id);
      if (r.ok) {
        setOffline((o) => ({ ...o, [id]: "ja" }));
        toast.success(r.uppfaert ? "Nýjasta útgáfan sótt — tilbúið án nets" : "Tilbúið án nets");
      } else {
        setOffline((o) => ({ ...o, [id]: "villa" }));
        toast.error(r.vantar < 0 ? "Náði ekki í borðið — ertu án nets?" : `Vantar ${r.vantar} myndir — reyndu með neti`);
      }
    } catch {
      setOffline((o) => ({ ...o, [id]: "villa" }));
      toast.error("Eitthvað fór úrskeiðis");
    }
  };

  /** Eyðing er mjúk (röðin stendur í skýinu með deleted=true), en borðið hverfur úr öllum listum á öllum tækjum. */
  const eyda = async (b: BoardListEntry, kort: SyncKort | undefined) => {
    const nafn = b.name || "Ónefnt verkefni";
    const texti =
      kort?.ljos === "gult"
        ? `⚠️ Á „${nafn}“ er vinna sem hefur EKKI verið vistuð í úttekt:\n\n• ${[...kort.mat.gul].join("\n• ")}\n\nEyða borðinu samt? Það hverfur af öllum tækjum.`
        : kort?.ljos === "rautt"
          ? `Eyða úrelta borðinu „${nafn}“?\n\nÚttektarteikningin sjálf er ósnert — aðeins þetta TurboPaint-borð hverfur (af öllum tækjum).`
          : kort?.ljos === "graent"
            ? `„${nafn}“ er í sync við úttektina. Eyða borðinu samt?\n\nÚttektarteikningin er ósnert — borðið hverfur af öllum tækjum.`
            : `Eyða „${nafn}“?\n\nBorðið er ekki tengt úttekt — það sem er á því er hvergi annars staðar. Það hverfur af öllum tækjum.`;
    if (!window.confirm(texti)) return;
    setEydir(b.id);
    try {
      await eydaBordi(b.id);
      const eftir = (bord ?? []).filter((x) => x.id !== b.id);
      setBord(eftir);
      setSync(synUrGeymdu(eftir)); // eldra afrit getur orðið eina eintakið → ljósin reiknuð upp á nýtt
      toast.success("Borðinu var eytt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Náði ekki að eyða borðinu");
    } finally {
      setEydir(null);
    }
  };

  /** Úrelt borð: endurbyggja það úr úttektarteikningunni — sama leið og þegar hæð er opnuð úr Slökkvitæki-appinu. */
  const saekjaFerskt = (b: BoardListEntry, kort: SyncKort) => {
    if (kort.mat.cid == null || !kort.mat.haedIds[0]) return;
    const ovistad = kort.mat.gul.length ? `\n\n⚠️ Óvistuð vinna á borðinu hverfur líka:\n• ${kort.mat.gul.join("\n• ")}` : "";
    const ok = window.confirm(
      `Sækja ferska útgáfu af „${b.name}“ úr úttektinni?\n\nBorðið verður endurbyggt úr úttektarteikningunni. Það sem er aðeins á þessu borði (athugasemdir, mælingar) hverfur.${ovistad}`
    );
    if (!ok) return;
    window.location.assign(`${window.location.pathname}?uttekt=${kort.mat.cid}&haed=${encodeURIComponent(kort.mat.haedIds[0])}`);
  };

  const núverandi = getCurrentBoardId();
  const medStodu = sync.bord.size > 0;

  return (
    <div className="tp-root dark absolute inset-0 z-50 flex flex-col bg-[#0f1117] text-stone-100">
      {/* Haus */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#FE653F] text-lg font-bold text-white">T</div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold tracking-tight">Verkefni</div>
          <div className="text-xs text-stone-400">TurboPaint · veldu teikningu til að opna</div>
        </div>
        {maLoka ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            title="Til baka í teikninguna"
            className="flex size-11 items-center justify-center rounded-full text-stone-300 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      {/* Leit */}
      <div className="shrink-0 px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a1d2e] px-3">
          <Search className="size-4 shrink-0 text-stone-400" />
          <input
            value={leit}
            onChange={(e) => setLeit(e.target.value)}
            placeholder="Leita að verkefni…"
            className="min-w-0 flex-1 bg-transparent py-3 text-base text-stone-100 outline-none placeholder:text-stone-500"
            enterKeyHint="search"
          />
          {leit ? (
            <button type="button" onClick={() => setLeit("")} aria-label="Hreinsa leit" className="flex size-9 items-center justify-center text-stone-400 hover:text-white">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Sync-síur: staða borðanna gagnvart úttektarteikningunni */}
      <div className="shrink-0 px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" data-sync-siur>
          <button
            type="button"
            onClick={() => setSia("allt")}
            aria-pressed={sia === "allt"}
            className={
              "flex h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium " +
              (sia === "allt" ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-stone-300 hover:bg-white/5")
            }
          >
            Allt {bord ? bord.length : ""}
          </button>
          {medStodu
            ? SIUR.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setSia(sia === l ? "allt" : l)}
                  aria-pressed={sia === l}
                  title={SYNC_HEITI[l]}
                  data-sync-sia={l}
                  className={
                    "flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium " +
                    (sia === l ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-stone-300 hover:bg-white/5")
                  }
                >
                  <span className={`size-2.5 rounded-full ${LITIR[l].punktur}`} aria-hidden />
                  <span className="max-sm:hidden">{SYNC_HEITI[l]}</span>
                  <span>{talning[l]}</span>
                </button>
              ))
            : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-xs text-stone-400" data-sync-stada>
            {syncStada === "athuga"
              ? "Ber borðin saman við úttektarteikningarnar…"
              : syncStada === "villa"
                ? `Náði ekki að athuga stöðuna (án nets?)${sync.kl ? ` — síðast athugað ${klukkan(sync.kl)}` : ""}`
                : sync.kl
                  ? `Staða gagnvart úttekt athuguð ${klukkan(sync.kl)}`
                  : ""}
          </div>
          <button
            type="button"
            onClick={() => bord && void keyraSync(bord)}
            disabled={!bord || syncStada === "athuga"}
            aria-label="Athuga stöðu gagnvart úttekt"
            title="Athuga stöðu borðanna gagnvart úttektarteikningunum"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-300 hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            <RefreshCw className={"size-4 " + (syncStada === "athuga" ? "animate-spin" : "")} />
          </button>
        </div>
      </div>

      {/* Listinn */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        {/* `[display:grid]` en ekki `grid`: globals.css (markaðssíðan) á hnattræna `.grid { margin-top: 44px; gap: 18px }`
            sem er ólagskipt og vinnur því á Tailwind-klasanum — listinn sat 44 px of neðarlega. */}
        <div className="[display:grid] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Nýtt verkefni */}
          {sia === "allt" && !leit ? (
            <button
              type="button"
              onClick={onNew}
              className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-left hover:border-[#FE653F]/60 hover:bg-white/5 active:translate-y-px"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FE653F]/15 text-[#FE653F]">
                <Plus className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-stone-100">Nýtt verkefni</div>
                <div className="text-xs text-stone-400">Byrja á auðu borði</div>
              </div>
            </button>
          ) : null}

          {bord === null ? (
            <div className="col-span-full flex items-center justify-center gap-2 py-10 text-stone-400">
              <Loader2 className="size-4 animate-spin" /> Sæki verkefni…
            </div>
          ) : synileg.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-stone-400">
              {leit || sia !== "allt" ? "Ekkert verkefni fannst." : "Engin verkefni enn — búðu til nýtt."}
            </div>
          ) : (
            synileg.map((b) => {
              const st = offline[b.id];
              const kort = sync.bord.get(b.id);
              const litur = kort ? LITIR[kort.ljos] : null;
              const opid = opidKort === b.id;
              const fyrsta = kort?.astaedur[0];
              const fleiri = kort ? kort.astaedur.length - 1 : 0;
              // Blandað: úttektin er nýrri (rauðar ástæður) EN á borðinu er líka óvistuð vinna (gular) → ljósið er gult
              const blandad = !!kort && kort.ljos === "gult" && (kort.mat.raud.length > 0 || kort.eldraAfrit);
              const heiti = kort ? (blandad ? "Úrelt + óvistað" : SYNC_HEITI[kort.ljos]) : "";
              const maFerskt = !!kort && (kort.ljos === "rautt" || blandad) && kort.mat.maEndurbyggja && !kort.eldraAfrit;
              const utvikkanlegt = !!kort && (kort.astaedur.length > 0 || kort.ljos === "gult" || kort.ljos === "rautt");
              return (
                <div
                  key={b.id}
                  data-bord-kort={b.id}
                  data-sync-ljos={kort?.ljos ?? ""}
                  className={
                    "group relative flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d2e] hover:border-white/25 " +
                    (litur ? `border-l-[3px] ${litur.rond}` : "")
                  }
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button
                      type="button"
                      onClick={() => onOpen(b.id)}
                      className="flex min-h-[4.25rem] min-w-0 items-center gap-3 px-4 py-3 text-left active:translate-y-px"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-sm font-bold text-stone-300">
                        {(b.name || "?").trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Tvær línur, ekki klippt í eina: hæðin („— 2. hæð") er aftast í nafninu og er það sem aðgreinir borðin */}
                        <div className="flex items-start gap-1.5">
                          <span className="line-clamp-2 min-w-0 break-words font-semibold leading-snug text-stone-100">{b.name || "Ónefnt verkefni"}</span>
                          {b.id === núverandi ? (
                            <span className="shrink-0 rounded-full bg-[#FE653F]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#ff8a6b]">opið</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-400">
                          <span>{dags(b.updatedAt)}</span>
                          {b.remote ? <Cloud className="size-3" /> : null}
                          {st === "ja" ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-400">
                              <Check className="size-3" /> án nets
                            </span>
                          ) : st === "eldri" ? (
                            <span className="text-amber-300" title="Síminn geymir eldri útgáfu — ýttu á ⬇ til að sækja þá nýjustu">
                              eldri útgáfa í síma
                            </span>
                          ) : null}
                          {kort?.mat.taeki && kort.mat.taeki.virk > 0 ? (
                            <span title="Skráð tæki staðarins sem eru komin á úttektarteikninguna">
                              {kort.mat.taeki.aTeikningu}/{kort.mat.taeki.virk} tæki á teikningu
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                    {kort && litur ? (
                      <div className="border-t border-white/5">
                        <button
                          type="button"
                          disabled={!utvikkanlegt}
                          onClick={() => setOpidKort(opid ? null : b.id)}
                          aria-expanded={opid}
                          className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-xs disabled:cursor-default"
                        >
                          <span className={`size-2.5 shrink-0 rounded-full ${litur.punktur}`} aria-hidden />
                          <span className={`shrink-0 font-semibold ${litur.texti}`}>{heiti}</span>
                          {fyrsta && !opid ? (
                            <span className="min-w-0 flex-1 truncate text-stone-300">
                              · {fyrsta}
                              {fleiri > 0 ? ` (+${fleiri})` : ""}
                            </span>
                          ) : (
                            <span className="flex-1" />
                          )}
                          {utvikkanlegt ? <ChevronDown className={"size-4 shrink-0 text-stone-400 " + (opid ? "rotate-180" : "")} /> : null}
                        </button>
                        {opid ? (
                          <div className="space-y-2 px-4 pb-3 text-xs text-stone-300">
                            {kort.astaedur.length ? (
                              <ul className="list-disc space-y-0.5 pl-4">
                                {kort.astaedur.map((a, i) => (
                                  <li key={i}>{a}</li>
                                ))}
                              </ul>
                            ) : null}
                            {kort.ljos === "gult" ? (
                              <p className="text-amber-200">
                                {blandad
                                  ? "Borðið er úrelt miðað við úttektina, en á því er líka vinna sem er ekki í úttektinni. Skoðaðu hana áður en þú eyðir borðinu eða sækir ferska útgáfu."
                                  : "Á borðinu er vinna sem er ekki í úttektinni. Opnaðu borðið og veldu „Vista í úttekt“ til að halda henni — eða eyddu borðinu ef hún skiptir ekki máli."}
                              </p>
                            ) : null}
                            {kort.ljos === "rautt" ? (
                              <p>Úttektarteikningin er sannleikurinn og er ósnert — þetta borð er eldri útgáfa. Óhætt að eyða.</p>
                            ) : null}
                            {maFerskt ? (
                              <button
                                type="button"
                                onClick={() => saekjaFerskt(b, kort)}
                                className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 font-semibold text-stone-100 hover:bg-white/15"
                              >
                                <RefreshCw className="size-4" /> Sækja ferska útgáfu úr úttekt
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {/* Aðgerðir: sækja fyrir offline · eyða */}
                  <div className="flex w-12 shrink-0 flex-col border-l border-white/10">
                    <button
                      type="button"
                      disabled={st === "saekja"}
                      onClick={() => st !== "saekja" && void saekjaOffline(b.id)}
                      title={
                        st === "ja"
                          ? "Tilbúið án nets (smelltu til að uppfæra)"
                          : st === "villa"
                            ? "Náðist ekki alveg — reyndu aftur"
                            : st === "eldri"
                              ? "Eldri útgáfa í símanum — smelltu til að sækja þá nýjustu"
                              : "Sækja fyrir offline — geymir í símann"
                      }
                      aria-label="Sækja fyrir offline"
                      className={
                        "flex min-h-11 flex-1 items-center justify-center hover:bg-white/5 " +
                        (st === "ja" ? "text-emerald-400" : st === "villa" || st === "eldri" ? "text-amber-400" : "text-stone-300")
                      }
                    >
                      {st === "saekja" ? <Loader2 className="size-4 animate-spin" /> : st === "ja" ? <Check className="size-4" /> : <Download className="size-4" />}
                    </button>
                    <button
                      type="button"
                      disabled={eydir === b.id}
                      onClick={() => void eyda(b, kort)}
                      title="Eyða borðinu (af öllum tækjum)"
                      aria-label="Eyða borði"
                      data-eyda-bordi
                      className="flex min-h-11 flex-1 items-center justify-center border-t border-white/10 text-stone-400 hover:bg-red-500/10 hover:text-red-400"
                    >
                      {eydir === b.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
