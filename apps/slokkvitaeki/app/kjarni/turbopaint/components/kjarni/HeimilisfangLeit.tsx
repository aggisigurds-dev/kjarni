"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, ExternalLink, MapPin } from "lucide-react";

/* Heimilisfang → landnúmer → teikning beint á borðið.
 *
 * Áður: fletta upp í landeignaskrá, afrita L-númerið, líma í skjalasafnið,
 * finna réttu teikninguna, afrita permalinkinn, „Af slóð", líma. Sjö skref í
 * þremur flipum. Núna: skrifa „Skútuvogur 4", smella á mynd.
 *
 * Utan Reykjavíkur er ENGINN teikningalisti til hér — skjalasafnið nær aðeins
 * yfir Reykjavík. Þá sýnum við hnitatengil á kortasjá sveitarfélagsins í stað
 * þess að skila tómum lista, sem liti út eins og bilun.
 */

type Eign = {
  landnr: number;
  label: string;
  postnr: number | null;
  x: number | null;
  y: number | null;
  heimild: "reykjavik" | "map.is" | "óþekkt";
  heimildNafn: string | null;
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

export function HeimilisfangLeit({ onVelja }: { onVelja: (infoUrl: string) => void }) {
  const [q, setQ] = useState("");
  const [eignir, setEignir] = useState<Eign[]>([]);
  const [valin, setValin] = useState<Eign | null>(null);
  const [teikningar, setTeikningar] = useState<Teikning[]>([]);
  const [sia, setSia] = useState<string>("allt");
  const [synaUrelt, setSynaUrelt] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opid, setOpid] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const velja = useCallback(async (e: Eign) => {
    setValin(e);
    setTeikningar([]);
    setSia("allt");
    setSynaUrelt(false);
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
    const t = term.trim();
    setTeikningar([]);
    setValin(null);
    if (t.length < 2) { setEignir([]); setMsg(null); return; }
    const my = ++seq.current;
    setBusy(true);
    setMsg("Leita…");
    try {
      const r = await fetch(`/api/turbopaint/teikningar?heimilisfang=${encodeURIComponent(t)}`);
      const d = (await r.json()) as { results?: Eign[]; error?: string };
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
          : "Ekkert fannst — athugaðu broddstafina (Skútuvogur, ekki Skutuvogur)."
      );
    } catch {
      if (my === seq.current) setMsg("Leit mistókst");
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, [velja]);

  // Loka við smell utan reitsins — annars situr spjaldið yfir borðinu.
  useEffect(() => {
    const f = (ev: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(ev.target as Node)) setOpid(false);
    };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);

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
    new Set(virk.flatMap((t) => t.haed))
  ).sort((a, b) => a - b);
  const stigTiltaek = Array.from(new Set(virk.flatMap((t) => t.stig)));
  const synd = virk.filter((t) => {
    if (sia === "allt") return true;
    if (sia.startsWith("s:")) return t.stig.includes(sia.slice(2));
    if (sia === "annad") return !t.grunnmynd;
    return t.haed.includes(Number(sia));
  });

  return (
    <div ref={wrap} className="relative">
      <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1">
        <Search className="size-3.5 shrink-0 text-stone-300" />
        <input
          value={q}
          onFocus={() => setOpid(true)}
          onChange={(ev) => { setQ(ev.target.value); setOpid(true); }}
          onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void leita(q); } }}
          placeholder="Heimilisfang — t.d. Skútuvogur 4"
          className="w-[190px] bg-transparent text-[12.5px] text-white placeholder:text-stone-400 focus:outline-none"
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

      {opid && (eignir.length > 0 || msg || teikningar.length > 0) && (
        <div className="absolute left-0 top-[115%] z-50 max-h-[70vh] w-[390px] overflow-auto rounded-xl border border-stone-300 bg-white p-2 text-stone-800 shadow-2xl">
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

          {/* Utan Reykjavíkur: hnitatengill á kortasjá sveitarfélagsins. */}
          {valin?.ytriSlod && (
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
                    <div className="flex h-24 items-center justify-center bg-stone-100 text-[11px] text-stone-400">
                      engin forskoðun
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
                      {[t.dags, t.bnnr].filter(Boolean).join(" · ")}
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
        </div>
      )}
    </div>
  );
}
