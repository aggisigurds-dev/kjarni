import type { Metadata } from "next";
import { Suspense } from "react";
import BakgrunnurClient from "./BakgrunnurClient";

type Search = { botn?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const { botn } = await searchParams;
  if (botn === "hvitt") {
    return {
      title: "Á hvítan bakgrunn — Kjarni",
      description: "Settu vörumyndir á hreint hvítt. Veggur, borð og skuggi fara, í vafranum.",
    };
  }
  return {
    title: "Bakgrunnur — Kjarni",
    description: "Fjarlægðu bakgrunn af vörumyndum sjálfkrafa. PNG með gegnsæi, í vafranum.",
  };
}

export default function BakgrunnurPage() {
  return (
    <Suspense>
      <BakgrunnurClient />
    </Suspense>
  );
}
