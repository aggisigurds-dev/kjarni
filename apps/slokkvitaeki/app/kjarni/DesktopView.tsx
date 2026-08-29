"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DESK_WIDTH,
  ZOOM_KEY,
  fitZoom,
  isPhoneScreen,
  readStoredZoom,
  stepZoom,
} from "./desktop-view";

export function DesktopView({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [phone, setPhone] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [stageH, setStageH] = useState(0);
  const [viewH, setViewH] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !isPhoneScreen(window.screen.width, window.screen.height)) return;
    setPhone(true);
    document.documentElement.dataset.deskLock = "1";
    const fit = fitZoom(window.innerWidth);
    setViewH(window.innerHeight);
    setZoom(readStoredZoom(window.localStorage.getItem(ZOOM_KEY), fit));
    const onResize = () => setViewH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      delete document.documentElement.dataset.deskLock;
    };
  }, [enabled]);

  useEffect(() => {
    if (!phone) return;
    window.localStorage.setItem(ZOOM_KEY, String(zoom));
  }, [phone, zoom]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !phone) return;
    const update = () => setStageH(el.scrollHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone]);

  const bump = useCallback((direction: 1 | -1) => {
    setZoom((z) => stepZoom(z, direction));
  }, []);

  if (!phone) return children;

  const sizerW = Math.round(DESK_WIDTH * zoom);
  const sizerH = Math.max(Math.round(stageH * zoom), viewH);

  return (
    <div className="desk-port">
      <button
        type="button"
        className="desk-zoom-btn desk-zoom-minus"
        aria-label="Minnka"
        onClick={() => bump(-1)}
      >
        −
      </button>
      <button
        type="button"
        className="desk-zoom-btn desk-zoom-plus"
        aria-label="Stækka"
        onClick={() => bump(1)}
      >
        +
      </button>
      <div className="desk-sizer" style={{ width: sizerW, height: sizerH }}>
        <div
          ref={stageRef}
          className="desk-stage"
          style={{ width: DESK_WIDTH, transform: `scale(${zoom})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
