"use client";

/* Byggingar & teikningar (Agnar 14.10: „create projects, upload map"). Stofna verk, hlaða upp grunnmynd
 * (PDF eða mynd). PDF er renderað í vafranum með pdf.js (sama uppsetning og TurboPaint) í FASTA mynd —
 * pinnarnir eru geymdir í pixlum þeirrar myndar, svo stærðin er skrifuð í skr_teikningar og breytist ekki. */

import { useEffect, useMemo, useRef, useState } from "react";
import { sb, publicUrl, hladaUpp } from "../lib/sb";
import { PDFJS_WORKER_SRC, pdfJsDocumentOptions } from "../../turbopaint/lib/board/pdfjs-setup";
import { SkurdurModal } from "./SkurdurModal";
import { lesaSkurd, skurdarBakgrunnur, type Skurdur } from "../lib/skurdur";

type Verk = { id: number; heiti: string; heimilisfang: string | null; verkkaupi: string | null; virkt: boolean; created_at: string };
type Teikning = { id: number; verk_id: number; heiti: string; haed: string | null; mynd_path: string | null; pdf_path: string | null; breidd_px: number | null; haed_px: number | null; rod: number; skurdur: unknown };
type Sida = { n: number; heiti: string; haed: string; blob: Blob; w: number; h: number; url: string; velja: boolean };

const MAX_PX = 4000; // lengri kantur renderingarinnar — nóg til að lesa teikningu í síma með zoomi

async function renderaPdf(file: File, onPage?: (n: number, alls: number) => void): Promise<Sida[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const doc = await pdfjs.getDocument(pdfJsDocumentOptions(await file.arrayBuffer())).promise;
  const out: Sida[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPage?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_PX / Math.max(v1.width, v1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as Parameters<typeof page.render>[0]).promise;
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
    out.push({ n, heiti: doc.numPages > 1 ? `${file.name} – síða ${n}` : file.name, haed: "", blob, w: c.width, h: c.height, url: URL.createObjectURL(blob), velja: true });
  }
  return out;
}

async function renderaMynd(file: File): Promise<Sida[]> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h); bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
  return [{ n: 1, heiti: file.name, haed: "", blob, w, h, url: URL.createObjectURL(blob), velja: true }];
}

