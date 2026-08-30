import { useEffect, useState } from "react";

function isMobileUi() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
}

/** Phone / tablet / coarse pointer — Miro-style chrome instead of the desktop docks. */
export function useMobileUi() {
  const [mobile, setMobile] = useState(isMobileUi);
  useEffect(() => {
    const apply = () => setMobile(isMobileUi());
    apply();
    window.addEventListener("resize", apply);
    const mq = window.matchMedia("(pointer: coarse)");
    mq.addEventListener("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      mq.removeEventListener("change", apply);
    };
  }, []);
  return mobile;
}
