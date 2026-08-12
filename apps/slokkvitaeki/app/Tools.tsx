"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { sbSelect } from "./lib/supabase";

type Row = { lykill: string; gildi: string };

// Settings-driven integrations. Each one activates only when its control is set
// in /stjorn — analytics is on by default; Meta Pixel and chat wait for an ID.
export function Tools() {
  const [s, setS] = useState<Record<string, string>>({});

  useEffect(() => {
    sbSelect<Row[]>("kjarni_stillingar?select=lykill,gildi")
      .then((rows) => setS(Object.fromEntries(rows.map((r) => [r.lykill, r.gildi]))))
      .catch(() => {});
  }, []);

  // Meta Pixel
  useEffect(() => {
    const id = s.pixel_id;
    if (!id || document.getElementById("kjarni-pixel")) return;
    const sc = document.createElement("script");
    sc.id = "kjarni-pixel";
    sc.innerHTML =
      "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?" +
      "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;" +
      "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;" +
      "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}" +
      "(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');" +
      "fbq('init','" + id + "');fbq('track','PageView');";
    document.head.appendChild(sc);
  }, [s.pixel_id]);

  // Tawk.to live chat
  useEffect(() => {
    if (s.chat_virkt !== "true" || !s.chat_id || document.getElementById("kjarni-chat")) return;
    const sc = document.createElement("script");
    sc.id = "kjarni-chat";
    sc.async = true;
    sc.src = "https://embed.tawk.to/" + s.chat_id;
    sc.setAttribute("crossorigin", "*");
    document.body.appendChild(sc);
  }, [s.chat_id, s.chat_virkt]);

  return s.analytics_virk !== "false" ? <Analytics /> : null;
}
