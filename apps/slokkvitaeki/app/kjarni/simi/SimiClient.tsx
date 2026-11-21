"use client";

import { useEffect, useState } from "react";
import { StationChrome } from "../StationChrome";
import {
  CHATGPT_HREF,
  CLAUDE_HREF,
  DC_SETUP,
  DEFAULT_VELAR,
  DESKTOP_COMMANDER_CLAUDE,
  DESKTOP_COMMANDER_DEVICES,
  MOONLIGHT_PLAY,
  MOONLIGHT_SITE,
  RUSTDESK_PLAY,
  RUSTDESK_SITE,
  SIMI_STORE_KEY,
  TAILSCALE_ADMIN,
  TAILSCALE_PLAY,
  mergeVelar,
  rustdeskHref,
  tailscaleMachineHref,
  type SimiVel,
} from "./setup";
import "./simi.css";

async function afrita(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SimiClient() {
  const [velar, setVelar] = useState<SimiVel[]>(DEFAULT_VELAR);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    try {
      setVelar(mergeVelar(JSON.parse(localStorage.getItem(SIMI_STORE_KEY) ?? "[]")));
    } catch {
      setVelar(DEFAULT_VELAR);
    }
  }, []);

  function vista(naestu: SimiVel[]) {
    setVelar(naestu);
    try {
      localStorage.setItem(SIMI_STORE_KEY, JSON.stringify(naestu));
    } catch {
      /* still keep the draft in memory */
    }
  }

  function breyta(id: string, patch: Partial<SimiVel>) {
    vista(velar.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  async function copy(label: string, text: string) {
    const ok = await afrita(text);
    setCopied(ok ? `${label} afritað` : "Gat ekki afritað");
    window.setTimeout(() => setCopied(""), 2000);
  }

  return (
    <StationChrome tool="simi">
      <div className="si-page">
        <p className="si-kicker">Sími → tölva</p>
        <h1>Stjórnaðu tölvunni úr símanum</h1>
        <p className="si-lead">
          Tvö lög, eins og þú valdir: Claude eða ChatGPT senda skipanir á vélina í gegnum
          Desktop Commander. RustDesk (eða Moonlight) er skjárinn þegar þú <em>verður</em> að
          sjá gluggann. Ekkert fer í gegnum Kjarnann — hann er bara stjórnborðið.
        </p>
        {copied ? <p className="si-toast" role="status">{copied}</p> : null}

        <section className="si-card" aria-labelledby="si-skipanir">
          <h2 id="si-skipanir">1. Skipanir — Claude í símanum</h2>
          <p>
            Þetta er hversdagsleiðin. Þú talar við Claude (eða ChatGPT) í símanum; Desktop
            Commander keyrir skipunina á tölvunni. Ekki pikka á smáa glugga.
          </p>
          <div className="si-actions">
            <a className="si-btn" href={CLAUDE_HREF}>Opna Claude</a>
            <a className="si-btn ghost" href={CHATGPT_HREF}>Opna ChatGPT</a>
            <a className="si-btn ghost" href={DESKTOP_COMMANDER_CLAUDE} target="_blank" rel="noreferrer">
              Tengja Claude
            </a>
            <a className="si-btn ghost" href={DESKTOP_COMMANDER_DEVICES} target="_blank" rel="noreferrer">
              Tækin mín
            </a>
          </div>
          <h3>Á tölvunni — einu sinni, svo haltu glugganum opnum</h3>
          <p className="si-hint">
            Límdu skipunina í PowerShell / Terminal. Staðfestu kóðann í vafranum. Eftir endurræsingu
            keyrðu hana aftur (eða shortcut sem uppsetningin býr til).
          </p>
          {(
            [
              ["Windows", DC_SETUP.windows],
              ["macOS", DC_SETUP.macos],
              ["Linux", DC_SETUP.linux],
            ] as const
          ).map(([label, cmd]) => (
            <div key={label} className="si-cmd">
              <div className="si-cmd-h">
                <b>{label}</b>
                <button type="button" className="si-btn ghost" onClick={() => void copy(label, cmd)}>
                  Afrita
                </button>
              </div>
              <pre>{cmd}</pre>
            </div>
          ))}
        </section>

        <section className="si-card" aria-labelledby="si-skar">
          <h2 id="si-skar">2. Skjár — þegar þú verður að sjá</h2>
          <p>
            RustDesk er ókeypis og opin uppspretta. Skráðu auðkenni vélarinnar hér (sest í
            RustDesk á tölvunni) — svo smellirðu á Opna skjá úr símanum.
          </p>
          <div className="si-actions">
            <a className="si-btn" href={RUSTDESK_PLAY} target="_blank" rel="noreferrer">
              RustDesk í síma
            </a>
            <a className="si-btn ghost" href={RUSTDESK_SITE} target="_blank" rel="noreferrer">
              RustDesk á tölvu
            </a>
          </div>
          <ul className="si-velar">
            {velar.map((vel) => {
              const skjar = rustdeskHref(vel.rustdeskId);
              const net = tailscaleMachineHref(vel.tailscale);
              return (
                <li key={vel.id} className="si-vel">
                  <label>
                    Nafn
                    <input
                      value={vel.name}
                      onChange={(e) => breyta(vel.id, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    RustDesk-auðkenni
                    <input
                      inputMode="numeric"
                      placeholder="123 456 789"
                      value={vel.rustdeskId}
                      onChange={(e) => breyta(vel.id, { rustdeskId: e.target.value })}
                    />
                  </label>
                  <label>
                    Tailscale-nafn
                    <input
                      placeholder="desktop-skrifstofa"
                      value={vel.tailscale}
                      onChange={(e) => breyta(vel.id, { tailscale: e.target.value })}
                    />
                  </label>
                  <div className="si-actions">
                    {skjar ? (
                      <a className="si-btn" href={skjar}>Opna skjá</a>
                    ) : (
                      <span className="si-btn ghost" aria-disabled="true">Vantar auðkenni</span>
                    )}
                    {net ? (
                      <a className="si-btn ghost" href={net}>Opna á netinu</a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="si-hint">
            Vistað strax á þessum síma. Drög eru alltaf tekin — auðkenni má vanta.
          </p>
        </section>

        <section className="si-card" aria-labelledby="si-net">
          <h2 id="si-net">3. Vara — Moonlight og Tailscale</h2>
          <p>
            Ef RustDesk er stirð, Sunshine á tölvunni + Moonlight í símanum er leikjafjarstýring
            (lægri bið). Tailscale setur vélarnar á eigið net svo þú sért ekki að opna RustDesk út
            á internetið.
          </p>
          <div className="si-actions">
            <a className="si-btn ghost" href={MOONLIGHT_PLAY} target="_blank" rel="noreferrer">
              Moonlight í síma
            </a>
            <a className="si-btn ghost" href={MOONLIGHT_SITE} target="_blank" rel="noreferrer">
              Sunshine / Moonlight
            </a>
            <a className="si-btn ghost" href={TAILSCALE_PLAY} target="_blank" rel="noreferrer">
              Tailscale í síma
            </a>
            <a className="si-btn ghost" href={TAILSCALE_ADMIN} target="_blank" rel="noreferrer">
              Tailscale vélar
            </a>
          </div>
        </section>
      </div>
    </StationChrome>
  );
}
