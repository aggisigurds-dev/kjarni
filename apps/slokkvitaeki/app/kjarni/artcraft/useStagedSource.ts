"use client";

import { useEffect } from "react";
import { getFromStaging, type StagingItem } from "./artcraftStaging";

/** Hook sem leitar að `?use=<id>` í URL við mount, sækir blobinn úr staging
 * og lætur tólið sjálft meðhöndla hann (yfirleitt eins og notandi hefði bara
 * uploadað). Hreinsar ?use= úr URL eftir ad hafa afgreitt það svo refresh
 * endurtaki ekki.
 *
 * Notkun í client:
 *   useStagedSource((blob, item) => {
 *     const file = new File([blob], item.name || "from-staging.png", { type: blob.type });
 *     void acceptFile(file);
 *   });
 */
export function useStagedSource(
  onReady: (blob: Blob, item: StagingItem) => void | Promise<void>,
) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const useId = params.get("use");
    if (!useId) return;

    let cancelled = false;
    void (async () => {
      const item = await getFromStaging(useId);
      if (cancelled || !item) {
        // Hreinsum ?use= úr URL hvort eð er svo refresh retrieve-i ekki
        // dauðan id.
        clearUseParam();
        return;
      }
      try {
        await onReady(item.blob, item);
      } finally {
        clearUseParam();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function clearUseParam() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("use")) {
      url.searchParams.delete("use");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    /* ignore */
  }
}
