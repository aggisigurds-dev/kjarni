"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { sbSelect } from "./lib/supabase";

type NavLink = { label: string; href: string };
const DEFAULT: NavLink[] = [
  { label: "Þjónusta", href: "/#thjonusta" },
  { label: "Verslun", href: "/verslun" },
  { label: "Af hverju við", href: "/#afhverju" },
];

export function SiteHeader() {
  const [links, setLinks] = useState<NavLink[]>(DEFAULT);

  useEffect(() => {
    sbSelect<{ lykill: string; gildi: string }[]>(
      "kjarni_stillingar?select=lykill,gildi&lykill=eq.nav_links",
    )
      .then((rows) => {
        try {
          const parsed = JSON.parse(rows[0]?.gildi || "[]");
          if (Array.isArray(parsed) && parsed.length) setLinks(parsed);
        } catch {}
      })
      .catch(() => {});
  }, []);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/" aria-label="Forsíða">
          <Logo light />
        </a>
        <nav className="nav">
          <span className="nav-links">
            {links.map((l, i) => (
              <a key={i} href={l.href}>{l.label}</a>
            ))}
          </span>
          <a className="btn btn-sm" href="/#hafa-samband">Hafðu samband</a>
        </nav>
      </div>
    </header>
  );
}
