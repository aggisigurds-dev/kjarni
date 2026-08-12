"use client";

import { useEffect, useState, type FormEvent } from "react";
import { sbRpc } from "./lib/supabase";
import { PageBlocks } from "./PageBlocks";

type Block = { gerd: string; [k: string]: string };
type Page = { id: number; slod: string; titill: string; blokkir: Block[]; birt: boolean; rod: number };

const BLOCK_TYPES: { gerd: string; label: string; fields: [string, string, boolean?][] }[] = [
  { gerd: "hero", label: "Hetja", fields: [["fyrirsogn", "Fyrirsögn"], ["undir", "Undirtexti", true], ["hnapp_texti", "Hnappur"], ["hnapp_href", "Hlekkur hnapps"]] },
  { gerd: "texti", label: "Texti", fields: [["fyrirsogn", "Fyrirsögn"], ["texti", "Texti", true]] },
  { gerd: "vorur", label: "Vörur", fields: [["fyrirsogn", "Fyrirsögn"], ["flokkur", "Flokkur (t.d. slokkvitaeki, skynjarar — tómt = allt)"], ["fjoldi", "Fjöldi (t.d. 3)"]] },
  { gerd: "mynd", label: "Mynd", fields: [["url", "Mynd (slóð/URL)"], ["texti", "Myndatexti"]] },
  { gerd: "gallery", label: "Myndasafn", fields: [["fyrirsogn", "Fyrirsögn"], ["myndir", "Myndir — ein slóð í hverja línu", true]] },
  { gerd: "faq", label: "Spurt & svarað", fields: [["fyrirsogn", "Fyrirsögn"], ["spurningar", "Ein í línu:  Spurning :: Svar", true]] },
  { gerd: "cta", label: "Ákall", fields: [["fyrirsogn", "Fyrirsögn"], ["hnapp_texti", "Hnappur"], ["hnapp_href", "Hlekkur hnapps"]] },
  { gerd: "form", label: "Hafa samband", fields: [["fyrirsogn", "Fyrirsögn"]] },
];

const emptyPage = (): Page => ({ id: 0, slod: "", titill: "", blokkir: [], birt: false, rod: 0 });

