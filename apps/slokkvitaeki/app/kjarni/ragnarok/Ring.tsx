"use client";

import { useEffect } from "react";

/* <ragnarok-ring> er vefíhlutur hönnunarkerfisins (ragnarok-ring.js, óbreytt afrit).
 * Hann skráir sig sjálfur við fyrstu hleðslu; hér er hann aðeins hlaðinn í vafra. */
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "ragnarok-ring": {
        size?: number | string;
        label?: string;
        sub?: string;
        mode?: "core" | "gauge" | "tala";
        value?: number | string;
        density?: number | string;
        bearings?: boolean | "";
        active?: boolean | "";
        class?: string;
        className?: string;
        "aria-hidden"?: boolean | "true";
      };
    }
  }
}

export function RagnarokRing(props: {
  size: number;
  label?: string;
  sub?: string;
  bearings?: boolean;
  density?: number;
  className?: string;
}) {
  useEffect(() => {
    void import("./ragnarok-ring.js");
  }, []);
  const { bearings, ...rest } = props;
  return <ragnarok-ring {...rest} {...(bearings ? { bearings: "" as const } : {})} aria-hidden="true" />;
}
