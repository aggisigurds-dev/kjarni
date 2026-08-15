import type { Metadata } from "next";
import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase";

type Site = { id: number; nafn: string; slug: string; tegund: string; stada: string; buid_til: string };

async function getSite(slug: string): Promise<Site | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kjarni_sites?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: "no-store" },
    );
    const rows = (await res.json()) as Site[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSite(slug);
  return { title: site ? `${site.nafn} — kjarni` : "Vefur — kjarni" };
}

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSite(slug);

  if (!site) {
    return (
      <main className="site404">
        <h1>Vefur fannst ekki</h1>
        <p>Enginn vefur er skráður á slóðinni <code>/s/{slug}</code>.</p>
        <a className="site-btn" href="/kjarni">← Til baka í stjórnstöð</a>
      </main>
    );
  }

  const dags = new Date(site.buid_til).toLocaleDateString("is-IS");
  return (
    <main className="site-shell">
      <header className="site-hd">
        <span className="site-badge">◉</span>
        <span className="site-kjarni">kjarni</span>
      </header>
      <section className="site-hero">
        <span className="site-eyebrow">{site.tegund === "kerfi" ? "Þjónustukerfi" : "Nýr vefur"} · stofnaður {dags}</span>
        <h1>{site.nafn}</h1>
        <p>Þessi vefur er stofnaður og kominn í loftið á kjarni. Hann er tilbúinn til að byggja — bættu við síðum, blokkum og einingum úr stjórnstöðinni.</p>
        <div className="site-cta">
          <a className="site-btn site-btn-p" href="/stjorn">Opna síðuritil →</a>
          <a className="site-btn" href="/kjarni">Stjórnstöð</a>
        </div>
      </section>
      <section className="site-next">
        <h2>Næstu skref</h2>
        <div className="site-steps">
          <div><b>1 · Síður</b><span>Búðu til forsíðu og undirsíður með blokkum í síðuritlinum.</span></div>
          <div><b>2 · Einingar</b><span>Kveiktu á verslun, formi, korti eða öðrum einingum eftir þörf.</span></div>
          <div><b>3 · Birta</b><span>Birtu vefinn og deildu slóðinni <code>/s/{site.slug}</code>.</span></div>
        </div>
      </section>
    </main>
  );
}
