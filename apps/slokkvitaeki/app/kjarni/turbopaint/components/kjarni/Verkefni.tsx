"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Building2, Check, ChevronDown, Cloud, Download, ExternalLink, Eye, FolderOpen, LayoutGrid, Loader2, MapPin, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { HeimilisfangLeit, type EignVal, type TeikningVal } from "./HeimilisfangLeit";
import { skodunarSlod } from "../../lib/board/skodun";
import { greiningSlod, saekjaSafn, svaediTillogur, vistaISafn, type SafnRod } from "../../lib/board/teikningasafn";
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
//
// Ljóst útlit + „Teikningar eftir heimilisfangi" (Agnar 17.11.2026: „mátt setja líka ljósari liti þarna og hönnun" ·
// „geta sett inn heimilisfang og skoðað teikningar, án þess að þurfa að búa til borð" · „haka kannski við nokkrar
// teikningar og þær opnist saman á einu borði"). Skoðun býr ekki til borð; aðeins „Opna á nýju borði" gerir það.
//
// Greining fasteignar + Vista á fasteign (Agnar 17.11.2026): „Greining fasteignar" opnar sömu viðbót og í Slökkvitæki-
// appinu (451: samantekt, byggingarupplýsingar, „Lesa skjölin" = djúpgreining) í nýjum flipa — á forsíðunni tóma, við valda
// eign með lóðina. „Vista á fasteign" setur blöð í teikningasafn lóðarinnar (lib/board/teikningasafn.ts — sama safn og
// „Vista í safn" þar). Ekkert annað er skrifað.

/** „eldri" = borðið er geymt í tækinu, en skýið á nýrri útgáfu (án nets opnaðist sú eldri). */
type OfflineStada = "nei" | "saekja" | "ja" | "villa" | "eldri";
type Sia = "allt" | SyncLjos;
type Flipi = "bord" | "teikningar";

const LITIR: Record<SyncLjos, { punktur: string; rond: string; texti: string }> = {
  graent: { punktur: "bg-emerald-500", rond: "border-l-emerald-500", texti: "text-emerald-700" },
  rautt: { punktur: "bg-red-500", rond: "border-l-red-500", texti: "text-red-600" },
  gult: { punktur: "bg-amber-400", rond: "border-l-amber-400", texti: "text-amber-700" },
  gratt: { punktur: "bg-stone-400", rond: "border-l-stone-300", texti: "text-stone-500" },
};

