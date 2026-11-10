"use client";

/** Myndir og myndbönd: gallerí á blaði iðkanda og skoðari á öllum skjánum.
 *  Skrárnar eru í tækinu (og í lokuðu skúffunni í skýinu ef þær eru undir
 *  48 MB); smámyndir eru búnar til úr skránni sjálfri þegar hún er við höndina. */

import { useEffect, useRef, useState } from "react";
import { CloudDownload, Film, ImagePlus, Play, Trash2, X } from "lucide-react";
import { ElementField, Stars } from "./ElementField";
import { MAX_CLOUD_BYTES, type Media } from "./library";
import { loadMediaBlob } from "./store";

export const MEDIA_ACCEPT = "image/*,video/*";

/** Minnkar mynd svo lengri hliðin verði mest `maxSide` (JPEG). */
export async function fitPhoto(file: Blob, maxSide = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað myndina");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað myndina"))), "image/jpeg", 0.86));
  } finally {
    bmp.close();
  }
}

export function sizeLabel(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Slóð á skrána ef hún er í tækinu (myndir eru líka sóttar úr skýinu — þær eru litlar). */
function useLocalUrl(media: Media, open: (m: Media) => Promise<Blob | null>): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let made = "";
    let alive = true;
    const load = media.kind === "mynd" ? open(media) : loadMediaBlob(media.id).then((b) => b ?? null);
    void load
      .catch(() => null)
      .then((blob) => {
        if (!alive) return;
        if (!blob) {
          setUrl(null);
          return;
        }
        made = URL.createObjectURL(blob);
        setUrl(made);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id]);
  return url;
}

function Tile({ media, open, onOpen }: { media: Media; open: (m: Media) => Promise<Blob | null>; onOpen: (m: Media) => void }) {
  const url = useLocalUrl(media, open);
  return (
    <button type="button" className="tk-tile" onClick={() => onOpen(media)} aria-label={`${media.kind === "mynd" ? "Mynd" : "Myndband"}: ${media.name}`}>
      {media.kind === "mynd" ? (
        url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" />
        ) : null
      ) : url ? (
        <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
      ) : (
        <span className="tk-tile-cloud">
          {url === null ? <CloudDownload size={22} /> : <Film size={22} />}
          {url === null && <small>{media.size > MAX_CLOUD_BYTES ? "ekki í þessu tæki" : "í skýinu"}</small>}
        </span>
      )}
      {media.kind === "myndband" && (
        <i className="tk-tile-play">
          <Play size={14} fill="currentColor" />
        </i>
      )}
    </button>
  );
}

type GalleryProps = {
  media: Media[];
  onAdd: (files: File[]) => Promise<void>;
  open: (m: Media) => Promise<Blob | null>;
  onDelete: (m: Media) => void;
};

