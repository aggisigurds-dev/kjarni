"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, ExternalLink, MapPin } from "lucide-react";

/* Heimilisfang → landnúmer → teikning beint á borðið.
 *
 * Áður: fletta upp í landeignaskrá, afrita L-númerið, líma í skjalasafnið,
 * finna réttu teikninguna, afrita permalinkinn, „Af slóð", líma. Sjö skref í
 * þremur flipum. Núna: skrifa „Skútuvogur 4", smella á mynd.
 *
 * Reykjavík kemur úr FotoWeb-safninu; Hafnarfjörður, Garðabær og Kópavogur úr
 * „Teikningar af byggingum" á kortasjám map.is (sjá app/api/turbopaint/mapis.ts)
 * — sami listi, sömu spjöld, smellur setur PDF-ið á borðið. Utan þessara fjögurra
 * er aðeins hnitatengill á kortasjá sveitarfélagsins ef hún er þekkt.
 */

type Eign = {
  landnr: number;
  /** Heitinúmer Staðfangaskrár — lykill teikninga á map.is ásamt landnúmerinu. */
  heitinr: number | null;
  label: string;
  postnr: number | null;
  x: number | null;
  y: number | null;
  heimild: "reykjavik" | "map.is" | "óþekkt";
  heimildNafn: string | null;
  /** Sveitarfélagsnúmer á map.is (1000 Kópavogur, 1300 Garðabær, 1400 Hafnarfjörður). */
  svf: number | null;
  ytriSlod: string | null;
};

type Teikning = {
  filename: string;
  infoUrl: string;
  thumb: string | null;
  stada: string | null;
  dags: string | null;
  tegund: string | null;
  gata: string | null;
  lysing: string | null;
  bnnr: string | null;
  /** map.is-söfnin: undirflokkur (Grunnmynd, Vatns- og hitalagnir …) og hönnuður. */
  gerd?: string | null;
  hofundur?: string | null;
  urelt: boolean;
  haed: number[];
  stig: string[];
  kjallari: boolean;
  ris: boolean;
  grunnmynd: boolean;
};

/** "Grunnmynd 2. hæð, útlit austur, suður, norður" er of langt á spjald.
 *  Hæðin er það sem skiptir máli — hún fer fremst og feit, restin dauf undir. */
function skipta(t: Teikning): { adal: string; auka: string | null } {
  const l = (t.lysing || "").trim();
  if (t.stig.length && !t.haed.length) return { adal: t.stig.join(" + "), auka: l || null };
  if (t.haed.length) {
    const adal = t.haed.map((h) => `${h}. hæð`).join(" + ");
    // Fella burt "Grunnmynd N. hæð" úr afganginum svo hann tvítaki ekki hæðina.
    const auka = l
      .replace(/grunnmynd\s*\d+\.\s*h[æa][eð]?ð,?\s*/gi, "")
      .replace(/^[,\s]+/, "")
      .trim();
    return { adal, auka: auka || null };
  }
  if (!l) return { adal: t.tegund || t.filename, auka: null };
  const [fyrsti, ...rest] = l.split(",");
  return { adal: fyrsti.trim(), auka: rest.join(",").trim() || null };
}

