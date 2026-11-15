"use client";

// Bíó — les samantektina sem tools/bio-sync sendir frá PC-tölvunni (bio_gogn, hluti 'safn')
// og heldur utan um þættina sem bætt er við hér (hluti 'fylgjast'). Lykillinn kemur úr
// tenglinum sem bio-sync skrifar (…/bio#k=…) og býr í localStorage; Supabase sér aðeins sha256 af honum.
import { useCallback, useEffect, useMemo, useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "@/app/lib/supabase";
import s from "./bio.module.css";

type Seria = { s: number; ep: string; n: number };
type Thattur = {
  id: number; nafn: string; ar: number | null; mynd: string | null; stada: string; stod: string | null;
  tegund: string[]; slod: string; uppruni: "sida" | "skra" | "plex"; iPlexSafni: boolean;
  sidastSedd: string | null; osedir: number | null;
  synt: number; iPlex: number; utanPlex: number; vantar: number;
  vantarSeriur: Seria[]; utanPlexSeriur: Seria[];
  nyjastaSeria: { s: number; synt: number; alls: number; iPlex: number; utanPlex: number; vantar: number; vantarEp: string } | null;
  nyjasti: { kodi: string; dags: string; nafn: string } | null;
  naesti: { kodi: string; dags: string | null; nafn: string } | null;
};
type NyrThattur = {
  id: number; nafn: string; ar: number | null; mynd: string | null; frumsynt: string; stod: string | null;
  tegund: string[]; lysing: string; vinsaeld: number; slod: string; iPlex: boolean;
};
type NyMynd = {
  saeti: number; nafn: string; ar: number | null; utgafa: string | null; tegund: string | null; leikstjori: string | null;
  mynd: string | null; lysing: string; slod: string | null; iPlex: boolean;
};
type Safn = {
  utgafa: number; uppfaert: string; tok: number;
  safn: { thaettir: number; myndir: number; thattaNofn: string[] };
  advaranir: { safn: string; mappa: string; tillaga: string | null }[];
  fylgst: Thattur[]; nyirThaettir: NyrThattur[]; nyjarMyndir: NyMynd[];
};
type Fylgja = { id: number; nafn: string; ar?: number | null; mynd?: string | null; stod?: string | null };
type Leitarnidurstada = { id: number; nafn: string; ar: number | null; mynd: string | null; stod: string | null; stada: string };

const LS = "bio-lykill";
const FLIPAR = [
  { k: "minir", t: "Mínir þættir" },
  { k: "nyir", t: "Nýir þættir" },
  { k: "myndir", t: "Nýjar myndir" },
] as const;
type Flipi = (typeof FLIPAR)[number]["k"];

const norm = (t: string) => t.toLowerCase().replace(/&/g, "and").replace(/\((19|20)\d\d\)/g, "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sb<T>(lykill: string, method: "GET" | "POST", q: string, body?: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    method,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "x-bio-key": lykill, "Content-Type": "application/json",
      ...(method === "POST" ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gagnagrunnur svaraði ${r.status}`);
  return (method === "GET" ? r.json() : null) as Promise<T>;
}

// Íslensk mánaðaheiti handskrifuð — sum Chromium-umhverfi skila „Nov“ fyrir is-IS.
const MAN = ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ág.", "sept.", "okt.", "nóv.", "des."];
function dags(d: string | null | undefined) {
  if (!d) return "";
  const [ar, man, dagur] = d.slice(0, 10).split("-").map(Number);
  return `${dagur}. ${MAN[man - 1]}${ar === new Date().getFullYear() ? "" : ` ${ar}`}`;
}
function timi(iso: string) {
  const t = new Date(iso);
  return `${dags(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`)} kl. ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function afstaett(d: string | null | undefined) {
  if (!d) return "";
  const dagar = Math.round((new Date(`${d.slice(0, 10)}T12:00:00`).getTime() - Date.now()) / 864e5);
  if (dagar === 0) return "í dag";
  if (dagar === 1) return "á morgun";
  if (dagar === -1) return "í gær";
  return dagar > 0 ? `eftir ${dagar} daga` : `fyrir ${-dagar} dögum`;
}
function sidan(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "rétt í þessu";
  if (m < 60) return `fyrir ${m} mín.`;
  const k = Math.round(m / 60);
  return k < 48 ? `fyrir ${k} klst.` : `fyrir ${Math.round(k / 24)} dögum`;
}
const STADA: Record<string, string> = { Running: "Í gangi", Ended: "Lokið", "To Be Determined": "Óvíst", "In Development": "Í vinnslu" };

export default function BioClient() {
  const [lykill, setLykill] = useState<string | null>(null);
  const [byrjad, setByrjad] = useState(false);
  const [safn, setSafn] = useState<Safn | null>(null);
  const [fylgja, setFylgja] = useState<Fylgja[]>([]);
  const [flipi, setFlipi] = useState<Flipi>("minir");
  const [villa, setVilla] = useState("");
  const [hledur, setHledur] = useState(false);
  const [felaPlex, setFelaPlex] = useState(false);
  const [opid, setOpid] = useState<number | null>(null);
  const [leit, setLeit] = useState("");
  const [nidurstodur, setNidurstodur] = useState<Leitarnidurstada[]>([]);
  const [afritad, setAfritad] = useState(false);

  // Lykill úr tenglinum (#k=…) eða úr localStorage
  useEffect(() => {
    let k: string | null = null;
    const m = location.hash.match(/[#&]k=([A-Za-z0-9_-]{32,128})/);
    if (m) {
      k = m[1];
      try { localStorage.setItem(LS, k); } catch {}
      history.replaceState(null, "", location.pathname + location.search);
    } else {
      try { k = localStorage.getItem(LS); } catch {}
    }
    setLykill(k);
    setByrjad(true);
  }, []);

  const lesa = useCallback(async (k: string) => {
    setHledur(true);
    try {
      const skuffa = await sha256(k);
      const rows = await sb<{ hluti: string; gogn: unknown }[]>(k, "GET", `bio_gogn?select=hluti,gogn&skuffa=eq.${skuffa}`);
      const safnRod = rows.find((r) => r.hluti === "safn");
      const fylgjaRod = rows.find((r) => r.hluti === "fylgjast");
      setSafn((safnRod?.gogn as Safn) ?? null);
      const listi = (fylgjaRod?.gogn as { thaettir?: Fylgja[] } | undefined)?.thaettir;
      setFylgja(Array.isArray(listi) ? listi : []);
      setVilla("");
    } catch (e) {
      setVilla(e instanceof Error ? e.message : "Villa");
    } finally {
      setHledur(false);
    }
  }, []);

  useEffect(() => { if (lykill) void lesa(lykill); }, [lykill, lesa]);

  const vistaFylgja = useCallback(async (listi: Fylgja[]) => {
    if (!lykill) return;
    const fyrri = fylgja;
    setFylgja(listi);
    try {
      await sb(lykill, "POST", "bio_gogn?on_conflict=skuffa,hluti", {
        skuffa: await sha256(lykill), hluti: "fylgjast", gogn: { thaettir: listi }, uppfaert: new Date().toISOString(),
      });
    } catch (e) {
      setFylgja(fyrri);
      setVilla(e instanceof Error ? e.message : "Vistaðist ekki");
    }
  }, [lykill, fylgja]);

  const fylgjaIds = useMemo(() => new Set([...fylgja.map((f) => f.id), ...(safn?.fylgst ?? []).map((t) => t.id)]), [fylgja, safn]);
  const iPlexNofn = useMemo(() => new Set((safn?.safn.thattaNofn ?? []).map(norm)), [safn]);
  const baetaVid = (f: Fylgja) => { if (!fylgja.some((x) => x.id === f.id)) void vistaFylgja([...fylgja, f]); };
  const fjarlaegja = (id: number) => void vistaFylgja(fylgja.filter((x) => x.id !== id));

  // TVmaze-leit (opin, CORS) til að bæta þætti á listann
  useEffect(() => {
    const q = leit.trim();
    if (q.length < 2) { setNidurstodur([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { show: { id: number; name: string; premiered: string | null; image: { medium: string } | null; network: { name: string } | null; webChannel: { name: string } | null; status: string } }[];
        setNidurstodur(j.slice(0, 8).map(({ show: x }) => ({
          id: x.id, nafn: x.name, ar: x.premiered ? Number(x.premiered.slice(0, 4)) : null, mynd: x.image?.medium ?? null,
          stod: x.network?.name ?? x.webChannel?.name ?? null, stada: x.status,
        })));
      } catch { setNidurstodur([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [leit]);

  const thaettir = useMemo(() => {
    const listi = [...(safn?.fylgst ?? [])];
    listi.sort((a, b) => (b.nyjasti?.dags ?? "").localeCompare(a.nyjasti?.dags ?? ""));
    return listi;
  }, [safn]);
  const bidur = fylgja.filter((f) => !(safn?.fylgst ?? []).some((t) => t.id === f.id));
  const vika = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const nyttVikunni = thaettir.filter((t) => t.nyjasti && t.nyjasti.dags >= vika).length;

  if (!byrjad) return <main className={s.sida} />;

  if (!lykill) {
    return (
      <main className={s.sida}>
        <div className={s.tengja}>
          <h1 className={s.logo}>Bíó</h1>
          <p>Þetta tæki er ekki tengt. Opnaðu tengilinn sem samstillingin á PC-tölvunni bjó til:</p>
          <code className={s.kodi}>C:\Users\Notandi\.kjarni-bio\tengill.txt</code>
          <p className={s.daufur}>Eða límdu tengilinn hér:</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = String(new FormData(e.currentTarget).get("k") ?? "");
              const k = v.match(/k=([A-Za-z0-9_-]{32,128})/)?.[1] ?? (/^[A-Za-z0-9_-]{32,128}$/.test(v.trim()) ? v.trim() : null);
              if (!k) { setVilla("Þetta er ekki gildur tengill"); return; }
              try { localStorage.setItem(LS, k); } catch {}
              setVilla("");
              setLykill(k);
            }}
          >
            <input name="k" className={s.inntak} placeholder="https://kjarni.vercel.app/bio#k=…" autoComplete="off" />
            <button className={s.takki} type="submit">Tengja</button>
          </form>
          {villa && <p className={s.villa}>{villa}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className={s.sida}>
      <header className={s.haus}>
        <div className={s.hausEfst}>
          <h1 className={s.logo}>Bíó</h1>
          <div className={s.hausTakkar}>
            <button className={s.smatakki} onClick={() => void lesa(lykill)} disabled={hledur}>{hledur ? "Les…" : "Endurlesa"}</button>
            <button
              className={s.smatakki}
              onClick={async () => {
                try { await navigator.clipboard.writeText(`${location.origin}/bio#k=${lykill}`); setAfritad(true); setTimeout(() => setAfritad(false), 2500); } catch {}
              }}
              title="Afritar tengil með lyklinum — opnaðu hann í símanum til að tengja hann"
            >
              {afritad ? "Afritað ✓" : "Tengja síma"}
            </button>
          </div>
        </div>
        {safn ? (
          <p className={s.stada}>
            {safn.safn.thaettir} þættir og {safn.safn.myndir} myndir í Plex · {thaettir.length} fylgst með
            {nyttVikunni > 0 && <> · <b>{nyttVikunni} með nýjan þátt í vikunni</b></>} · uppfært {sidan(safn.uppfaert)}
          </p>
        ) : !hledur && !villa ? (
          <p className={s.stada}>Engin samantekt komin enn — keyrðu <code>node tools/bio-sync/sync.mjs</code> á PC-tölvunni.</p>
        ) : null}
        <nav className={s.flipar} role="tablist">
          {FLIPAR.map((f) => (
            <button key={f.k} role="tab" aria-selected={flipi === f.k} className={flipi === f.k ? s.flipiVal : s.flipi} onClick={() => setFlipi(f.k)}>
              {f.t}
            </button>
          ))}
        </nav>
      </header>

      {villa && <p className={s.villa}>{villa}</p>}

      {safn && safn.advaranir.some((a) => a.tillaga) && (
        <div className={s.advorun}>
          <b>Plex sér ekki alla þættina.</b>
          {safn.advaranir.filter((a) => a.tillaga).map((a) => (
            <p key={a.mappa}>
              Safnið „{a.safn}“ vísar á <code>{a.mappa}</code>, sem er ekki til. Skrárnar eru í <code>{a.tillaga}</code> — bættu henni við
              í Plex: {a.safn} → ⋯ → Edit Library → Add folders.
            </p>
          ))}
        </div>
      )}

      {flipi === "minir" && (
        <section>
          <div className={s.leit}>
            <input className={s.inntak} value={leit} onChange={(e) => setLeit(e.target.value)} placeholder="Bæta þætti á listann — t.d. Severance" />
            {nidurstodur.length > 0 && (
              <ul className={s.nidurstodur}>
                {nidurstodur.map((r) => (
                  <li key={r.id}>
                    {r.mynd ? <img src={r.mynd} alt="" /> : <span className={s.engin} />}
                    <span className={s.nidurNafn}>
                      <span>{r.nafn}{r.ar ? <span className={s.daufur}> ({r.ar})</span> : null}</span>
                      <span className={s.daufur}>{[r.stod, STADA[r.stada] ?? r.stada].filter(Boolean).join(" · ")}</span>
                    </span>
                    {iPlexNofn.has(norm(r.nafn)) && <span className={s.merkiPlex}>Í Plex</span>}
                    {fylgjaIds.has(r.id)
                      ? <span className={s.daufur}>Á listanum</span>
                      : <button className={s.smatakki} onClick={() => { baetaVid({ id: r.id, nafn: r.nafn, ar: r.ar, mynd: r.mynd, stod: r.stod }); setLeit(""); }}>+ Fylgjast</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {bidur.length > 0 && (
            <div className={s.bidur}>
              {bidur.map((f) => (
                <div key={f.id} className={s.bidurRod}>
                  <span>{f.nafn}{f.ar ? ` (${f.ar})` : ""} — bætist við í næstu samstillingu PC-tölvunnar</span>
                  <button className={s.textatakki} onClick={() => fjarlaegja(f.id)}>Hætta við</button>
                </div>
              ))}
            </div>
          )}

          <div className={s.listi}>
            {thaettir.map((t) => {
              const ns = t.nyjastaSeria;
              const opinn = opid === t.id;
              const nytt = t.nyjasti && t.nyjasti.dags >= vika;
              return (
                <article key={t.id} className={s.kort}>
                  {t.mynd ? <img className={s.plakat} src={t.mynd} alt="" loading="lazy" /> : <div className={s.plakat} />}
                  <div className={s.kortMid}>
                    <h2 className={s.titill}>
                      {t.nafn}
                      {nytt && <span className={s.merkiNytt}>Nýr þáttur</span>}
                    </h2>
                    <p className={s.daufur}>{[t.ar, t.stod, STADA[t.stada] ?? t.stada].filter(Boolean).join(" · ")}</p>

                    {ns && (
                      <div className={s.seria}>
                        <div className={s.seriaHaus}>
                          <span>Sería {ns.s}</span>
                          <span className={s.daufur}>{ns.synt}{ns.alls > ns.synt ? ` af ${ns.alls}` : ""} sýndir</span>
                        </div>
                        <div className={s.stika} aria-hidden>
                          <span className={s.stikaPlex} style={{ flex: ns.iPlex }} />
                          <span className={s.stikaDiskur} style={{ flex: ns.utanPlex }} />
                          <span className={s.stikaVantar} style={{ flex: ns.vantar }} />
                          <span className={s.stikaEftir} style={{ flex: Math.max(0, ns.alls - ns.synt) }} />
                        </div>
                        <p className={s.seriaTolur}>
                          {ns.iPlex > 0 && <span className={s.tPlex}>{ns.iPlex} í Plex</span>}
                          {ns.utanPlex > 0 && <span className={s.tDiskur}>{ns.utanPlex} á diski utan Plex</span>}
                          {ns.vantar > 0 && <span className={s.tVantar}>vantar {ns.vantarEp}</span>}
                          {ns.vantar === 0 && ns.utanPlex === 0 && <span className={s.tPlex}>allt komið</span>}
                        </p>
                      </div>
                    )}

                    <dl className={s.thaettirNy}>
                      {t.nyjasti && (<><dt>Nýjasti</dt><dd>{t.nyjasti.kodi} · {dags(t.nyjasti.dags)} <span className={s.daufur}>{t.nyjasti.nafn}</span></dd></>)}
                      {t.naesti && (<><dt>Næsti</dt><dd>{t.naesti.kodi} · {t.naesti.dags ? `${dags(t.naesti.dags)} (${afstaett(t.naesti.dags)})` : "dagsetning óljós"}</dd></>)}
                      {t.osedir ? (<><dt>Óséðir</dt><dd>{t.osedir} í Plex</dd></>) : null}
                    </dl>

                    <div className={s.kortTakkar}>
                      <button className={s.textatakki} onClick={() => setOpid(opinn ? null : t.id)}>{opinn ? "Fela" : "Allar seríur"}</button>
                      <a className={s.textatakki} href={t.slod} target="_blank" rel="noreferrer">TVmaze</a>
                      {t.uppruni === "sida" && <button className={s.textatakki} onClick={() => fjarlaegja(t.id)}>Hætta að fylgjast</button>}
                    </div>

                    {opinn && (
                      <div className={s.allt}>
                        <p>{t.synt} sýndir alls · {t.iPlex} í Plex · {t.utanPlex} á diski utan Plex · {t.vantar} vantar</p>
                        {t.vantarSeriur.length > 0 && (
                          <p><b>Vantar:</b> {t.vantarSeriur.map((x) => `S${String(x.s).padStart(2, "0")}: ${x.ep}`).join(" · ")}</p>
                        )}
                        {t.utanPlexSeriur.length > 0 && (
                          <p><b>Á diski utan Plex:</b> {t.utanPlexSeriur.map((x) => `S${String(x.s).padStart(2, "0")}: ${x.ep}`).join(" · ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {safn && thaettir.length === 0 && <p className={s.daufur}>Engir þættir á listanum enn.</p>}
        </section>
      )}

      {flipi === "nyir" && safn && (
        <section>
          <div className={s.sia}>
            <span className={s.daufur}>Fyrstu þættir síðustu 14 daga á streymisveitum og í bandarísku/bresku sjónvarpi.</span>
            <label className={s.rofi}><input type="checkbox" checked={felaPlex} onChange={(e) => setFelaPlex(e.target.checked)} /> Fela það sem er í Plex</label>
          </div>
          <div className={s.grind}>
            {safn.nyirThaettir.filter((n) => !felaPlex || !n.iPlex).map((n) => (
              <article key={n.id} className={s.plakatKort}>
                <div className={s.plakatRammi}>
                  {n.mynd ? <img src={n.mynd} alt="" loading="lazy" /> : <span>{n.nafn}</span>}
                  {n.iPlex && <span className={s.merkiPlexA}>Í Plex</span>}
                </div>
                <h3 className={s.plakatTitill}>{n.nafn}</h3>
                <p className={s.daufur}>{[n.stod, `frums. ${dags(n.frumsynt)}`].filter(Boolean).join(" · ")}</p>
                {n.tegund.length > 0 && <p className={s.tegund}>{n.tegund.slice(0, 3).join(" · ")}</p>}
                {n.lysing && <p className={s.lysing}>{n.lysing}</p>}
                <div className={s.kortTakkar}>
                  {fylgjaIds.has(n.id)
                    ? <span className={s.daufur}>Á listanum</span>
                    : <button className={s.smatakki} onClick={() => baetaVid({ id: n.id, nafn: n.nafn, ar: n.ar, mynd: n.mynd, stod: n.stod })}>+ Fylgjast</button>}
                  <a className={s.textatakki} href={n.slod} target="_blank" rel="noreferrer">TVmaze</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {flipi === "myndir" && safn && (
        <section>
          <div className={s.sia}>
            <span className={s.daufur}>Vinsælustu myndirnar á iTunes (US) — nýjustu stafrænu útgáfurnar.</span>
            <label className={s.rofi}><input type="checkbox" checked={felaPlex} onChange={(e) => setFelaPlex(e.target.checked)} /> Fela það sem er í Plex</label>
          </div>
          <div className={s.grind}>
            {safn.nyjarMyndir.filter((m) => !felaPlex || !m.iPlex).map((m) => (
              <article key={`${m.saeti}-${m.nafn}`} className={s.plakatKort}>
                <div className={s.plakatRammi}>
                  {m.mynd ? <img src={m.mynd} alt="" loading="lazy" /> : <span>{m.nafn}</span>}
                  <span className={s.saeti}>#{m.saeti}</span>
                  {m.iPlex && <span className={s.merkiPlexA}>Í Plex</span>}
                </div>
                <h3 className={s.plakatTitill}>{m.nafn}</h3>
                <p className={s.daufur}>{[m.utgafa && dags(m.utgafa), m.tegund].filter(Boolean).join(" · ")}</p>
                {m.leikstjori && <p className={s.tegund}>{m.leikstjori}</p>}
                {m.lysing && <p className={s.lysing}>{m.lysing}</p>}
                {m.slod && <div className={s.kortTakkar}><a className={s.textatakki} href={m.slod} target="_blank" rel="noreferrer">Apple TV</a></div>}
              </article>
            ))}
          </div>
        </section>
      )}

      {safn && (
        <footer className={s.fotur}>
          Samstillt frá PC-tölvunni {timi(safn.uppfaert)} ({safn.tok} s). Gögn: Plex, TVmaze, iTunes.
          {safn.advaranir.some((a) => !a.tillaga) && (
            <> Möppur í Plex sem eru ekki til: {safn.advaranir.filter((a) => !a.tillaga).map((a) => `${a.mappa} (${a.safn})`).join(", ")}.</>
          )}
        </footer>
      )}
    </main>
  );
}
