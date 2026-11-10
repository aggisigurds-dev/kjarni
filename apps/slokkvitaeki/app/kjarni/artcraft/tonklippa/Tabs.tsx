"use client";

/** Skjáirnir „Safn“ og „Iðkendur“ á heimaskjá Tónklippu, og blaðið þar sem
 *  iðkandi er skráður: nafn, mynd, lengd rútínu, hápunktar í dansinum og lög
 *  sem gætu passað. */

import { useEffect, useRef, useState } from "react";
import { Camera, Ellipsis, Film, Music, Pause, Play, Plus, Star, Timer, Trash2, UserPlus, X } from "lucide-react";
import { formatTime, parseTime } from "./arrange";
import { COVERS, COVER_LABEL, putSkater, type Clip, type CoverStyle, type LibraryDoc, type Skater, type SkaterMarker, type Song } from "./library";
import { songFit, type Match } from "./match";
import { Avatar, Cover, MiniWave, SongPicker, fitLabel } from "./Parts";
import type { ProjectRecord } from "./store";
import { newId } from "./tracks";

const MARKER_WORDS = ["Stökk", "Snúningur", "Spírall", "Skrefaröð", "Lyfta", "Lokastaða"];
const LENGTHS = [60, 80, 90, 120, 150];

/** Hversu vel hvert lag í safninu passar við hápunkta iðkandans. */
export function fitsFor(songs: Song[], markers: SkaterMarker[], targetMin: number, targetMax: number): Map<string, Match | null> {
  const length = (targetMin + targetMax) / 2;
  const times = markers.map((m) => m.t);
  return new Map(songs.map((s) => [s.id, times.length ? songFit(s.highlights, times, length, s.duration) : null]));
}

// ------------------------------------------------------------------ safnið

type LibraryProps = {
  doc: LibraryDoc;
  filter: "all" | "fav";
  onFilter: (f: "all" | "fav") => void;
  /** Auðkenni þess sem er að spilast núna ("" = ekkert). */
  playing: string;
  onPlay: (id: string, songId: string, from?: number, to?: number, seek?: boolean) => void;
  onFav: (song: Song) => void;
  onCover: (song: Song, cover: CoverStyle | undefined) => void;
  onDeleteSong: (song: Song) => void;
  onDeleteClip: (clip: Clip) => void;
  onAddFile: () => void;
  onAddVideo: () => void;
};