export function Gallery({ media, onAdd, open, onDelete }: GalleryProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<{ media: Media; url: string | null; loading: boolean } | null>(null);
  const viewUrl = useRef("");

  const close = () => {
    if (viewUrl.current) URL.revokeObjectURL(viewUrl.current);
    viewUrl.current = "";
    setViewing(null);
  };
  useEffect(
    () => () => {
      if (viewUrl.current) URL.revokeObjectURL(viewUrl.current);
    },
    [],
  );

  async function show(m: Media) {
    setViewing({ media: m, url: null, loading: true });
    const blob = await open(m).catch(() => null);
    if (viewUrl.current) URL.revokeObjectURL(viewUrl.current);
    viewUrl.current = blob ? URL.createObjectURL(blob) : "";
    setViewing((v) => (v && v.media.id === m.id ? { media: m, url: viewUrl.current || null, loading: false } : v));
  }

  return (
    <>
      <div className="tk-tiles">
        {media.map((m) => (
          <Tile key={m.id} media={m} open={open} onOpen={(x) => void show(x)} />
        ))}
        <button type="button" className="tk-tile add" onClick={() => input.current?.click()} disabled={busy} aria-label="Bæta við mynd eða myndbandi">
          <ImagePlus size={24} />
          <small>{busy ? "Vista…" : "Bæta við"}</small>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          try {
            await onAdd(files);
          } finally {
            setBusy(false);
          }
        }}
      />
      {viewing && (
        <div className="tk-viewer" role="dialog" aria-modal="true" aria-label={viewing.media.name}>
          <div className="tk-viewer-bar">
            <button type="button" className="tk-iconbtn" onClick={close} aria-label="Loka">
              <X size={22} />
            </button>
            <span className="tk-ellipsis">
              {viewing.media.name} · {sizeLabel(viewing.media.size)}
            </span>
            <button
              type="button"
              className="tk-iconbtn"
              aria-label="Eyða"
              onClick={() => {
                if (!window.confirm(viewing.media.kind === "mynd" ? "Eyða myndinni?" : "Eyða myndbandinu?")) return;
                onDelete(viewing.media);
                close();
              }}
            >
              <Trash2 size={20} />
            </button>
          </div>
          <div className="tk-viewer-stage">
            {viewing.loading ? (
              <span className="tk-spinner" />
            ) : !viewing.url ? (
              <p className="tk-blank">
                {viewing.media.size > MAX_CLOUD_BYTES
                  ? "Þetta myndband var of stórt fyrir skýið og er bara í tækinu sem það var sett inn í."
                  : "Náði ekki í skrána — ertu á netinu?"}
              </p>
            ) : viewing.media.kind === "mynd" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewing.url} alt={viewing.media.name} />
            ) : (
              <video src={viewing.url} controls playsInline autoPlay />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ hápunktar merktir í myndbandi

type MarkerProps = {
  url: string;
  /** Hvar í myndbandinu dansinn byrjar (sek). */
  start: number;
  markers: Array<{ t: number; label: string; grade?: number }>;
  onChange: (markers: Array<{ t: number; label: string; grade?: number }>) => void;
  onStart: (start: number) => void;
  onClose: () => void;
};

const clock = (sec: number) => {
  const s = Math.max(0, sec);
  const total = Math.round(s * 10);
  return `${Math.floor(total / 600)}:${String(Math.floor((total % 600) / 10)).padStart(2, "0")},${total % 10}`;
};

/** Horft á upptöku af dansinum og hápunktarnir merktir á meðan: „Dansinn
 *  byrjar hér“ setur núllpunktinn, „Hápunktur núna!“ merkir staðinn. */
export function DanceMarker({ url, start, markers, onChange, onStart, onClose }: MarkerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [length, setLength] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) setT(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (to: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(length || to, to));
    setT(v.currentTime);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };
  const inDance = t - start;
  const sorted = markers.map((m, i) => ({ ...m, i })).sort((a, b) => a.t - b.t);

  return (
    <div className="tk-viewer" role="dialog" aria-modal="true" aria-label="Merkja hápunkta í myndbandi">
      <div className="tk-viewer-bar">
        <button type="button" className="tk-iconbtn" onClick={onClose} aria-label="Loka">
          <X size={22} />
        </button>
        <span className="tk-ellipsis">Hápunktar í myndbandi</span>
        <button type="button" className="tk-btn" onClick={onClose}>
          Lokið
        </button>
      </div>
      <div className="tk-marker-video">
        <video
          ref={video}
          src={url}
          playsInline
          preload="auto"
          onClick={toggle}
          onLoadedMetadata={(e) => setLength(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>
      <div className="tk-marker-controls">
        <div className="tk-scrub">
          <input type="range" className="tk-range" min={0} max={Math.max(0.1, length)} step={0.05} value={Math.min(t, length || t)} onChange={(e) => seek(Number(e.target.value))} aria-label="Staður í myndbandinu" />
          {length > 0 && (
            <span className="tk-scrub-marks" aria-hidden="true">
              <i className="start" style={{ left: `${(start / length) * 100}%` }} />
              {markers.map((m, i) => (
                <i key={i} style={{ left: `${Math.min(100, ((start + m.t) / length) * 100)}%` }} />
              ))}
            </span>
          )}
        </div>
        <div className="tk-row center">
          <button type="button" className="tk-btn" onClick={() => seek(t - 5)}>
            − 5 s
          </button>
          <button type="button" className="tk-round play small" onClick={toggle} aria-label={playing ? "Stöðva" : "Spila"}>
            {playing ? <span className="tk-pause-bars" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button type="button" className="tk-btn" onClick={() => seek(t + 5)}>
            + 5 s
          </button>
          <span className="tk-marker-clock">
            <strong>{inDance >= 0 ? clock(inDance) : `−${clock(-inDance)}`}</strong>
            <small>{inDance >= 0 ? "í dansinum" : "fyrir byrjun"}</small>
          </span>
        </div>
        <div className="tk-cta-row">
          <button type="button" className="tk-cta ghost" onClick={() => onStart(Math.round(t * 10) / 10)} title="Núllpunktur dansins: tímarnir eru taldir héðan">
            Dansinn byrjar hér
          </button>
          <button type="button" className="tk-cta" disabled={inDance < 0} onClick={() => onChange([...markers, { t: Math.round(inDance * 10) / 10, label: "" }])}>
            Hápunktur núna!
          </button>
        </div>
        <p className="tk-hint">
          Dansinn byrjar á {clock(start)} í myndbandinu. Spilaðu og ýttu á „Hápunktur núna!“ í hvert sinn sem eitthvað gerist — stökk,
          snúningur, lokastaða.
        </p>
        {sorted.map((m) => (
          <div className="tk-marker" key={`${m.i}:${m.t}`}>
            <button type="button" className="tk-time as-button" onClick={() => seek(start + m.t)} aria-label={`Fara á ${clock(m.t)}`}>
              {clock(m.t)}
            </button>
            <ElementField value={m.label} onChange={(label) => onChange(markers.map((x, j) => (j === m.i ? { ...x, label } : x)))} />
            <button type="button" className="tk-btn icon danger" onClick={() => onChange(markers.filter((_, j) => j !== m.i))} aria-label="Eyða hápunkti">
              <Trash2 size={17} />
            </button>
            <Stars value={m.grade} label={m.label || clock(m.t)} onChange={(grade) => onChange(markers.map((x, j) => (j === m.i ? { t: x.t, label: x.label, ...(grade ? { grade } : {}) } : x)))} />
          </div>
        ))}
      </div>
    </div>
  );
}
