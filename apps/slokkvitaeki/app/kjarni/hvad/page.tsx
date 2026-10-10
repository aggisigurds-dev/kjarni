import type { Metadata } from "next";
import { StationChrome } from "../StationChrome";
import { HvadGetEgGert } from "../HvadGetEgGert";

export const metadata: Metadata = {
  title: "Hvað get ég gert? — Kjarni",
  description: "Þessi vefur, spjallið og kóðinn — og tól sem hægt er að smella á.",
};

export default function HvadPage() {
  return (
    <StationChrome tool="hvad">
      <HvadGetEgGert />
    </StationChrome>
  );
}
