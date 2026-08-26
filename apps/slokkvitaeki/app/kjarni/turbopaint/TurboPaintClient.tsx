"use client";

import { StationChrome } from "../StationChrome";
import { TurboPaintApp } from "./components/kjarni/TurboPaintApp";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import "./styles.css";

export default function TurboPaintClient() {
  return (
    <StationChrome tool="turbopaint">
      <TooltipProvider>
        <TurboPaintApp />
        <Toaster theme="dark" />
      </TooltipProvider>
    </StationChrome>
  );
}
