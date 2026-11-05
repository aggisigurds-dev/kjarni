import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArtCraftClient from "../../artcraft/ArtCraftClient";
import { OFFICECRAFT_APP_IDS, getArtcraftApp, isOfficecraftApp } from "../../artcraft/apps";

type Params = { app: string };

export const dynamicParams = false;

export function generateStaticParams() {
  return OFFICECRAFT_APP_IDS.map((id) => ({ app: id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { app: id } = await params;
  const app = getArtcraftApp(id);
  if (!app) return { title: "OfficeCraft — Kjarni" };
  return {
    title: `${app.name} — OfficeCraft — Kjarni`,
    description: `${app.name}: ${app.desc}`,
  };
}

export default async function OfficeCraftAppPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { app: id } = await params;
  const app = getArtcraftApp(id);
  if (!app || !isOfficecraftApp(app.id)) notFound();
  return <ArtCraftClient app={app} />;
}
