"use client";

/* Verkið fylgir þér milli flipa (Agnar 25.11.2026: „tengja fossvoginn betur. Svo ég geti séð hann eins og landspítalann").
 *
 * Áður báru flipar efst ekki ?verk=, svo Gatakort, Skýrsla og Vinna opnuðust alltaf á fyrsta verki með „gatakort" í heiti
 * (NLSH, lægsta id) — hvert verk annað en NLSH náðist aðeins með því að skrifa ?verk=<id> í slóðina.
 * Hér: (1) hlekkir í .aj-nav á síður sem taka ?verk= bera verkið sem er í slóðinni ÞEGAR SMELLT ER (Byggingar velur verk með
 * history.replaceState, svo slóðin breytist án endurhleðslu); (2) á Gatakort, Skýrslu og Vinnu er verkaval fremst í flipastikunni.
 * Það er í stikunni en ekki í .aj-right því hægri hluti hauss er falinn á síma (kort.css); stikan er flettanleg þar.
 *
 * Valið er FLAKK (slóðin), ekki geymd stilling: sama mynstur og ?verk= hefur alltaf verið, ekkert fer í localStorage.
 * Síður sem taka ekki verk (Yfirsýn, Greining, Categories/schema) bera það ekki áfram; sjálfgefið verk er óbreytt (lægsta id). */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { sb } from "./lib/sb";

const MED_VERK = new Set(["/kjarni/skraning", "/kjarni/skraning/kort", "/kjarni/skraning/skyrsla", "/kjarni/skraning/vinna", "/kjarni/skraning/verk"]);
const VERKAVAL = new Set(["/kjarni/skraning/kort", "/kjarni/skraning/skyrsla", "/kjarni/skraning/vinna"]);
type V = { id: number; heiti: string };

const stutt = (h: string) => h.replace(/\s*·\s*gatakort\s*$/i, "");
const verkUrSlod = () => Number(new URLSearchParams(window.location.search).get("verk")) || 0;

export default function VerkTengill() {
  const [verk, setVerk] = useState(0);
  const [slod, setSlod] = useState("");
  const [stika, setStika] = useState<Element | null>(null);
  const [lisi, setLisi] = useState<V[] | null>(null);

  useEffect(() => {
    setVerk(verkUrSlod());
    setSlod(window.location.pathname.replace(/\/+$/, ""));
    setStika(document.querySelector(".aj-nav"));
  }, []);

  // 1. hlekkir efst bera verkið áfram — strax (svo hægt sé að opna í nýjum flipa) og aftur við smell (slóðin getur hafa breyst)
  useEffect(() => {
    if (!stika) return;
    const merkja = () => {
      const v = verkUrSlod();
      stika.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        const h = (a.getAttribute("href") || "").split("?")[0];
        if (MED_VERK.has(h)) a.setAttribute("href", v ? `${h}?verk=${v}` : h);
      });
    };
    merkja();
    stika.addEventListener("click", merkja, true);   // capture: á undan flakkinu
    return () => stika.removeEventListener("click", merkja, true);
  }, [stika, verk]);

  // 2. verkaval: sömu verk og síðurnar finna sjálfgefið á (heiti með „gatakort"), í röð eftir id
  useEffect(() => {
    if (!VERKAVAL.has(slod)) return;
    let lifir = true;
    sb().from("skr_verk").select("id,heiti").eq("eytt", false).ilike("heiti", "%gatakort%").order("id")
      .then(({ data }) => { if (lifir) setLisi((data as V[]) || []); });
    return () => { lifir = false; };
  }, [slod]);

  if (!stika || !VERKAVAL.has(slod)) return null;
  if (lisi && lisi.length < 2) return null;
  const gildi = verk || lisi?.[0]?.id || 0;                                // án ?verk= opna síðurnar fyrsta verk listans
  if (lisi && !lisi.some((v) => v.id === gildi)) return null;              // verk utan listans (t.d. prufuverk): ekkert val, ekki rangt val
  return createPortal(
    // meðan listinn er að koma er valið þegar til í fullri breidd (disabled): flipastikan hoppar ekki þegar hann berst
    <select className="aj-verkval" aria-label="Verk" value={gildi} disabled={!lisi}
      onChange={(e) => { window.location.href = `${slod}?verk=${encodeURIComponent(e.target.value)}`; }}>
      {lisi ? lisi.map((v) => <option key={v.id} value={v.id}>{stutt(v.heiti)}</option>) : <option value={0}>Verk …</option>}
    </select>,
    stika,
  );
}