/** Flokkurinn sem ber grunnmyndirnar — Aðaluppdráttur / Bygginganefndarteikning. */
function sjalfgefinTegund(res: Teikning[]): string {
  const talning = new Map<string, number>();
  for (const t of res) {
    if (t.urelt || !t.tegund) continue;
    if (!/a[ðd]aluppdr|bygginganefnd/i.test(t.tegund)) continue;
    talning.set(t.tegund, (talning.get(t.tegund) ?? 0) + 1);
  }
  const best = [...talning.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "allt";
}

export function HeimilisfangLeit({
  onVelja,
  compact = false,
}: {
  onVelja: (infoUrl: string) => void;
  /** Aðeins leitar-táknið — spjaldið opnast sem portal undir stikunni. */
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [eignir, setEignir] = useState<Eign[]>([]);
  const [valin, setValin] = useState<Eign | null>(null);
  const [teikningar, setTeikningar] = useState<Teikning[]>([]);
  const [sia, setSia] = useState<string>("allt");
  const [tegundSia, setTegundSia] = useState<string>("allt");
  const [textaSia, setTextaSia] = useState("");
  const [synaUrelt, setSynaUrelt] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opid, setOpid] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 8, width: 390, maxH: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const velja = useCallback(async (e: Eign) => {
    setValin(e);
    setTeikningar([]);
    setSia("allt");
    setTegundSia("allt");
    setTextaSia("");
    setSynaUrelt(false);
    if (e.heimild === "map.is" && e.heitinr && e.svf) {
      setBusy(true);
      setMsg(`Sæki teikningar úr kortasjá ${e.heimildNafn}…`);
      try {
        const r = await fetch(
          `/api/turbopaint/teikningar?landnr=${e.landnr}&heitinr=${e.heitinr}&svf=${e.svf}`
        );
        const d = (await r.json()) as { results?: Teikning[]; error?: string };
        if (d.error) { setMsg(d.error); return; }
        const res = d.results || [];
        setTeikningar(res);
        // Aðaluppdrættirnir (grunnmyndir) eru það sem brunavarnateikning þarf —
        // þeir veljast sjálfkrafa þegar safnið blandar saman lögnum, burðarvirki
        // og aðaluppdráttum (Garðatorg 7 er 1052 blöð).
        setTegundSia(sjalfgefinTegund(res));
        setMsg(
          res.length
            ? null
            : `Engar teikningar skráðar á þetta heimilisfang í kortasjá ${e.heimildNafn} — opnaðu kortið hér að neðan.`
        );
      } catch {
        setMsg("Náði ekki í kortasjána");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (e.heimild !== "reykjavik") {
      setMsg(
        e.heimildNafn
          ? `${e.heimildNafn} er ekki í skjalasafni Reykjavíkur — opnaðu kortasjána hér að neðan.`
          : "Skjalasafn Reykjavíkur nær ekki yfir þetta sveitarfélag."
      );
      return;
    }
    setBusy(true);
    setMsg("Sæki teikningar…");
    try {
      const r = await fetch(`/api/turbopaint/teikningar?landnr=${e.landnr}`);
      const d = (await r.json()) as { results?: Teikning[]; error?: string };
      if (d.error) { setMsg(d.error); return; }
      const res = d.results || [];
      setTeikningar(res);
      setMsg(res.length ? null : "Engar teikningar skráðar á þetta landnúmer.");
    } catch {
      setMsg("Náði ekki í teikningar");
    } finally {
      setBusy(false);
    }
  }, []);

  const leita = useCallback(async (term: string) => {
    // NFC strax hér líka: síma-lyklaborð senda "ú" sem u + lausan brodd og
    // Landeignaskrá skilar þá óskyldum eignum (Skuld í stað Skútuvogs).
    const t = term.normalize("NFC").trim();
    setTeikningar([]);
    setValin(null);
    if (t.length < 2) { setEignir([]); setMsg(null); return; }
    const my = ++seq.current;
    setBusy(true);
    setMsg("Leita…");
    try {
      const r = await fetch(`/api/turbopaint/teikningar?heimilisfang=${encodeURIComponent(t)}`);
      const d = (await r.json()) as { results?: Eign[]; error?: string; numer?: number | null; gataFjoldi?: number };
      if (my !== seq.current) return;
      if (d.error) { setMsg(d.error); setEignir([]); return; }
      const res = d.results || [];
      setEignir(res);
      // Nákvæm samsvörun velst SJÁLFKRAFA (Agnar 28.08): "Skútuvogur 4" á að
      // fara á Skútuvogur 4 — ekki bjóða 4A líka og láta hann velja. Aðeins
      // ef nákvæmlega EIN eign passar stafrétt; annars stendur listinn.
      const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
      const heiti = (e: Eign) => norm(e.label.split("(")[0]);
      const nakvaem = res.filter((e) => heiti(e) === norm(t));
      if (nakvaem.length === 1) { void velja(nakvaem[0]); return; }
      setMsg(
        res.length
          ? null
          : d.numer != null && (d.gataFjoldi ?? 0) > 0
            ? `Ekkert skráð á númer ${d.numer} — slepptu númerinu til að sjá alla götuna (${d.gataFjoldi} eignir).`
            : "Ekkert fannst — athugaðu broddstafina (Skútuvogur, ekki Skutuvogur)."
      );
    } catch {
      if (my === seq.current) setMsg("Leit mistókst");
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, [velja]);

  // Djúptengill: ?leit=Strandgata 6 opnar leitina með heimilisfanginu — kúnnaspjaldið
  // í Slökkvitæki-appinu sendir hingað svo teikning staðarins sé einn smellur í burtu.
  useEffect(() => {
    let raw = "";
    try {
      const u = new URL(window.location.href);
      raw = (u.searchParams.get("leit") || "").normalize("NFC").trim();
      if (raw) {
        u.searchParams.delete("leit");
        window.history.replaceState({}, "", u.pathname + (u.search || "") + u.hash);
      }
    } catch {
      return;
    }
    if (!raw) return;
    setQ(raw);
    setOpid(true);
  }, []);

  // Loka við smell utan reitsins OG portal-spjaldsins, eða Escape.
  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (wrap.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpid(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpid(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useLayoutEffect(() => {
    if (!opid) return;
    const place = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(390, window.innerWidth - 16);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      // Spjaldið má ekki ná niður fyrir gluggann. Á TurboPaint situr reiturinn
      // efst og 70vh passar; á Stjórnstöðinni er hann ~320px niðri og 70vh skar
      // neðstu ~70px af spjaldinu burt. Hæðin er nú líka bundin við plássið.
      const topPx = r.bottom + 8;
      setPanelPos({ top: topPx, left, width, maxH: Math.max(220, window.innerHeight - topPx - 12) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [opid, eignir.length, teikningar.length, msg, compact]);

  // Lifandi leit, hömluð svo hvert stafabil verði ekki að fyrirspurn.
  useEffect(() => {
    if (!opid) return;
    const t = setTimeout(() => void leita(q), 420);
    return () => clearTimeout(t);
  }, [q, opid, leita]);

  /* Hæða-síurnar eru smíðaðar ÚR gögnunum — aðeins hæðir sem eru til birtast,
   * svo enginn dauður takki. Þetta er kjarni erindisins (Agnar 28.08: "ég þarf
   * helst að finna hæðarnar — hæð 1, hæð 2, kjallari"): leit á heimilisfangi í
   * safninu skilar 166 blöðum þar sem hæðin sést aðeins með því að halda
   * bendlinum yfir hverju og einu. Hér eru þau 25 og hæðin er á spjaldinu. */
  /* „Bara notast við nýjustu" (Agnar 28.08). Safnið geymir hverja teikningu í
   * mörgum útgáfum — Skútuvogur 4 er með 66 blöð en aðeins 26 gildandi. Úreltu
   * blöðin eru falin sjálfgefið; takki neðst sýnir þau ef á þarf að halda. */
  const virk = synaUrelt ? teikningar : teikningar.filter((t) => !t.urelt);
  const ureltFjoldi = teikningar.filter((t) => t.urelt).length;
  const haedirTiltaekar = Array.from(
    new Set(
      virk
        .filter((t) => tegundSia === "allt" || (t.tegund || "Annað") === tegundSia)
        .flatMap((t) => t.haed)
    )
  ).sort((a, b) => a - b);
  const stigTiltaek = Array.from(
    new Set(
      virk
        .filter((t) => tegundSia === "allt" || (t.tegund || "Annað") === tegundSia)
        .flatMap((t) => t.stig)
    )
  );
  // Tegundar-sían (map.is-söfnin blanda lögnum, burðarvirki og aðaluppdráttum).
  const tegundir = Array.from(
    virk.reduce((m, t) => {
      const k = t.tegund || "Annað";
      m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);
  const eftirTegund =
    tegundSia === "allt" ? virk : virk.filter((t) => (t.tegund || "Annað") === tegundSia);
  const leitarord = textaSia.trim().toLowerCase();
  const synd = eftirTegund.filter((t) => {
    if (leitarord) {
      const hey = [t.lysing, t.gerd, t.hofundur, t.bnnr, t.filename, t.tegund]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hey.includes(leitarord)) return false;
    }
    if (sia === "allt") return true;
    if (sia.startsWith("s:")) return t.stig.includes(sia.slice(2));
    if (sia === "annad") return !t.grunnmynd;
    return t.haed.includes(Number(sia));
  });

  const showPanel = opid && (compact || eignir.length > 0 || msg || teikningar.length > 0);

  const searchField = (
    // Á síma (412 px) komst hausinn ekki fyrir: reiturinn hafði min-w 9rem OG 46vw og
    // lak því út úr `min-w-0 shrink` umbúðunum yfir „PDF"-hnappinn (Agnar 20.09.2026:
    // „Fix overlap in mobile view"). Nú má hann skreppa og klippist innan umbúðanna;
    // sprettiglugginn er hvort eð er með sinn eigin leitarreit í fullri breidd.
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md bg-white/10 px-2 py-1">
      <Search className="size-3.5 shrink-0 text-stone-300" />
      <input
        value={q}
        onFocus={() => setOpid(true)}
        onChange={(ev) => { setQ(ev.target.value); setOpid(true); }}
        onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void leita(q); } }}
        placeholder="Heimilisfang — t.d. Skútuvogur 4"
        className="w-full min-w-0 truncate bg-transparent text-[12.5px] text-white placeholder:text-stone-400 focus:outline-none sm:w-[220px] sm:min-w-[9rem]"
      />
      {q && (
        <button
          type="button"
          onClick={() => { setQ(""); setEignir([]); setTeikningar([]); setValin(null); setMsg(null); }}
          className="shrink-0 text-stone-400 hover:text-white"
          title="Hreinsa"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );

  const panel = showPanel && typeof document !== "undefined" ? createPortal(
    <div
      ref={panelRef} data-hleit=""
      style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width, maxHeight: panelPos.maxH ? `min(70vh, calc(100dvh - 5rem), ${panelPos.maxH}px)` : undefined }}
      className="fixed z-[80] max-h-[min(70vh,calc(100dvh-5rem))] overflow-auto rounded-xl border border-stone-300 bg-white p-2 text-stone-800 shadow-2xl"
    >
      {compact && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-stone-100 px-2 py-1.5">
          <Search className="size-3.5 shrink-0 text-stone-500" />
          <input
            autoFocus
            value={q}
            onChange={(ev) => { setQ(ev.target.value); setOpid(true); }}
            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void leita(q); } }}
            placeholder="Heimilisfang — t.d. Skútuvogur 4"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
          <button type="button" onClick={() => setOpid(false)} className="text-[12px] text-stone-500">
            Loka
          </button>
        </div>
      )}
      <div>
          {!valin &&
            eignir.map((e) => (
              <button
                key={e.landnr}
                type="button"
                onClick={() => void velja(e)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-stone-100"
              >
                <span className="min-w-0 flex-1 truncate">{e.label}</span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-blue-600">
                  L {e.landnr}
                </span>
              </button>
            ))}

          {valin && (
            <div className="mb-1.5 flex items-center gap-2 border-b border-stone-200 px-1 pb-1.5">
              <button
                type="button"
                onClick={() => { setValin(null); setTeikningar([]); setMsg(null); }}
                className="text-[12px] text-stone-500 hover:text-stone-900"
              >
                ← Til baka
              </button>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                {valin.label}
              </span>
            </div>
          )}

          {msg && <div className="px-2 py-1.5 text-[12px] text-stone-500">{busy ? msg : msg}</div>}

          {/* Utan teikningasafnanna: hnitatengill á kortasjá sveitarfélagsins. */}
          {valin?.ytriSlod && teikningar.length === 0 && !busy && (
            <a
              href={valin.ytriSlod}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-2 rounded-lg bg-stone-100 px-2.5 py-2 text-[12.5px] font-medium hover:bg-stone-200"
            >
              <MapPin className="size-3.5 shrink-0" />
              Opna {valin.heimildNafn} á korti
              <ExternalLink className="ml-auto size-3.5 shrink-0 opacity-60" />
            </a>
          )}

          {virk.length > 0 && tegundir.length > 1 && (
            <div className="flex flex-wrap gap-1 px-0.5 pb-1.5 pt-0.5" data-tegundir="">
              {[
                { k: "allt", t: `Allt (${virk.length})` },
                ...tegundir.slice(0, 7).map(([k, n]) => ({ k, t: `${k} (${n})` })),
              ].map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => { setTegundSia(c.k); setSia("allt"); }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    tegundSia === c.k
                      ? "bg-blue-700 text-white"
                      : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                  }`}
                >
                  {c.t}
                </button>
              ))}
            </div>
          )}

          {virk.length > 12 && (
            <input
              value={textaSia}
              onChange={(ev) => setTextaSia(ev.target.value)}
              placeholder="Sía — t.d. grunnmynd, 2. hæð, lagnir, nafn hönnuðar"
              className="mb-1.5 w-full rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-[12px] text-stone-800 placeholder:text-stone-400 focus:border-blue-400 focus:outline-none"
            />
          )}

          {virk.length > 0 && (haedirTiltaekar.length > 0 || stigTiltaek.length > 0) && (
            <div className="flex flex-wrap gap-1 border-b border-stone-200 px-0.5 pb-1.5 pt-0.5">
              {[
                { k: "allt", t: `Allt (${virk.length})` },
                ...stigTiltaek.map((sn) => ({ k: "s:" + sn, t: sn })),
                ...haedirTiltaekar.map((h) => ({ k: String(h), t: `${h}. hæð` })),
                { k: "annad", t: "Annað" },
              ].map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => setSia(c.k)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    sia === c.k
                      ? "bg-stone-800 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {c.t}
                </button>
              ))}
            </div>
          )}

          {virk.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {synd.map((t) => (
                <button
                  key={t.infoUrl}
                  type="button"
                  onClick={() => { onVelja(t.infoUrl); setOpid(false); }}
                  className="overflow-hidden rounded-lg border border-stone-200 text-left hover:border-blue-500"
                  title={`${t.lysing || t.filename}${t.stada ? " · " + t.stada : ""} — smelltu til að setja á borðið`}
                >
                  {t.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumb} alt={t.filename} className="h-24 w-full bg-white object-contain" />
                  ) : (
                    <div className="flex h-24 flex-col items-center justify-center gap-1 bg-stone-100 px-2 text-center">
                      <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {/\.tiff?$/i.test(t.filename) ? "TIF" : "PDF"}
                      </span>
                      <span className="line-clamp-2 text-[10px] leading-tight text-stone-500">
                        {t.gerd && t.gerd !== "Óskráð" ? t.gerd : t.tegund || "teikning"}
                      </span>
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    {/* Hæðin fremst og feit — hún er ástæðan fyrir því að velja
                        eina teikningu fram yfir aðra. Restin dauf, ein lína. */}
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[11.5px] font-bold leading-tight text-stone-900">
                        {skipta(t).adal}
                      </span>
                      {t.urelt && (
                        <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                          úrelt
                        </span>
                      )}
                    </div>
                    {skipta(t).auka && (
                      <div className="truncate text-[10px] leading-tight text-stone-500">
                        {skipta(t).auka}
                      </div>
                    )}
                    <div className="truncate text-[10px] text-stone-400">
                      {[t.dags, t.bnnr, t.hofundur].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {ureltFjoldi > 0 && (
            <button
              type="button"
              onClick={() => setSynaUrelt((v) => !v)}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-[11px] font-medium text-stone-500 hover:bg-stone-100"
            >
              {synaUrelt
                ? "Fela úreltar teikningar"
                : `Sýna úreltar teikningar (${ureltFjoldi})`}
            </button>
          )}

          {virk.length > 0 && synd.length === 0 && (
            <div className="px-2 py-1.5 text-[12px] text-stone-500">
              Ekkert í þessari síu — prófaðu „Allt" eða annað leitarorð.
            </div>
          )}

          {valin?.ytriSlod && teikningar.length > 0 && (
            <a
              href={valin.ytriSlod}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-stone-500 hover:bg-stone-100"
            >
              <MapPin className="size-3.5 shrink-0" />
              Sama lóð í kortasjá {valin.heimildNafn}
              <ExternalLink className="ml-auto size-3.5 shrink-0 opacity-60" />
            </a>
          )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrap} className="relative" data-hleit="">
      {compact ? (
        <button
          type="button"
          title="Leita að teikningu eftir heimilisfangi"
          onClick={() => setOpid((v) => !v)}
          className={`flex h-9 items-center gap-1 rounded-lg px-2 ${
            opid ? "bg-white/15 text-white" : "text-stone-300 hover:bg-white/8 hover:text-white"
          }`}
        >
          <Search className="size-4" />
          <span className="text-[11px] font-medium">Leita</span>
        </button>
      ) : (
        searchField
      )}
      {panel}
    </div>
  );
}