export function LibraryTab({ doc, filter, onFilter, playing, onPlay, onFav, onCover, onDeleteSong, onDeleteClip, onAddFile, onAddVideo }: LibraryProps) {
  const [menuId, setMenuId] = useState("");
  const menu = doc.songs.find((s) => s.id === menuId);
  const songs = filter === "fav" ? doc.songs.filter((s) => s.fav) : doc.songs;
  const nameOf = (id: string) => doc.songs.find((s) => s.id === id)?.name ?? "";
  return (
    <>
      <div className="tk-cta-row">
        <button type="button" className="tk-cta" onClick={onAddFile}>
          <Plus size={20} /> Bæta við lagi
        </button>
        <button type="button" className="tk-cta ghost" onClick={onAddVideo}>
          <Film size={18} /> Úr myndbandi
        </button>
      </div>

      {doc.clips.length > 0 && (
        <>
          <div className="tk-section">
            <h2>Uppáhaldsbútar</h2>
          </div>
          <ul className="tk-rows">
            {doc.clips.map((c) => (
              <li key={c.id}>
                <button type="button" className="tk-round small" onClick={() => onPlay(c.id, c.songId, c.start, c.end)} aria-label={playing === c.id ? "Stöðva" : `Hlusta á ${c.name}`}>
                  {playing === c.id ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <div className="tk-row-text">
                  <strong>{c.name}</strong>
                  <small>
                    {nameOf(c.songId)} · {formatTime(c.start)}–{formatTime(c.end)} ({formatTime(c.end - c.start)})
                  </small>
                </div>
                <button type="button" className="tk-iconbtn small quiet" onClick={() => onDeleteClip(c)} aria-label={`Eyða bútnum ${c.name}`}>
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="tk-section">
        <h2>Lögin mín</h2>
        <div className="tk-seg" role="radiogroup" aria-label="Sía">
          <button type="button" role="radio" aria-checked={filter === "all"} className={filter === "all" ? "on" : ""} onClick={() => onFilter("all")}>
            Öll
          </button>
          <button type="button" role="radio" aria-checked={filter === "fav"} className={filter === "fav" ? "on" : ""} onClick={() => onFilter("fav")}>
            <Star size={13} fill="currentColor" /> Uppáhald
          </button>
        </div>
      </div>
      {songs.length === 0 ? (
        <p className="tk-blank">
          {filter === "fav"
            ? "Ekkert lag er merkt sem uppáhald enn. Ýttu á stjörnuna við lag."
            : "Safnið er tómt. Lög sem þú bætir við geymast hér og má nota aftur í hvaða rútínu sem er."}
        </p>
      ) : (
        <ul className="tk-rows">
          {songs.map((s) => (
            <li key={s.id} className="song">
              <Cover song={s} size={52} playing={playing === s.id} onPlay={() => onPlay(s.id, s.id)} />
              <div className="tk-row-text">
                <strong>{s.name}</strong>
                <small>
                  {formatTime(s.duration)}
                  {s.bpm ? ` · ≈ ${s.bpm} slög/mín` : ""}
                </small>
                <MiniWave song={s} onSeek={(t) => onPlay(s.id, s.id, t, undefined, true)} />
              </div>
              <button type="button" className={`tk-iconbtn small quiet${s.fav ? " gold" : ""}`} onClick={() => onFav(s)} aria-label={s.fav ? "Taka úr uppáhaldi" : "Setja í uppáhald"} aria-pressed={!!s.fav}>
                <Star size={19} fill={s.fav ? "currentColor" : "none"} />
              </button>
              <button type="button" className="tk-iconbtn small quiet" onClick={() => setMenuId(s.id)} aria-label={`Meira um ${s.name}`}>
                <Ellipsis size={19} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {doc.songs.length > 0 && <p className="tk-hint">Gylltu strikin á bylgjunni eru hápunktar lagsins — stór högg og staðir þar sem lagið lyftist. Ýttu á bylgjuna til að hlusta þaðan.</p>}

      {menu && (
        <div className="tk-sheet-back" onClick={() => setMenuId("")}>
          <div className="tk-sheet" role="dialog" aria-modal="true" aria-label={menu.name} onClick={(e) => e.stopPropagation()}>
            <div className="tk-sheet-head">
              <strong className="tk-ellipsis">{menu.name}</strong>
              <button type="button" className="tk-iconbtn small" onClick={() => setMenuId("")} aria-label="Loka">
                <X size={18} />
              </button>
            </div>
            <span className="tk-label wide">Umslag</span>
            <div className="tk-covers">
              <button type="button" className={!menu.cover ? "on" : ""} onClick={() => onCover(menu, undefined)}>
                <Cover song={{ ...menu, cover: undefined }} size={56} />
                Litur
              </button>
              {COVERS.map((c) => (
                <button type="button" key={c} className={menu.cover === c ? "on" : ""} onClick={() => onCover(menu, c)}>
                  <Cover song={{ ...menu, cover: c }} size={56} />
                  {COVER_LABEL[c]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tk-btn danger wide"
              onClick={() => {
                setMenuId("");
                onDeleteSong(menu);
              }}
            >
              <Trash2 size={15} /> Eyða laginu úr safninu
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ iðkendur

type SkatersProps = {
  doc: LibraryDoc;
  photos: Record<string, string>;
  projects: ProjectRecord[];
  onOpen: (skater: Skater) => void;
  onNew: () => void;
};

export function SkatersTab({ doc, photos, projects, onOpen, onNew }: SkatersProps) {
  return (
    <>
      <button type="button" className="tk-cta" onClick={onNew}>
        <UserPlus size={20} /> Nýr iðkandi
      </button>
      {doc.skaters.length === 0 ? (
        <p className="tk-blank">
          Skráðu þau sem þú þjálfar: nafn, mynd, hvað rútínan á að vera löng og hvar hápunktarnir í dansinum eru. Þá finnur appið
          lög og kafla sem passa.
        </p>
      ) : (
        <ul className="tk-cards">
          {doc.skaters.map((k) => {
            const count = projects.filter((p) => p.skaterId === k.id).length;
            return (
              <li key={k.id}>
                <button type="button" className="tk-card" onClick={() => onOpen(k)}>
                  <Avatar skater={k} url={photos[k.id]} size={52} />
                  <span className="tk-card-text">
                    <strong>{k.name || "Ónefndur iðkandi"}</strong>
                    <small>
                      {formatTime(k.targetMin)}–{formatTime(k.targetMax)} · {k.markers.length === 1 ? "1 hápunktur" : `${k.markers.length} hápunktar`} ·{" "}
                      {count === 1 ? "1 rútína" : `${count} rútínur`}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Minnkar mynd í 320×320 (skorið úr miðju) — nóg fyrir prófílmynd og létt í geymslu. */
export async function squarePhoto(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const side = Math.min(bmp.width, bmp.height);
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 320;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað myndina");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað myndina"))), "image/jpeg", 0.86));
  } finally {
    bmp.close();
  }
}

type SheetProps = {
  skater: Skater;
  isNew: boolean;
  doc: LibraryDoc;
  photoUrl?: string;
  projects: ProjectRecord[];
  onChange: (fn: (d: LibraryDoc) => LibraryDoc) => void;
  onPhoto: (skater: Skater, file: Blob | null) => Promise<void>;
  onOpenProject: (rec: ProjectRecord) => void;
  onNewRoutine: (skater: Skater) => void;
  onImport: (kind: "audio" | "video") => Promise<Song | null>;
  onDelete: (skater: Skater) => void;
  onClose: () => void;
};

/** Blað iðkanda. Hver breyting vistast strax. */
export function SkaterSheet({ skater, isNew, doc, photoUrl, projects, onChange, onPhoto, onOpenProject, onNewRoutine, onImport, onDelete, onClose }: SheetProps) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState(false);
  const [watch, setWatch] = useState<{ since: number; now: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) nameInput.current?.focus();
  }, [isNew]);

  // Skeiðklukkan: tifar á meðan hún er í gangi.
  useEffect(() => {
    if (!watch) return;
    const id = window.setInterval(() => setWatch((w) => (w ? { ...w, now: Date.now() } : w)), 100);
    return () => window.clearInterval(id);
  }, [watch !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (change: Partial<Skater>) => onChange((d) => putSkater(d, { ...(d.skaters.find((k) => k.id === skater.id) ?? skater), ...change, at: Date.now() }));
  const setMarkers = (markers: SkaterMarker[]) => save({ markers });
  const mine = projects.filter((p) => p.skaterId === skater.id);
  const fits = fitsFor(doc.songs, skater.markers, skater.targetMin, skater.targetMax);
  const chosen = skater.songIds.map((id) => doc.songs.find((s) => s.id === id)).filter((s): s is Song => !!s);
  const middle = Math.round((skater.targetMin + skater.targetMax) / 2);
  const elapsed = watch ? (watch.now - watch.since) / 1000 : 0;

  return (
    <div className="tk-root tk-full" role="dialog" aria-modal="true" aria-label={skater.name || "Nýr iðkandi"}>
      <header className="tk-top">
        <button type="button" className="tk-iconbtn" onClick={onClose} aria-label="Loka">
          <X size={22} />
        </button>
        <div className="tk-name-box">
          <strong className="tk-full-title">{skater.name || "Nýr iðkandi"}</strong>
          <span className="tk-saved">Vistast sjálfkrafa</span>
        </div>
      </header>

      <div className="tk-body">
        <div className="tk-pane">
          <div className="tk-profile">
            <button type="button" className="tk-photo" onClick={() => photoInput.current?.click()} aria-label="Velja prófílmynd" disabled={busy}>
              <Avatar skater={skater} url={photoUrl} size={96} />
              <span className="tk-photo-badge">
                <Camera size={16} />
              </span>
            </button>
            <div className="tk-profile-text">
              <input
                ref={nameInput}
                className="tk-word big"
                defaultValue={skater.name}
                placeholder="Nafn"
                aria-label="Nafn iðkanda"
                maxLength={60}
                onBlur={(e) => e.target.value.trim() !== skater.name && save({ name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              {skater.photoAt > 0 && (
                <button type="button" className="tk-link left" onClick={() => void onPhoto(skater, null)}>
                  Fjarlægja mynd
                </button>
              )}
            </div>
          </div>
          <p className="tk-hint">Nafn og mynd eru bara í tækinu þínu og í lokuðu skúffunni þinni í skýinu.</p>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                await onPhoto(skater, file);
              } finally {
                setBusy(false);
              }
            }}
          />

          <h3>Lengd rútínu</h3>
          <div className="tk-row">
            {LENGTHS.map((l) => (
              <button key={l} type="button" className={`tk-chip${middle === l ? " on" : ""}`} onClick={() => save({ targetMin: l - 10, targetMax: l + 10 })}>
                {formatTime(l)}
              </button>
            ))}
          </div>
          <div className="tk-field">
            <span className="tk-label">Má vera</span>
            <input
              key={`min:${skater.targetMin}`}
              className="tk-time"
              defaultValue={formatTime(skater.targetMin)}
              aria-label="Stysta leyfilega lengd"
              onBlur={(e) => {
                const v = parseTime(e.target.value);
                if (v == null || v < 5 || v > 1200) e.target.value = formatTime(skater.targetMin);
                else save({ targetMin: v, targetMax: Math.max(v, skater.targetMax) });
              }}
            />
            <span className="tk-muted">til</span>
            <input
              key={`max:${skater.targetMax}`}
              className="tk-time"
              defaultValue={formatTime(skater.targetMax)}
              aria-label="Lengsta leyfilega lengd"
              onBlur={(e) => {
                const v = parseTime(e.target.value);
                if (v == null || v < 5 || v > 1200) e.target.value = formatTime(skater.targetMax);
                else save({ targetMax: v, targetMin: Math.min(v, skater.targetMin) });
              }}
            />
          </div>

          <h3>Hápunktar í dansinum</h3>
          <p className="tk-hint">
            Hvenær gerist eitthvað í dansinum — stökk, snúningur, lokastaða? Sláðu tímana inn, eða farðu í gegnum dansinn með
            skeiðklukkunni og ýttu í hvert sinn.
          </p>
          <datalist id="tk-skater-words">
            {MARKER_WORDS.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
          {skater.markers.map((m, i) => (
            <div className="tk-marker" key={`${i}:${m.t}`}>
              <input
                className="tk-time"
                defaultValue={formatTime(m.t, true)}
                inputMode="decimal"
                aria-label="Tími hápunkts"
                onBlur={(e) => {
                  const t = parseTime(e.target.value);
                  if (t == null) e.target.value = formatTime(m.t, true);
                  else if (Math.abs(t - m.t) > 0.04) setMarkers(skater.markers.map((x, j) => (j === i ? { ...x, t } : x)));
                }}
              />
              <input
                className="tk-word"
                defaultValue={m.label}
                list="tk-skater-words"
                placeholder="Hvað gerist?"
                aria-label="Lýsing hápunkts"
                maxLength={60}
                onBlur={(e) => e.target.value !== m.label && setMarkers(skater.markers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <button type="button" className="tk-btn icon danger" onClick={() => setMarkers(skater.markers.filter((_, j) => j !== i))} aria-label="Eyða hápunkti">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          {watch ? (
            <div className="tk-watch">
              <strong>{formatTime(elapsed, true)}</strong>
              <button type="button" className="tk-cta" onClick={() => setMarkers([...skater.markers, { t: elapsed, label: "" }])}>
                Hápunktur núna!
              </button>
              <button type="button" className="tk-btn" onClick={() => setWatch(null)}>
                Stöðva
              </button>
            </div>
          ) : (
            <div className="tk-row">
              <button type="button" className="tk-btn" onClick={() => setMarkers([...skater.markers, { t: (skater.markers[skater.markers.length - 1]?.t ?? 0) + 10, label: "" }])}>
                <Plus size={16} /> Bæta við
              </button>
              <button type="button" className="tk-btn" onClick={() => setWatch({ since: Date.now(), now: Date.now() })}>
                <Timer size={16} /> Skeiðklukka
              </button>
            </div>
          )}

          <h3>Lög sem gætu passað</h3>
          {chosen.length === 0 && <p className="tk-muted">Engin lög valin enn.</p>}
          <ul className="tk-rows flat">
            {chosen.map((s) => (
              <li key={s.id} className="song">
                <div className="tk-row-text">
                  <strong>{s.name}</strong>
                  <small>
                    {formatTime(s.duration)}
                    {fits.get(s.id) ? ` · besti kaflinn hittir á ${fitLabel(fits.get(s.id))}` : ""}
                  </small>
                  <MiniWave song={s} from={fits.get(s.id)?.start} to={fits.get(s.id) ? fits.get(s.id)!.start + middle : undefined} />
                </div>
                <button type="button" className="tk-iconbtn small quiet" onClick={() => save({ songIds: skater.songIds.filter((id) => id !== s.id) })} aria-label={`Taka ${s.name} af listanum`}>
                  <X size={17} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="tk-btn" onClick={() => setPicker(true)}>
            <Music size={16} /> Bæta lagi á listann
          </button>

          <h3>Rútínur</h3>
          {mine.length === 0 && <p className="tk-muted">Engin rútína enn.</p>}
          <ul className="tk-rows flat">
            {mine.map((p) => (
              <li key={p.id}>
                <button type="button" className="tk-pick" onClick={() => onOpenProject(p)}>
                  <span className="tk-pick-text">
                    <strong>{p.name}</strong>
                    <small>
                      {formatTime(p.length)} · {p.tracks.length === 1 ? "1 lag" : `${p.tracks.length} lög`}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="tk-cta" onClick={() => onNewRoutine(skater)}>
            <Plus size={20} /> Ný rútína{skater.name ? ` – ${skater.name.split(/\s+/)[0]}` : ""}
          </button>

          <div className="tk-row tk-actions">
            <button type="button" className="tk-btn danger" onClick={() => onDelete(skater)}>
              <Trash2 size={15} /> Eyða iðkanda
            </button>
          </div>
        </div>
      </div>

      {picker && (
        <SongPicker
          title="Lög sem gætu passað"
          songs={doc.songs.filter((s) => !skater.songIds.includes(s.id))}
          fit={fits}
          onSong={(s) => {
            save({ songIds: [...skater.songIds, s.id] });
            setPicker(false);
          }}
          onFile={async () => {
            setPicker(false);
            const s = await onImport("audio");
            if (s) save({ songIds: [...skater.songIds, s.id] });
          }}
          onVideo={async () => {
            setPicker(false);
            const s = await onImport("video");
            if (s) save({ songIds: [...skater.songIds, s.id] });
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

export function blankSkater(): Skater {
  return { id: newId(), name: "", at: Date.now(), photoAt: 0, targetMin: 80, targetMax: 100, markers: [], songIds: [] };
}
