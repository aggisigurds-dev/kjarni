"use client";

import { useEffect, useState } from "react";
import { sbSelect } from "./lib/supabase";

type Row = { lykill: string; gildi: string };

export function Banner() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    sbSelect<Row[]>("kjarni_stillingar?select=lykill,gildi")
      .then((rows) => {
        const on = rows.find((r) => r.lykill === "bordi_virkur")?.gildi === "true";
        const t = rows.find((r) => r.lykill === "bordi_texti")?.gildi ?? "";
        setText(on && t ? t : null);
      })
      .catch(() => {});
  }, []);

  if (!text) return null;
  return <div className="promo-bordi">📣 {text}</div>;
}
