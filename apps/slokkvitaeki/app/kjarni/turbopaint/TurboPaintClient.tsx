"use client";

import { StationChrome } from "../StationChrome";
import { TurboPaintApp } from "./components/kjarni/TurboPaintApp";
import { OfflineReady } from "./components/kjarni/OfflineReady";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import "./styles.css";

export default function TurboPaintClient() {
  return (
    <StationChrome tool="turbopaint">
      <TooltipProvider>
        <OfflineReady />
        <TurboPaintApp />
        {/* Í síma (sonner: ≤ 600 px) fljóta tilkynningar ofan við neðri stikurnar (þétti veggjaritillinn, tákn, litir)
            í stað þess að leggjast yfir þær — „⌘Z afturkallar"-tilkynningin huldi annars Afturkalla-hnappinn. */}
        <Toaster theme="dark" mobileOffset={{ bottom: "7.25rem" }} />
      </TooltipProvider>
    </StationChrome>
  );
}
