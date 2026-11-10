"use client";

/** Smærri byggingareiningar Tónklippu: smátt bylgjuform með hápunktum,
 *  prófílmynd iðkanda og lagaval úr safninu. */

import { useState, type ReactNode } from "react";
import { Crown, Film, Flame, Music, Pause, Play, Snowflake, Star, X, Zap } from "lucide-react";
import type { Highlight } from "./analyze";
import { formatTime } from "./arrange";
import type { Clip, CoverStyle, Skater, Song } from "./library";
import type { Match } from "./match";

/** Bylgjuform lags í lista; gylltu strikin eru hápunktar lagsins. */
export function MiniWave({
  song,
  from,
  to,
  onSeek,
}: {
  song: Pick<Song, "wave" | "highlights" | "duration">;
  /** Valinn kafli (sek) sem er litaður. */
  from?: number;
  to?: number;
  onSeek?: (t: number) => void;
}) {
  const wave = song.wave ?? [];
  const n = Math.max(1, wave.length);
  const w = n * 2;
  const x = (t: number) => (song.duration > 0 ? (t / song.duration) * w : 0);
  let d = "";
  wave.forEach((v, i) => {
    const h = Math.max(1.5, (v / 99) * 26);
    d += `M${i * 2 + 1} ${18 - h / 2}v${h}`;
  });
  const top: Highlight[] = (song.highlights ?? [])
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  return (
    <svg
      className={`tk-mini${onSeek ? " seek" : ""}`}
      viewBox={`0 0 ${w} 32`}
      preserveAspectRatio="none"
      role={onSeek ? "slider" : "img"}
      aria-label={onSeek ? "Hlusta frá stað í laginu" : "Bylgjuform lagsins"}
      onClick={
        onSeek
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(Math.max(0, Math.min(song.duration, ((e.clientX - r.left) / r.width) * song.duration)));
            }
          : undefined
      }
    >
      {from != null && to != null && <rect className="tk-mini-region" x={x(from)} y={0} width={Math.max(1, x(to) - x(from))} height={32} rx={2} />}
      {wave.length ? <path className="tk-mini-wave" d={d} /> : <rect className="tk-mini-flat" x={0} y={17} width={w} height={2} />}
      {top.map((h) => (
        <rect key={h.t} className="tk-mini-high" x={x(h.t) - 0.7} y={0} width={1.4} height={3 + 5 * h.score} rx={0.7} />
      ))}
    </svg>
  );
}

function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** Prófílmynd iðkanda, eða upphafsstafir á lit ef engin mynd er. */
export function Avatar({ skater, url, size = 48 }: { skater: Pick<Skater, "id" | "name">; url?: string; size?: number }) {
  const initials =
    skater.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span className="tk-avatar" style={{ width: size, height: size, fontSize: size * 0.38, ["--tk-hue" as string]: hueOf(skater.id) }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" /> : initials}
    </span>
  );
}

const COVER_ICON: Record<CoverStyle, typeof Flame> = { eldur: Flame, is: Snowflake, neon: Zap, gull: Crown };

/** Umslag lags: logi, ískristall … eða litur lagsins. Með `onPlay` er það líka spilunarhnappur. */
export function Cover({ song, size = 52, playing, onPlay }: { song: Pick<Song, "id" | "name" | "cover" | "art">; size?: number; playing?: boolean; onPlay?: () => void }) {
  // Myndin af umslaginu kemur af netinu; ef hún næst ekki sést tilbúna útlitið.
  const [failed, setFailed] = useState("");
  const photo = song.art && failed !== song.art ? song.art : "";
  const plainStyle = !song.cover && !photo;
  const Icon = playing ? Pause : song.cover ? COVER_ICON[song.cover] : onPlay ? Play : Music;
  const art = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(photo)} />}
      {(!photo || playing) && <Icon size={size * 0.46} fill={playing || (plainStyle && onPlay) ? "currentColor" : "none"} strokeWidth={2.2} />}
      {!plainStyle && onPlay && !playing && (
        <i className="tk-cover-play">
          <Play size={size * 0.24} fill="currentColor" />
        </i>
      )}
    </>
  );
  const style = { width: size, height: size, borderRadius: size * 0.3, ["--tk-hue" as string]: hueOf(song.id) };
  const cls = `tk-cover ${song.cover ?? "auto"}${photo ? " photo" : ""}`;
  return onPlay ? (
    <button type="button" className={cls} style={style} onClick={onPlay} aria-label={playing ? "Stöðva" : `Hlusta á ${song.name}`}>
      {art}
    </button>
  ) : (
    <span className={cls} style={style} aria-hidden="true">
      {art}
    </span>
  );
}