/** Heiti nýs borðs úr eigninni („Barónsstígur 18B (101 Reykjavík)" → „Barónsstígur 18B — teikningar"). */
function bordNafn(eign: string | null | undefined): string {
  const e = (eign || "").split("(")[0].replace(/,.*$/, "").trim();
  return e ? `${e} — teikningar` : "Teikningar";
}
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
  onOpnaTeikningar,
  onClose,
  maLoka,
}: {
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Valdar teikningar saman á nýju borði (nafn = heimilisfangið). */
  onOpnaTeikningar: (val: TeikningVal[], nafn: string) => void;
  /** Loka forsíðunni án þess að velja (aðeins ef borð er þegar opið). */
  onClose: () => void;
  maLoka: boolean;
}) {
  const [flipi, setFlipi] = useState<Flipi>("bord");
  const [valdar, setValdar] = useState<Map<string, TeikningVal>>(() => new Map());
  const [eignVal, setEignVal] = useState<EignVal | null>(null);
  const eign = eignVal?.label ?? null;
  const [forsyn, setForsyn] = useState<TeikningVal | null>(null);
  const [aukid, setAukid] = useState(false);
  // Teikningasafn valinnar lóðar („Vista á fasteign") og vistunarformið (eitt blað úr forskoðun, eða þau völdu).
  const [safn, setSafn] = useState<{ landnr: number; listi: SafnRod[] } | null>(null);
  const [vistaBlod, setVistaBlod] = useState<TeikningVal[] | null>(null);
  const landnrEignar = eignVal && eignVal.landnr > 0 ? eignVal.landnr : null;
  const endurhladaSafn = useCallback(async (landnr: number | null) => {
    if (!landnr) {
      setSafn(null);
      return;
    }
    try {
      setSafn({ landnr, listi: await saekjaSafn(landnr) });
    } catch {
      setSafn({ landnr, listi: [] });
    }
  }, []);
  useEffect(() => {
    void endurhladaSafn(landnrEignar);
  }, [landnrEignar, endurhladaSafn]);
  const iSafni = (slod: string) => (safn?.listi ?? []).filter((r) => r.slod === slod).map((r) => r.svaedi || "Óflokkað");
  const skiptaVali = useCallback((t: TeikningVal) => {
    setValdar((m) => {
      const n = new Map(m);
      if (n.has(t.infoUrl)) n.delete(t.infoUrl);
      else n.set(t.infoUrl, t);
      return n;
    });
  }, []);
  const valdarSet = useMemo(() => new Set(valdar.keys()), [valdar]);
  const opnaValdar = (listi: TeikningVal[]) => {
    if (!listi.length) return;
    onOpnaTeikningar(listi, bordNafn(listi[0].eign ?? eign));
  };
  const skoda = (t: TeikningVal) => {
    // Skoðun: teikningin í hæstu gæðum í TurboPaint, ekkert borð verður til og ekkert vistast (lib/board/skodun.ts).
    window.location.assign(skodunarSlod(t.infoUrl, `${bordNafn(t.eign ?? eign).replace(/ — teikningar$/, "")} · ${t.titill}`, window.location.origin + window.location.pathname));
  };
  useEffect(() => {
    if (!forsyn && !vistaBlod) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (vistaBlod) setVistaBlod(null);
        else setForsyn(null);
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [forsyn, vistaBlod]);
  /** Opnar vistunarformið fyrir blöð sem eiga lóð (landnúmer); blöð annarrar lóðar en þeirrar fyrstu bíða. */
  const vistaAFasteign = (listi: TeikningVal[]) => {
    const med = listi.filter((t) => t.landnr);
    if (!med.length) {
      toast.error("Lóðin (landnúmer) er óþekkt fyrir þessa teikningu — ekki hægt að vista á fasteign.");
      return;
    }
    const ln = med[0].landnr;
    const sama = med.filter((t) => t.landnr === ln);
    if (sama.length < listi.length) toast.message(`${listi.length - sama.length} teikning(ar) af annarri lóð bíða — vistaðu þær sér.`);
    setVistaBlod(sama);
  };
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
    <div className="tp-root absolute inset-0 z-50 flex flex-col bg-[#f6f3ee] text-stone-900" data-verkefni>
      {/* Haus */}
      <div className="flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#FE653F] text-lg font-bold text-white shadow-sm">T</div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold tracking-tight text-stone-900">Verkefni</div>
          <div className="text-xs text-stone-500">TurboPaint · opnaðu borð eða flettu upp teikningum eftir heimilisfangi</div>
        </div>
        {maLoka ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            title="Til baka í teikninguna"
            className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      {/* Flipar: borðin · teikningar eftir heimilisfangi */}
      <div className="shrink-0 px-4 pt-3 sm:px-6">
        <div role="tablist" className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm" data-verkefni-flipar>
          {(
            [
              { id: "bord", heiti: "Borðin mín", takn: <LayoutGrid className="size-4" />, fjoldi: bord ? bord.length : null },
              { id: "teikningar", heiti: "Teikningar eftir heimilisfangi", takn: <MapPin className="size-4" />, fjoldi: valdar.size || null },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={flipi === f.id}
              data-flipi={f.id}
              onClick={() => setFlipi(f.id)}
              className={
                "flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium " +
                (flipi === f.id ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")
              }
            >
              {f.takn}
              <span className={f.id === "teikningar" ? "max-sm:hidden" : ""}>{f.heiti}</span>
              {f.id === "teikningar" ? <span className="sm:hidden">Teikningar</span> : null}
              {f.fjoldi != null ? (
                <span className={"rounded-full px-1.5 text-[11px] " + (flipi === f.id ? "bg-white/20" : f.id === "teikningar" ? "bg-[#FE653F] text-white" : "bg-stone-100 text-stone-600")}>
                  {f.fjoldi}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {flipi === "teikningar" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-28 sm:px-6" data-teikningaleit>
          <HeimilisfangLeit
            inline
            onVelja={() => {}}
            valdar={valdarSet}
            onSkiptaVali={skiptaVali}
            onSkoda={(t) => { setAukid(false); setForsyn(t); }}
            onEign={setEignVal}
            eignTakkar={(e) => (
              <span className="flex shrink-0 items-center gap-1.5">
                {safn && safn.landnr === e.landnr && safn.listi.length ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700" title="Blöð í teikningasafni fasteignarinnar">
                    {safn.listi.length} á fasteign
                  </span>
                ) : null}
                <a
                  href={greiningSlod(e.landnr > 0 ? e.landnr : e.label)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-greining-eignar
                  title="Opnar Greiningu fasteignar í Slökkvitæki-appinu (nýr flipi): samantekt, byggingarupplýsingar, „Lesa skjölin“ og teikningasafnið"
                  className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-800 hover:border-[#FE653F]/60 hover:bg-[#FE653F]/5"
                >
                  <Building2 className="size-3.5 text-[#e2532f]" /> Greining fasteignar <ExternalLink className="size-3 opacity-60" />
                </a>
              </span>
            )}
          />
        </div>
      ) : (
        <>
      {/* Leit */}
      <div className="shrink-0 px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 shadow-sm focus-within:border-[#FE653F] focus-within:ring-2 focus-within:ring-[#FE653F]/20">
          <Search className="size-4 shrink-0 text-stone-400" />
          <input
            value={leit}
            onChange={(e) => setLeit(e.target.value)}
            placeholder="Leita að verkefni…"
            className="min-w-0 flex-1 bg-transparent py-3 text-base text-stone-900 outline-none placeholder:text-stone-400"
            enterKeyHint="search"
          />
          {leit ? (
            <button type="button" onClick={() => setLeit("")} aria-label="Hreinsa leit" className="flex size-9 items-center justify-center text-stone-400 hover:text-stone-800">
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
              (sia === "allt" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50")
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
                    (sia === l ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50")
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
          <div className="min-w-0 flex-1 text-xs text-stone-500" data-sync-stada>
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
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200/60 hover:text-stone-900 disabled:opacity-60"
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
          {/* Nýtt verkefni + teikningar eftir heimilisfangi */}
          {sia === "allt" && !leit ? (
            <>
              <button
                type="button"
                onClick={onNew}
                className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-3 text-left hover:border-[#FE653F]/60 hover:bg-white active:translate-y-px"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FE653F]/12 text-[#e2532f]">
                  <Plus className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-stone-900">Nýtt verkefni</div>
                  <div className="text-xs text-stone-500">Byrja á auðu borði</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFlipi("teikningar")}
                data-opna-teikningaleit
                className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-3 text-left hover:border-sky-500/60 hover:bg-white active:translate-y-px"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <MapPin className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-stone-900">Teikningar eftir heimilisfangi</div>
                  <div className="text-xs text-stone-500">Skoða án borðs · haka við og opna saman</div>
                </div>
              </button>
              <a
                href={greiningSlod()}
                target="_blank"
                rel="noopener noreferrer"
                data-greining-fasteignar
                title="Opnar Greiningu fasteignar í Slökkvitæki-appinu (nýr flipi)"
                className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-3 text-left hover:border-[#FE653F]/60 hover:bg-white active:translate-y-px"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Building2 className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900">
                    Greining fasteignar <ExternalLink className="size-3.5 text-stone-400" />
                  </div>
                  <div className="text-xs text-stone-500">Upplýsingar um eignina · djúpgreining · teikningasafn</div>
                </div>
              </a>
            </>
          ) : null}

          {bord === null ? (
            <div className="col-span-full flex items-center justify-center gap-2 py-10 text-stone-500">
              <Loader2 className="size-4 animate-spin" /> Sæki verkefni…
            </div>
          ) : synileg.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-stone-500">
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
                    "group relative flex items-stretch overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm hover:border-stone-300 hover:shadow-md " +
                    (litur ? `border-l-[3px] ${litur.rond}` : "")
                  }
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button
                      type="button"
                      onClick={() => onOpen(b.id)}
                      className="flex min-h-[4.25rem] min-w-0 items-center gap-3 px-4 py-3 text-left active:translate-y-px"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-sm font-bold text-stone-600">
                        {(b.name || "?").trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Tvær línur, ekki klippt í eina: hæðin („— 2. hæð") er aftast í nafninu og er það sem aðgreinir borðin */}
                        <div className="flex items-start gap-1.5">
                          <span className="line-clamp-2 min-w-0 break-words font-semibold leading-snug text-stone-900">{b.name || "Ónefnt verkefni"}</span>
                          {b.id === núverandi ? (
                            <span className="shrink-0 rounded-full bg-[#FE653F]/12 px-1.5 py-0.5 text-[10px] font-semibold text-[#d9481f]">opið</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                          <span>{dags(b.updatedAt)}</span>
                          {b.remote ? <Cloud className="size-3" /> : null}
                          {st === "ja" ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700">
                              <Check className="size-3" /> án nets
                            </span>
                          ) : st === "eldri" ? (
                            <span className="text-amber-700" title="Síminn geymir eldri útgáfu — ýttu á ⬇ til að sækja þá nýjustu">
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
                      <div className="border-t border-stone-100">
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
                            <span className="min-w-0 flex-1 truncate text-stone-600">
                              · {fyrsta}
                              {fleiri > 0 ? ` (+${fleiri})` : ""}
                            </span>
                          ) : (
                            <span className="flex-1" />
                          )}
                          {utvikkanlegt ? <ChevronDown className={"size-4 shrink-0 text-stone-400 " + (opid ? "rotate-180" : "")} /> : null}
                        </button>
                        {opid ? (
                          <div className="space-y-2 px-4 pb-3 text-xs text-stone-600">
                            {kort.astaedur.length ? (
                              <ul className="list-disc space-y-0.5 pl-4">
                                {kort.astaedur.map((a, i) => (
                                  <li key={i}>{a}</li>
                                ))}
                              </ul>
                            ) : null}
                            {kort.ljos === "gult" ? (
                              <p className="text-amber-800">
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
                                className="flex min-h-11 items-center gap-2 rounded-xl bg-stone-100 px-3 font-semibold text-stone-800 hover:bg-stone-200"
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
                  <div className="flex w-12 shrink-0 flex-col border-l border-stone-200">
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
                        "flex min-h-11 flex-1 items-center justify-center hover:bg-stone-50 " +
                        (st === "ja" ? "text-emerald-600" : st === "villa" || st === "eldri" ? "text-amber-600" : "text-stone-500")
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
                      className="flex min-h-11 flex-1 items-center justify-center border-t border-stone-200 text-stone-400 hover:bg-red-50 hover:text-red-600"
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
        </>
      )}

      {/* Valdar teikningar: opna saman á einu borði */}
      {valdar.size > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-4" data-valdar-teikningar>
          <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-stone-200 bg-white p-2 pl-3 shadow-2xl">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {[...valdar.values()].slice(0, 6).map((t) =>
                t.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={t.infoUrl} src={t.thumb} alt="" className="size-10 shrink-0 rounded-md border border-stone-200 bg-white object-contain" />
                ) : (
                  <span key={t.infoUrl} className="flex size-10 shrink-0 items-center justify-center rounded-md bg-rose-50 text-[10px] font-bold text-rose-700">PDF</span>
                )
              )}
              <span className="ml-1 shrink-0 text-sm font-medium text-stone-800">
                {valdar.size} {valdar.size === 1 ? "teikning valin" : "teikningar valdar"}
              </span>
            </div>
            <button type="button" onClick={() => setValdar(new Map())} className="shrink-0 rounded-xl px-2.5 py-2 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900">
              Hreinsa
            </button>
            <button
              type="button"
              data-vista-valdar-fasteign
              onClick={() => vistaAFasteign([...valdar.values()])}
              title="Setja valdar teikningar í teikningasafn fasteignarinnar (sama safn og í Greiningu fasteignar)"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
            >
              <BookmarkPlus className="size-4 text-[#e2532f]" />
              <span className="max-sm:hidden">Vista á fasteign</span>
            </button>
            <button
              type="button"
              data-opna-valdar
              onClick={() => opnaValdar([...valdar.values()])}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#FE653F] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#ff7a58] active:translate-y-px"
            >
              <FolderOpen className="size-4" />
              <span className="max-sm:hidden">Opna saman á nýju borði</span>
              <span className="sm:hidden">Opna á borði</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Forskoðun: teikningin stór, ekkert borð */}
      {forsyn ? (
        <div className="absolute inset-0 z-20 flex flex-col bg-stone-950/85 backdrop-blur-sm" data-forsyn role="dialog" aria-label="Forskoðun teikningar">
          <div className="flex shrink-0 items-center gap-2 px-3 py-2.5 text-white sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{forsyn.titill}</div>
              <div className="truncate text-xs text-white/60">{forsyn.eign ?? eign ?? ""}</div>
            </div>
            <button
              type="button"
              onClick={() => skiptaVali(forsyn)}
              aria-pressed={valdarSet.has(forsyn.infoUrl)}
              className={
                "flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold " +
                (valdarSet.has(forsyn.infoUrl) ? "bg-[#FE653F] text-white" : "bg-white/12 text-white hover:bg-white/20")
              }
            >
              <Check className="size-4" strokeWidth={3} />
              <span className="max-sm:hidden">{valdarSet.has(forsyn.infoUrl) ? "Valin" : "Velja"}</span>
            </button>
            <button
              type="button"
              data-vista-fasteign
              onClick={() => vistaAFasteign([forsyn])}
              title={
                iSafni(forsyn.infoUrl).length
                  ? `Á fasteign: ${iSafni(forsyn.infoUrl).join(", ")} — smelltu til að vista líka á annað svæði`
                  : "Setja teikninguna í teikningasafn fasteignarinnar (sama safn og í Greiningu fasteignar)"
              }
              className={
                "flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold " +
                (iSafni(forsyn.infoUrl).length ? "bg-emerald-600/90 text-white hover:bg-emerald-600" : "bg-white/12 text-white hover:bg-white/20")
              }
            >
              {iSafni(forsyn.infoUrl).length ? <Check className="size-4" strokeWidth={3} /> : <BookmarkPlus className="size-4" />}
              <span className="max-sm:hidden">{iSafni(forsyn.infoUrl).length ? "Á fasteign" : "Vista á fasteign"}</span>
            </button>
            <button
              type="button"
              onClick={() => skoda(forsyn)}
              title="Opnar teikninguna í hæstu gæðum í TurboPaint — ekkert borð verður til og ekkert vistast"
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white/12 px-3 text-sm font-semibold text-white hover:bg-white/20"
            >
              <Eye className="size-4" />
              <span className="max-sm:hidden">Skoða í TurboPaint</span>
            </button>
            <button
              type="button"
              onClick={() => opnaValdar([forsyn])}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#FE653F] px-3 text-sm font-semibold text-white hover:bg-[#ff7a58]"
            >
              <FolderOpen className="size-4" />
              <span className="max-sm:hidden">Opna á nýju borði</span>
            </button>
            <button type="button" onClick={() => setForsyn(null)} aria-label="Loka forskoðun" className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
              <X className="size-5" />
            </button>
          </div>
          <div className={"min-h-0 flex-1 " + (aukid ? "overflow-auto" : "flex items-center justify-center overflow-hidden p-3")} onClick={(e) => e.target === e.currentTarget && setForsyn(null)}>
            {forsyn.stor || forsyn.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={forsyn.stor || forsyn.thumb || ""}
                alt={forsyn.titill}
                onClick={() => setAukid((v) => !v)}
                title={aukid ? "Smelltu til að sjá alla teikninguna" : "Smelltu til að stækka"}
                className={
                  "rounded-md bg-white shadow-2xl " +
                  (aukid ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain")
                }
              />
            ) : (
              <div className="max-w-sm rounded-2xl bg-white p-5 text-center text-sm text-stone-700">
                <div className="mb-2 inline-flex rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">PDF</div>
                <p>Forskoðun er ekki til fyrir þessa teikningu — opnaðu hana í skoðun (ekkert vistast) eða á nýju borði.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Vista á fasteign: teikningasafn lóðarinnar */}
      {vistaBlod && vistaBlod.length ? (
        <VistaAFasteignForm
          blod={vistaBlod}
          heimilisfang={vistaBlod[0].eign ?? eign}
          landnr={vistaBlod[0].landnr!}
          iSafniLodar={safn && safn.landnr === vistaBlod[0].landnr ? safn.listi : []}
          onLoka={() => setVistaBlod(null)}
          onVistad={() => void endurhladaSafn(vistaBlod[0].landnr)}
        />
      ) : null}
    </div>
  );
}

/** „Vista á fasteign": blöðin í teikningasafn lóðarinnar undir svæði (sama safn og „Vista í safn" í Greiningu fasteignar). */
function VistaAFasteignForm({
  blod,
  heimilisfang,
  landnr,
  iSafniLodar,
  onLoka,
  onVistad,
}: {
  blod: TeikningVal[];
  heimilisfang: string | null;
  landnr: number;
  iSafniLodar: SafnRod[];
  onLoka: () => void;
  onVistad: () => void;
}) {
  const tillogur = useMemo(() => svaediTillogur(iSafniLodar.map((r) => r.svaedi)), [iSafniLodar]);
  const [svaedi, setSvaedi] = useState("");
  const [ath, setAth] = useState("");
  const [vistar, setVistar] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);
  const thegar = blod.filter((b) => iSafniLodar.some((r) => r.slod === b.infoUrl));

  const vista = async (e: React.FormEvent) => {
    e.preventDefault();
    setVistar(true);
    setVilla(null);
    try {
      const r = await vistaISafn(
        landnr,
        heimilisfang,
        svaedi,
        ath,
        blod.map((b) => ({ slod: b.infoUrl, titill: b.adal, undir: b.undir, mynd: b.thumb, stor: b.stor, tegund: b.tegund, dags: b.dags }))
      );
      if (r.villur.length && !r.vistad) {
        setVilla(r.villur.join(" · "));
        setVistar(false);
        return;
      }
      const sv = svaedi.trim() || "Óflokkað";
      toast.success(
        (r.vistad ? `${r.vistad} ${r.vistad === 1 ? "teikning vistuð" : "teikningar vistaðar"} á fasteign — ${sv}` : `Ekkert nýtt — þegar á fasteign undir „${sv}“`) +
          (r.vistad && r.thegarInni ? ` · ${r.thegarInni} voru þegar þar` : "")
      );
      for (const v of r.villur) toast.error(v, { duration: 8000 });
      onVistad();
      onLoka();
    } catch (err) {
      setVilla(err instanceof Error ? err.message : "Vistaðist ekki");
      setVistar(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center bg-stone-900/40 px-3 pt-20 backdrop-blur-[1px]"
      onPointerDown={(e) => e.target === e.currentTarget && !vistar && onLoka()}
      data-vista-fasteign-form
    >
      <form onSubmit={vista} role="dialog" aria-label="Vista á fasteign" className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-800 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-stone-100 px-4 py-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FE653F]/12 text-[#e2532f]">
            <BookmarkPlus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-stone-900">Vista á fasteign</div>
            <div className="truncate text-[12px] text-stone-500">
              {(heimilisfang || "Lóð").split("(")[0].trim()} · L{landnr} · {blod.length} {blod.length === 1 ? "teikning" : "teikningar"}
            </div>
          </div>
          <button type="button" onClick={onLoka} aria-label="Loka" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {blod.slice(0, 6).map((b) =>
              b.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={b.infoUrl} src={b.thumb} alt="" title={b.titill} className="size-12 shrink-0 rounded-md border border-stone-200 bg-white object-contain" />
              ) : (
                <span key={b.infoUrl} title={b.titill} className="flex size-12 shrink-0 items-center justify-center rounded-md bg-rose-50 text-[10px] font-bold text-rose-700">
                  PDF
                </span>
              )
            )}
          </div>
          {thegar.length ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-800">
              {thegar.length === blod.length ? "Þegar á fasteign" : `${thegar.length} þegar á fasteign`} — undir{" "}
              {[...new Set(iSafniLodar.filter((r) => thegar.some((b) => b.infoUrl === r.slod)).map((r) => r.svaedi || "Óflokkað"))].join(", ")}. Vistaðu á annað svæði ef þú vilt.
            </p>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Svæði</span>
            <input
              autoFocus
              value={svaedi}
              onChange={(e) => setSvaedi(e.target.value)}
              placeholder="t.d. Kjallari, 1. hæð, Allt húsið"
              list="vista-fasteign-svaedi"
              className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-[13.5px] text-stone-900 outline-none focus:border-[#FE653F] focus:ring-2 focus:ring-[#FE653F]/20"
            />
            <datalist id="vista-fasteign-svaedi">
              {tillogur.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {tillogur.slice(0, 7).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSvaedi(t)}
                className={
                  "rounded-full border px-2.5 py-1 text-[12px] " +
                  (svaedi === t ? "border-[#FE653F] bg-[#FE653F] text-white" : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300")
                }
              >
                {t}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Athugasemd (valkvætt)</span>
            <input
              value={ath}
              onChange={(e) => setAth(e.target.value)}
              maxLength={300}
              placeholder="t.d. brunaslanga við snyrtingu"
              className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-[13.5px] text-stone-900 outline-none focus:border-[#FE653F] focus:ring-2 focus:ring-[#FE653F]/20"
            />
          </label>
          <p className="text-[11.5px] leading-snug text-stone-500">
            Fer í teikningasafn fasteignarinnar — sama safn og „Vista í safn“ í Greiningu fasteignar. Úttekt, Teikning og borð breytast ekki.
          </p>
          {villa ? <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800" role="alert">{villa}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-4 py-3">
          <button type="button" onClick={onLoka} disabled={vistar} className="rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50">
            Hætta
          </button>
          <button
            type="submit"
            disabled={vistar}
            className="flex items-center gap-1.5 rounded-xl bg-[#FE653F] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#ff7a58] disabled:opacity-60"
          >
            {vistar ? <Loader2 className="size-4 animate-spin" /> : <BookmarkPlus className="size-4" />}
            {vistar ? "Vistar…" : "Vista"}
          </button>
        </div>
      </form>
    </div>
  );
}
