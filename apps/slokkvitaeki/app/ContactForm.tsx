"use client";

import { useState, type FormEvent } from "react";
import { sbInsert } from "./lib/supabase";

type Fields = { nafn: string; netfang: string; simi: string; skilabod: string };
const EMPTY: Fields = { nafn: "", netfang: "", simi: "", skilabod: "" };

export function ContactForm() {
  const [f, setF] = useState<Fields>(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const set = (k: keyof Fields, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await sbInsert("kjarni_fyrirspurnir", { ...f, uppruni: "slokkvitaeki-vefur" });
      setF(EMPTY);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="form-done">Takk fyrir! Við höfum samband við þig fljótlega. ✓</p>;
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="cf-row">
        <input required placeholder="Nafn" value={f.nafn} onChange={(e) => set("nafn", e.target.value)} />
        <input required type="email" placeholder="Netfang" value={f.netfang} onChange={(e) => set("netfang", e.target.value)} />
      </div>
      <input placeholder="Sími (valfrjálst)" value={f.simi} onChange={(e) => set("simi", e.target.value)} />
      <textarea
        placeholder="Hvað getum við gert fyrir þig?"
        rows={3}
        value={f.skilabod}
        onChange={(e) => set("skilabod", e.target.value)}
      />
      <button className="btn" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sendi…" : "Senda fyrirspurn"}
      </button>
      {state === "error" && (
        <p className="form-err">Eitthvað fór úrskeiðis — reyndu aftur eða hringdu í 565-4080.</p>
      )}
    </form>
  );
}