export default function VerkClient() {
  const [verk, setVerk] = useState<Verk[]>([]);
  const [teikn, setTeikn] = useState<Teikning[]>([]);
  const [valid, setValid] = useState<number | null>(null);
  const [villa, setVilla] = useState<string | null>(null);
  const [nytt, setNytt] = useState({ heiti: "", heimilisfang: "", verkkaupi: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [sidur, setSidur] = useState<Sida[]>([]);
  const [skra, setSkra] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [skera, setSkera] = useState<Teikning | null>(null);

  const hlada = async () => {
    const s = sb();
    const [v, t] = await Promise.all([
      s.from("skr_verk").select("id,heiti,heimilisfang,verkkaupi,virkt,created_at").eq("eytt", false).order("heiti"),
      s.from("skr_teikningar").select("id,verk_id,heiti,haed,mynd_path,pdf_path,breidd_px,haed_px,rod,skurdur").eq("eytt", false).order("rod"),
    ]);
    if (v.error || t.error) { setVilla((v.error || t.error)!.message); return; }
    setVerk(v.data as Verk[]); setTeikn(t.data as Teikning[]);
  };
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("verk")) setValid(Number(p.get("verk")));
    hlada();
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (valid) u.searchParams.set("verk", String(valid)); else u.searchParams.delete("verk");
    window.history.replaceState(null, "", u.toString());
  }, [valid]);

  const validVerk = verk.find((v) => v.id === valid) || null;
  const teiknVerks = useMemo(() => teikn.filter((t) => t.verk_id === valid), [teikn, valid]);

  const stofna = async () => {
    if (!nytt.heiti.trim()) { setVilla("Heiti byggingar vantar."); return; }
    setBusy("stofna"); setVilla(null);
    const r = await sb().from("skr_verk").insert({ heiti: nytt.heiti.trim(), heimilisfang: nytt.heimilisfang.trim() || null, verkkaupi: nytt.verkkaupi.trim() || null }).select("id").single();
    setBusy(null);
    if (r.error) { setVilla(r.error.message); return; }
    setNytt({ heiti: "", heimilisfang: "", verkkaupi: "" });
    await hlada(); setValid(r.data.id as number);
  };

  const veljaSkra = async (f: File | null) => {
    setSidur([]); setSkra(f); setVilla(null);
    if (!f) return;
    setBusy("rendera");
    try {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const s = isPdf ? await renderaPdf(f, (n, alls) => setBusy(`rendera síðu ${n} af ${alls}`)) : await renderaMynd(f);
      setSidur(s);
    } catch (e) { setVilla(`Gat ekki lesið skrána: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const vistaTeikningar = async () => {
    if (!valid || !skra) return;
    const valdar = sidur.filter((s) => s.velja);
    if (!valdar.length) return;
    setBusy("hleð upp"); setVilla(null);
    try {
      const s = sb();
      const stamp = Date.now();
      const isPdf = skra.type === "application/pdf" || /\.pdf$/i.test(skra.name);
      let pdfPath: string | null = null;
      if (isPdf) { pdfPath = `verk/${valid}/teikn-${stamp}.pdf`; await hladaUpp(pdfPath, skra, "application/pdf"); }
      let rod = teiknVerks.reduce((m, t) => Math.max(m, t.rod), -1) + 1;
      for (const sd of valdar) {
        setBusy(`hleð upp ${sd.heiti}`);
        const myndPath = `verk/${valid}/teikn-${stamp}-${sd.n}.png`;
        await hladaUpp(myndPath, sd.blob, "image/png");
        const r = await s.from("skr_teikningar").insert({ verk_id: valid, heiti: sd.heiti, haed: sd.haed.trim() || null, pdf_path: pdfPath, mynd_path: myndPath, breidd_px: sd.w, haed_px: sd.h, dpi: 72, rod: rod++ });
        if (r.error) throw new Error(r.error.message);
      }
      setSidur([]); setSkra(null); if (fileRef.current) fileRef.current.value = "";
      await hlada();
    } catch (e) { setVilla(String((e as Error).message || e)); }
    finally { setBusy(null); }
  };

  const breytaHaed = async (t: Teikning, haed: string) => {
    await sb().from("skr_teikningar").update({ haed: haed.trim() || null }).eq("id", t.id);
    setTeikn((all) => all.map((x) => (x.id === t.id ? { ...x, haed: haed.trim() || null } : x)));
  };
  const felaTeikningu = async (t: Teikning) => {
    if (!window.confirm(`Fela teikninguna „${t.haed || t.heiti}"? Punktarnir á henni hverfa úr vinnuútgáfunni.`)) return;
    await sb().from("skr_teikningar").update({ eytt: true }).eq("id", t.id);
    await hlada();
  };
  const vistaSkurd = async (t: Teikning, sk: Skurdur | null) => {
    const r = await sb().from("skr_teikningar").update({ skurdur: sk }).eq("id", t.id);
    if (r.error) throw new Error(r.error.message);
    setTeikn((all) => all.map((x) => (x.id === t.id ? { ...x, skurdur: sk } : x)));
  };
  const breytaVerk = async (v: Verk, patch: Partial<Verk>) => {
    await sb().from("skr_verk").update(patch).eq("id", v.id);
    await hlada();
  };

  return (
    <div className="vn vk">
      {villa && <p className="skr-villa">{villa}</p>}
      <div className="vk-grid">
        {/* vinstri: byggingar */}
        <section className="aj-panel">
          <h3>Byggingar <small>{verk.length}</small></h3>
          <ul className="vk-verk">
            {verk.map((v) => (
              <li key={v.id} className={v.id === valid ? "on" : ""} onClick={() => setValid(v.id)}>
                <strong>{v.heiti}</strong><span>{v.heimilisfang || ""}</span>
                <b>{teikn.filter((t) => t.verk_id === v.id).length} teikn.</b>
                {!v.virkt && <em>óvirk</em>}
              </li>
            ))}
          </ul>
          <div className="vk-nytt">
            <h4>Ný bygging</h4>
            <input type="text" placeholder="Heiti (t.d. Norðurhella 17)" value={nytt.heiti} onChange={(e) => setNytt({ ...nytt, heiti: e.target.value })} />
            <input type="text" placeholder="Heimilisfang" value={nytt.heimilisfang} onChange={(e) => setNytt({ ...nytt, heimilisfang: e.target.value })} />
            <input type="text" placeholder="Verkkaupi (t.d. GG Verk)" value={nytt.verkkaupi} onChange={(e) => setNytt({ ...nytt, verkkaupi: e.target.value })} />
            <button type="button" className="aj-primary" onClick={stofna} disabled={busy === "stofna"}>Stofna byggingu</button>
          </div>
        </section>

        {/* hægri: teikningar valinnar byggingar */}
        <section className="aj-panel">
          <h3>{validVerk ? <>Teikningar — {validVerk.heiti}</> : "Teikningar"} {validVerk && <a className="vk-opna" href={`/kjarni/skraning/vinna?verk=${validVerk.id}`}>Opna í vinnuútgáfu ›</a>}</h3>
          {!validVerk && <p className="vk-tomt">Veldu byggingu til vinstri eða stofnaðu nýja.</p>}
          {validVerk && (
            <div className="aj-panel-b">
              <div className="vk-verkupp">
                <label>Heiti<input type="text" defaultValue={validVerk.heiti} onBlur={(e) => e.target.value.trim() && e.target.value !== validVerk.heiti && breytaVerk(validVerk, { heiti: e.target.value.trim() })} /></label>
                <label>Heimilisfang<input type="text" defaultValue={validVerk.heimilisfang || ""} onBlur={(e) => e.target.value !== (validVerk.heimilisfang || "") && breytaVerk(validVerk, { heimilisfang: e.target.value || null })} /></label>
                <label>Verkkaupi<input type="text" defaultValue={validVerk.verkkaupi || ""} onBlur={(e) => e.target.value !== (validVerk.verkkaupi || "") && breytaVerk(validVerk, { verkkaupi: e.target.value || null })} /></label>
                <label className="vk-virkt"><input type="checkbox" checked={validVerk.virkt} onChange={(e) => breytaVerk(validVerk, { virkt: e.target.checked })} /> Virk (sést í vinnuútgáfunni)</label>
              </div>

              <ul className="vk-teikn">
                {teiknVerks.map((t) => (
                  <li key={t.id}>
                    {t.mynd_path && <a href={publicUrl(t.mynd_path)} target="_blank" rel="noreferrer"><div className="vk-smamynd" style={skurdarBakgrunnur(publicUrl(t.mynd_path), t.breidd_px || 1, t.haed_px || 1, lesaSkurd(t.skurdur, t.breidd_px || 1, t.haed_px || 1), 120, 80)} /></a>}
                    <div>
                      <input type="text" className="vk-haed" placeholder="Hæð / heiti sem starfsmenn sjá (t.d. 2. hæð)" defaultValue={t.haed || ""} onBlur={(e) => e.target.value !== (t.haed || "") && breytaHaed(t, e.target.value)} />
                      <small>{t.heiti} · {t.breidd_px}×{t.haed_px} px{t.pdf_path && <> · <a href={publicUrl(t.pdf_path)} target="_blank" rel="noreferrer">PDF</a></>}{lesaSkurd(t.skurdur, t.breidd_px || 1, t.haed_px || 1) ? " · ✂ skorin" : ""}</small>
                    </div>
                    <div className="vk-takkar">
                      <button type="button" className="vk-skera" onClick={() => setSkera(t)} title="Skera utan um gólfplanið">✂ Skera</button>
                      <button type="button" className="vk-fela" onClick={() => felaTeikningu(t)} title="Fela teikningu">✕</button>
                    </div>
                  </li>
                ))}
                {!teiknVerks.length && <li className="vk-tomt">Engin teikning enn — hlaða upp hér fyrir neðan.</li>}
              </ul>

              <div className="vk-upp">
                <h4>Hlaða upp grunnmynd (PDF eða mynd)</h4>
                <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={(e) => veljaSkra(e.target.files?.[0] || null)} disabled={!!busy} />
                {busy && busy !== "stofna" && <p className="vk-busy">⏳ {busy}…</p>}
                {sidur.length > 0 && (
                  <div className="vk-sidur">
                    {sidur.map((sd, i) => (
                      <div key={sd.n} className={`vk-sida ${sd.velja ? "" : "af"}`}>
                        <img src={sd.url} alt="" />
                        <label className="vk-velja"><input type="checkbox" checked={sd.velja} onChange={(e) => setSidur(sidur.map((x, j) => (j === i ? { ...x, velja: e.target.checked } : x)))} /> {sd.heiti} <small>{sd.w}×{sd.h}</small></label>
                        <input type="text" placeholder="Hæð (t.d. Kjallari, 1. hæð)" value={sd.haed} onChange={(e) => setSidur(sidur.map((x, j) => (j === i ? { ...x, haed: e.target.value } : x)))} />
                      </div>
                    ))}
                    <button type="button" className="aj-primary vk-vista" onClick={vistaTeikningar} disabled={!!busy || !sidur.some((s) => s.velja)}>Vista {sidur.filter((s) => s.velja).length} teikning{sidur.filter((s) => s.velja).length === 1 ? "u" : "ar"}</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {skera && skera.mynd_path && (
        <SkurdurModal url={publicUrl(skera.mynd_path)} breidd={skera.breidd_px || 1} haed={skera.haed_px || 1} heiti={skera.haed || skera.heiti}
          nuverandi={lesaSkurd(skera.skurdur, skera.breidd_px || 1, skera.haed_px || 1)} onSave={(sk) => vistaSkurd(skera, sk)} onClose={() => setSkera(null)} />
      )}
    </div>
  );
}
