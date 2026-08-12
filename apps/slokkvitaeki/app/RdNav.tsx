"use client";

import { useEffect, useState } from "react";
import { sbSelect } from "./lib/supabase";

type NavLink = { label: string; href: string };
const DEFAULT: NavLink[] = [
  { label: "Þjónusta", href: "/#thjonusta" },
  { label: "Verslun", href: "/verslun" },
  { label: "QR-kerfið", href: "/#qr" },
  { label: "Af hverju við", href: "/#afhverju" },
];

export function RdNav() {
  const [links, setLinks] = useState<NavLink[]>(DEFAULT);

  useEffect(() => {
    sbSelect<{ lykill: string; gildi: string }[]>(
      "kjarni_stillingar?select=lykill,gildi&lykill=eq.nav_links",
    )
      .then((rows) => {
        try {
          const p = JSON.parse(rows[0]?.gildi || "[]");
          if (Array.isArray(p) && p.length) setLinks(p);
        } catch {}
      })
      .catch(() => {});
  }, []);

  return (
    <header className="rd-header">
      <div className="rd-wrap rd-header-in">
        <a className="rd-brand" href="/">
          <span className="rd-badge">B</span>
          <span className="rd-brand-name">
            Brunahólf<small>SLÖKKVITÆKI EHF.</small>
          </span>
        </a>
        <nav className="rd-nav">
          <span className="rd-navlinks">
            {links.map((l, i) => (
              <a key={i} href={l.href}>{l.label}</a>
            ))}
          </span>
          <a className="rd-cta-btn" href="#hafa-samband">Hafðu samband</a>
        </nav>
      </div>
    </header>
  );
}