export function SidurEditor({ secret }: { secret: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [editing, setEditing] = useState<Page | null>(null);
  const [dragI, setDragI] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const rows = await sbRpc<Page[]>("kjarni_sidur_admin", { p_leyni: secret });
    setPages(Array.isArray(rows) ? rows : []);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load().catch(() => {}); }, []);

  function addBlock(gerd: string) {
    if (!editing) return;
    setEditing({ ...editing, blokkir: [...editing.blokkir, { gerd }] });
  }
  function updBlock(i: number, k: string, v: string) {
    if (!editing) return;
    const bl = editing.blokkir.slice();
    bl[i] = { ...bl[i], [k]: v };
    setEditing({ ...editing, blokkir: bl });
  }
  function delBlock(i: number) {
    if (!editing) return;
    setEditing({ ...editing, blokkir: editing.blokkir.filter((_, x) => x !== i) });
  }
  function reorder(from: number, to: number) {
    if (!editing || from === to) return;
    const bl = editing.blokkir.slice();
    const [m] = bl.splice(from, 1);
    bl.splice(to, 0, m);
    setEditing({ ...editing, blokkir: bl });
  }

  async function savePage(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setMsg("");
    try {
      const id = await sbRpc<number>("kjarni_sidur_save", {
        p_leyni: secret,
        p_id: editing.id || 0,
        p_slod: editing.slod.trim().replace(/^\/+/, ""),
        p_titill: editing.titill,
        p_blokkir: editing.blokkir,
        p_birt: editing.birt,
        p_rod: editing.rod || 0,
      });
      if (id === -1) setMsg("Villa (leyniorð).");
      else {
        await load();
        setEditing(null);
      }
    } catch {
      setMsg("Villa — kannski er slóðin þegar til?");
    } finally {
      setSaving(false);
    }
  }

  async function delPage(id: number) {
    await sbRpc("kjarni_sidur_delete", { p_leyni: secret, p_id: id });
    await load();
  }

  if (editing) {
    return (
      <>
        <section className="stj-card">
          <h2>{editing.id ? "Breyta síðu" : "Ný síða"}</h2>
          <form onSubmit={savePage}>
            <label className="stj-field">
              <span>Titill</span>
              <input value={editing.titill} onChange={(e) => setEditing({ ...editing, titill: e.target.value })} placeholder="Um okkur" />
            </label>
            <label className="stj-field">
              <span>Slóð — sést á /{editing.slod || "slod"}</span>
              <input required value={editing.slod} onChange={(e) => setEditing({ ...editing, slod: e.target.value })} placeholder="um-okkur" />
            </label>
            <label className="stj-toggle">
              <input type="checkbox" checked={editing.birt} onChange={(e) => setEditing({ ...editing, birt: e.target.checked })} />
              <span>Birt (sýnileg öllum)</span>
            </label>

            <div className="blk-list">
              {editing.blokkir.map((b, i) => {
                const def = BLOCK_TYPES.find((t) => t.gerd === b.gerd);
                return (
                  <div
                    className={`blk ${dragI === i ? "dragging" : ""}`}
                    key={i}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragI !== null) reorder(dragI, i); setDragI(null); }}
                  >
                    <div className="blk-top" draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(null)}>
                      <b><span className="blk-grip" aria-hidden="true">⠿</span> {def?.label || b.gerd}</b>
                      <div className="blk-btns">
                        <button type="button" onClick={() => reorder(i, i - 1)} aria-label="Upp">↑</button>
                        <button type="button" onClick={() => reorder(i, i + 1)} aria-label="Niður">↓</button>
                        <button type="button" onClick={() => delBlock(i)} aria-label="Eyða">✕</button>
                      </div>
                    </div>
                    {def?.fields.map(([k, label, ta]) => (
                      <label className="stj-field" key={k}>
                        <span>{label}</span>
                        {ta ? (
                          <textarea rows={2} value={b[k] || ""} onChange={(e) => updBlock(i, k, e.target.value)} />
                        ) : (
                          <input value={b[k] || ""} onChange={(e) => updBlock(i, k, e.target.value)} />
                        )}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="blk-add">
              <span>Bæta við blokk:</span>
              {BLOCK_TYPES.map((t) => (
                <button type="button" key={t.gerd} className="chip-btn" onClick={() => addBlock(t.gerd)}>+ {t.label}</button>
              ))}
            </div>

            <div className="stj-actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? "Vista…" : "Vista síðu"}</button>
              <button type="button" className="checkout-back" onClick={() => setEditing(null)}>Hætta við</button>
              {msg && <span className="checkout-err">{msg}</span>}
            </div>
          </form>
        </section>

        <section className="stj-card">
          <h2>Forskoðun</h2>
          <p className="stj-sub">Svona lítur síðan út — uppfærist jafnóðum.</p>
          <div className="pb-preview">
            {editing.blokkir.length === 0 ? (
              <p className="stj-sub" style={{ padding: "24px", textAlign: "center" }}>Bættu við blokk til að byrja.</p>
            ) : (
              <PageBlocks blocks={editing.blokkir} />
            )}
          </div>
        </section>
      </>
    );
  }

  return (
    <section className="stj-card">
      <div className="stj-cardhead">
        <h2>Síður ({pages.length})</h2>
        <button className="btn btn-sm" onClick={() => setEditing(emptyPage())}>+ Ný síða</button>
      </div>
      {pages.length === 0 ? (
        <p className="stj-sub">Engar síður enn — búðu til þína fyrstu.</p>
      ) : (
        <div className="pg-list">
          {pages.map((p) => (
            <div className="pg" key={p.id}>
              <div className="pg-info">
                <b>{p.titill || p.slod}</b>
                <span className="pg-slod">/{p.slod}</span>
                <span className={`pg-badge ${p.birt ? "on" : ""}`}>{p.birt ? "Birt" : "Drög"}</span>
              </div>
              <div className="pg-btns">
                {p.birt && <a href={`/${p.slod}`} target="_blank" rel="noreferrer">Skoða</a>}
                <button onClick={() => setEditing(p)}>Breyta</button>
                <button onClick={() => delPage(p.id)}>Eyða</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
