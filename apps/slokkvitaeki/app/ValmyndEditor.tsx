"use client";

import { useEffect, useState } from "react";
import { sbRpc, sbSelect } from "./lib/supabase";

type NavLink = { label: string; href: string };

export function ValmyndEditor({ secret }: { secret: string }) {
  const [links, setLinks] = useState<NavLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sbSelect<{ lykill: string; gildi: string }[]>(
      "kjarni_stillingar?select=lykill,gildi&lykill=eq.nav_links",
    )
      .then((rows) => {
        try {
          const parsed = JSON.parse(rows[0]?.gildi || "[]");
          if (Array.isArray(parsed)) setLinks(parsed);
        } catch {}
      })
      .catch(() => {});
  }, []);

  const upd = (i: number, k: keyof NavLink, v: string) =>
    setLinks((ls) => ls.map((l, x) => (x === i ? { ...l, [k]: v } : l)));
  const add = () => setLinks((ls) => [...ls, { label: "", href: "" }]);
  const del = (i: number) => setLinks((ls) => ls.filter((_, x) => x !== i));

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await sbRpc("kjarni_set_stilling", {
        p_lykill: "nav_links",
        p_gildi: JSON.stringify(links.filter((l) => l.label && l.href)),
        p_leyni: secret,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stj-card">
      <h2>Valmynd (haus)</h2>
      <p className="stj-sub">Hlekkirnir efst á síðunni.</p>
      {links.map((l, i) => (
        <div className="nav-row" key={i}>
          <input value={l.label} onChange={(e) => upd(i, "label", e.target.value)} placeholder="Heiti" />
          <input value={l.href} onChange={(e) => upd(i, "href", e.target.value)} placeholder="/hlekkur" />
          <button type="button" onClick={() => del(i)} aria-label="Eyða">✕</button>
        </div>
      ))}
      <div className="stj-actions">
        <button type="button" className="chip-btn" onClick={add}>+ Bæta við hlekk</button>
        <button className="btn" onClick={save} disabled={saving}>{saving ? "Vista…" : "Vista valmynd"}</button>
        {saved && <span className="stj-saved">Vistað ✓</span>}
      </div>
    </section>
  );
}
