import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ArtCraftClient from "../ArtCraftClient";
import { ARTCRAFT_APPS, artcraftAppHref, getArtcraftApp, isOfficecraftApp } from "../apps";

type Params = { app: string };

/** Aðeins ArtCraft-öppin; OfficeCraft-öppin búa undir /kjarni/officecraft/<id>. */
export function generateStaticParams() {
  return ARTCRAFT_APPS.filter((app) => !isOfficecraftApp(app.id)).map((app) => ({ app: app.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { app: id } = await params;
  const app = getArtcraftApp(id);
  if (!app) return { title: "ArtCraft — Kjarni" };
  return {
    title: `${app.name} — Kjarni`,
    description: `${app.name}: ${app.desc}`,
  };
}

export default async function ArtCraftAppPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { app: id } = await params;
  const app = getArtcraftApp(id);
  if (!app) notFound();
  // Gamlir hlekkir (/kjarni/artcraft/wordcraft o.fl.) fara á nýja OfficeCraft-staðinn.
  if (isOfficecraftApp(app.id)) permanentRedirect(artcraftAppHref(app.id));
  return <ArtCraftClient app={app} />;
}
