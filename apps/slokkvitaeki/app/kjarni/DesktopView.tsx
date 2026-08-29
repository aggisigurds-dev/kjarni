"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DESK_WIDTH,
  ZOOM_KEY,
  fitZoom,
  readStoredZoom,
  stepZoom,
  shouldLockDesktop,
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
  const zoomReady = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const lock = shouldLockDesktop(window.screen.width, window.screen.height, window.innerWidth);
      setPhone(lock);
      if (lock) {
        document.documentElement.dataset.deskLock = "1";
        setViewH(window.innerHeight);
        if (!zoomReady.current) {
          zoomReady.current = true;
          setZoom(readStoredZoom(window.localStorage.getItem(ZOOM_KEY), fitZoom(window.innerWidth)));
        }
      } else {
        zoomReady.current = false;
        delete document.documentElement.dataset.deskLock;
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
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
