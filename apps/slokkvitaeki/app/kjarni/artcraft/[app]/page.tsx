import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArtCraftClient from "../ArtCraftClient";
import { ARTCRAFT_APPS, getArtcraftApp } from "../apps";

type Params = { app: string };

export function generateStaticParams() {
  return ARTCRAFT_APPS.map((app) => ({ app: app.id }));
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
  return <ArtCraftClient app={app} />;
}
