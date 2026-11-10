import { NextRequest, NextResponse } from "next/server";

// Manifest THE COACH. Lykill skúffunnar (?k=…) fer með í start_url, svo appið
// sem er sett á heimaskjá opnar sömu rútínur og Safari gerði — á iPhone deila
// uppsett app og Safari ekki geymslu.
export function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get("k") ?? "";
  const start = /^[0-9a-f]{64}$/.test(k) ? `/coach?k=${k}` : "/coach";
  return NextResponse.json(
    {
      name: "THE COACH",
      short_name: "THE COACH",
      description: "Þjálfaraappið: skipulag, iðkendur og tónlist fyrir rútínur.",
      lang: "is",
      id: "/coach",
      start_url: start,
      scope: "/coach",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0f0a1e",
      theme_color: "#0f0a1e",
      icons: [
        { src: "/coach/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/coach/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/coach/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
