"use client";

import { StationChrome } from "../kjarni/StationChrome";

export default function SkjalarinnClient() {
  return (
    <StationChrome tool="skjalarinn">
      <iframe
        className="stn-frame"
        src="/skjalarinn.html?theme=light"
        title="Skjalarinn"
      />
    </StationChrome>
  );
}