export function fitLabel(m: Match | null | undefined): string {
  return m ? `${m.hits} af ${m.total} hápunktum` : "";
}

type PickerProps = {
  title: string;
  songs: Song[];
  clips?: Clip[];
  /** Hversu vel hvert lag passar við dansinn (ef hápunktar eru þekktir). */
  fit?: Map<string, Match | null>;
  /** Lög sem eru sýnd fyrst (t.d. lög sem þjálfarinn valdi fyrir iðkandann). */
  first?: string[];
  onSong: (song: Song) => void;
  onClip?: (clip: Clip) => void;
  onFile?: () => void;
  onVideo?: () => void;
  onClose: () => void;
  /** Efni ofan við listann (t.d. val á iðkanda). */
  children?: ReactNode;
};

/** Blað neðan frá: velja lag (eða uppáhaldsbút) úr safninu, eða nýja skrá. */
export function SongPicker({ title, songs, clips = [], fit, first = [], onSong, onClip, onFile, onVideo, onClose, children }: PickerProps) {
  const rank = (s: Song) => {
    const m = fit?.get(s.id);
    return (first.includes(s.id) ? 100 : 0) + (m ? m.hits * 10 + m.score : 0) + (s.fav ? 1 : 0);
  };
  const sorted = songs.slice().sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name, "is"));
  const nameOf = (id: string) => songs.find((s) => s.id === id)?.name ?? "";
  return (
    <div className="tk-sheet-back" onClick={onClose}>
      <div className="tk-sheet tall" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="tk-sheet-head">
          <strong>{title}</strong>
          <button type="button" className="tk-iconbtn small" onClick={onClose} aria-label="Loka">
            <X size={18} />
          </button>
        </div>
        <div className="tk-sheet-scroll">
          {children}
          {(onFile || onVideo) && (
            <div className="tk-cta-row">
              {onFile && (
                <button type="button" className="tk-cta ghost" onClick={onFile}>
                  <Music size={18} /> Skrá úr símanum
                </button>
              )}
              {onVideo && (
                <button type="button" className="tk-cta ghost" onClick={onVideo}>
                  <Film size={18} /> Úr myndbandi
                </button>
              )}
            </div>
          )}
          {onClip && clips.length > 0 && (
            <>
              <h3>Uppáhaldsbútar</h3>
              {clips.map((c) => (
                <button type="button" className="tk-pick" key={c.id} onClick={() => onClip(c)}>
                  <Play size={18} fill="currentColor" />
                  <span className="tk-pick-text">
                    <strong>{c.name}</strong>
                    <small>
                      {nameOf(c.songId)} · {formatTime(c.start)}–{formatTime(c.end)}
                    </small>
                  </span>
                </button>
              ))}
            </>
          )}
          <h3>Lög í safninu</h3>
          {sorted.length === 0 && <p className="tk-muted">Safnið er tómt — bættu við lagi úr símanum.</p>}
          {sorted.map((s) => {
            const m = fit?.get(s.id);
            return (
              <button type="button" className="tk-pick" key={s.id} onClick={() => onSong(s)}>
                <Cover song={s} size={46} />
                <span className="tk-pick-text">
                  <strong>
                    {s.fav && <Star size={13} fill="currentColor" className="tk-gold" />} {s.name}
                  </strong>
                  <small>
                    {formatTime(s.duration)}
                    {s.bpm ? ` · ≈ ${s.bpm} slög/mín` : ""}
                    {m ? ` · ${fitLabel(m)}` : ""}
                    {first.includes(s.id) ? " · valið fyrir iðkandann" : ""}
                  </small>
                  <MiniWave song={s} from={m?.start} to={m ? m.start + 1 : undefined} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
