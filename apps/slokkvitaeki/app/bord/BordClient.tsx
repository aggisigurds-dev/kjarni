"use client";

import { StationChrome } from "../kjarni/StationChrome";

export default function BordClient() {
  return (
    <StationChrome tool="bord">
      <iframe
        className="stn-frame"
        src="/stjornbord.html"
        title="Stjórnborð"
      />
    </StationChrome>
  );
}
