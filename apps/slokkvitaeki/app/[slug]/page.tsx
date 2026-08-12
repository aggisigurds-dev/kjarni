import { notFound } from "next/navigation";
import { SUPABASE_URL, SUPABASE_KEY } from "../lib/supabase";
import { SiteHeader } from "../SiteHeader";
import { SiteFooter } from "../SiteFooter";
import { Banner } from "../Banner";
import { PageBlocks, type Block } from "../PageBlocks";

export const dynamic = "force-dynamic";

type Page = { titill: string; blokkir: Block[] };

async function getPage(slod: string): Promise<Page | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kjarni_sidur?slod=eq.${encodeURIComponent(slod)}&birt=eq.true&select=titill,blokkir`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Page[];
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  return {
    title: page?.titill
      ? `${page.titill} — Brunahólf Slökkvitæki`
      : "Brunahólf Slökkvitæki ehf",
  };
}

export default async function DynamicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <main>
      <Banner />
      <SiteHeader />
      <PageBlocks blocks={page.blokkir || []} />
      <SiteFooter />
    </main>
  );
}
