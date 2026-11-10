"use client";

/** Tónklippa — appið sjálft (á /tonklippa, má setja á heimaskjá): heimaskjár
 *  með rútínunum og ritillinn ofan á. Unnið er í tækinu (virkar án nets) og
 *  allt afritast í skýið í lokaða skúffu sem lykill tækisins opnar. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, Download, Ellipsis, Film, Flag, Link2, LoaderCircle, Music, Plus, RefreshCw, Scissors, Share, Trash2, X } from "lucide-react";
import { emptyArrangement, formatTime, normalizeArrangement, type Arrangement, type Part } from "./arrange";
import { deleteProject, isSynced, listProjects, saveProject, saveTrackBlob, type ProjectRecord } from "./store";
import { CloudSync, KEY_PARAM, applyManifestKey, fetchTrackBlob, resolveLockerKey, syncAll, type SyncState } from "./sync";
import { buildTrackView, newId, trackNameFromFile, type TrackView } from "./tracks";
import TonklippaEditor, { AUDIO_ACCEPT, VIDEO_ACCEPT } from "./TonklippaEditor";
import "./tonklippa.css";

type Open = { id: string; name: string; arr: Arrangement; tracks: TrackView[]; key: number };

const HINT_KEY = "tonklippa_heimaskjar_falid";

/** Litur rútínukortsins, fastur fyrir hvert auðkenni. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export default function TonklippaApp() {
  const audioInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const keyRef = useRef<string | null>(null);
  const syncRef = useRef<CloudSync | null>(null);
  const pulling = useRef(false);
  const pullAgain = useRef(false);
  const toastTimer = useRef(0);
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [menu, setMenu] = useState(false);
  const [installHint, setInstallHint] = useState(false);

  const say = useCallback((text: string, ms = 3500) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), ms);
  }, []);

  const refresh = useCallback(
    () =>
      listProjects().then(
        (list) => setProjects(list),
        () => setProjects([]),
      ),
    [],
  );

  /** Sækir og sendir allt sem vantar á milli tækis og skýs. */
  const pull = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    if (pulling.current) {
      // Þegar í gangi: taka aðra umferð á eftir, svo ný breyting (t.d. eyðing) fari líka.
      pullAgain.current = true;
      return;
    }
    pulling.current = true;
    setSyncState("syncing");
    try {
      do {
        pullAgain.current = false;
        await syncAll(key);
      } while (pullAgain.current);
      setSyncState("synced");
    } catch {
      setSyncState("offline");
    } finally {
      pulling.current = false;
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    let key: string | null = null;
    try {
      key = resolveLockerKey();
    } catch {
      key = null;
    }
    keyRef.current = key;
    const sync = key ? new CloudSync(key, setSyncState) : null;
    syncRef.current = sync;
    void refresh().then(() => (key ? pull() : setSyncState("offline")));

    // Þjónustuþráðurinn lætur appið opnast án nets; MP3-kóðarinn er sóttur
    // fyrir fram svo útflutningur virki líka þá.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/tonklippa-sw.js", { scope: "/tonklippa" }).catch(() => undefined);
    }
    const warm = window.setTimeout(() => void import("./mp3wasm").catch(() => undefined), 5000);
    const relink = [300, 1500, 5000].map((ms) => window.setTimeout(() => key && applyManifestKey(key), ms));

    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    let hidden = false;
    try {
      hidden = window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      /* einkagluggi */
    }
    setInstallHint(ios && !standalone && !hidden);

    const online = () => {
      void sync?.flush();
      void pull();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(warm);
      relink.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(toastTimer.current);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      sync?.stop();
    };
  }, [pull, refresh]);

  // Þegar skýið hefur náð í skottið á okkur: sýna það á kortunum.
  useEffect(() => {
    if (syncState === "synced") void refresh();
  }, [syncState, refresh]);

  async function create(files: File[]) {
    if (!files.length || status) return;
    setError("");
    const id = newId();
    const tracks: TrackView[] = [];
    const failed: string[] = [];
    for (const file of files) {
      setStatus(`Les ${file.name}…`);
      try {
        const tid = newId();
        const tv = await buildTrackView(tid, trackNameFromFile(file.name), file);
        tracks.push(tv);
        await saveTrackBlob(id, tid, file).catch(() => undefined);
      } catch (err) {
        failed.push(err instanceof Error ? `${file.name}: ${err.message}` : file.name);
      }
    }
    setStatus("");
    if (failed.length) setError(failed.join(" · "));
    if (!tracks.length) return;
    // Eitt lag fyllir marklengdina; fleiri lög skipta henni jafnt á milli sín.
    const base = emptyArrangement();
    const each = Math.max(10, base.targetMax / tracks.length);
    const parts: Part[] = tracks.map((tv, i) => ({
      id: newId(),
      trackId: tv.id,
      start: 0,
      end: Math.min(tv.duration, each),
      tempo: 1,
      gainDb: 0,
      xfade: i ? 0.5 : 0,
    }));
    const arr = { ...base, parts };
    const name = tracks[0].name.slice(0, 60);
    await saveProject({
      id,
      name,
      updatedAt: Date.now(),
      length: parts.reduce((s, p) => s + (p.end - p.start), 0),
      arrangement: arr,
      tracks: tracks.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
    }).catch(() => undefined);
    syncRef.current?.touch(id, 800);
    setOpen({ id, name, arr, tracks, key: Date.now() });
  }

  async function openProject(rec: ProjectRecord) {
    if (status) return;
    setError("");
    const tracks: TrackView[] = [];
    const missing: string[] = [];
    for (const meta of rec.tracks) {
      setStatus(`Opna ${meta.name}…`);
      try {
        const blob = await fetchTrackBlob(keyRef.current, rec.id, meta.id);
        if (!blob) throw new Error("vantar");
        tracks.push(await buildTrackView(meta.id, meta.name, blob));
      } catch {
        missing.push(meta.name);
      }
    }
    setStatus("");
    if (missing.length) {
      setError(
        `Náði ekki í lagið: ${missing.join(", ")}. ${navigator.onLine ? "Bættu því aftur við undir „Lög“." : "Það er í skýinu — tengstu netinu og opnaðu rútínuna aftur."}`,
      );
      // Án allra laga er betra að opna ekki (og vista ekki tóma útgáfu yfir þá réttu).
      if (!navigator.onLine || missing.length === rec.tracks.length) return;
    }
    const durations = Object.fromEntries(tracks.map((t) => [t.id, t.duration]));
    setOpen({ id: rec.id, name: rec.name, arr: normalizeArrangement(rec.arrangement, durations), tracks, key: Date.now() });
  }

  async function remove(rec: ProjectRecord) {
    if (!window.confirm(`Eyða rútínunni „${rec.name}“? Hún hverfur úr símanum og úr skýinu.`)) return;
    await deleteProject(rec.id, !!keyRef.current).catch(() => undefined);
    await refresh();
    void pull();
  }

  async function copyDeviceLink() {
    const key = keyRef.current;
    if (!key) return;
    const link = `${window.location.origin}/tonklippa?${KEY_PARAM}=${key}`;
    try {
      await navigator.clipboard.writeText(link);
      say("Tengill afritaður. Opnaðu hann í hinu tækinu — og ekki senda hann öðrum, hann opnar rútínurnar þínar.", 7000);
    } catch {
      window.prompt("Afritaðu tengilinn og opnaðu hann í hinu tækinu:", link);
    }
    setMenu(false);
  }

  async function shareApp() {
    const url = `${window.location.origin}/tonklippa`;
    setMenu(false);
    try {
      if (navigator.share) await navigator.share({ title: "Tónklippa", text: "Klipptu tónlist fyrir rútínuna þína", url });
      else {
        await navigator.clipboard.writeText(url);
        say("Tengill á appið afritaður");
      }
    } catch {
      /* hætt við */
    }
  }

  const syncLabel =
    syncState === "synced" ? "Allt vistað í skýinu" : syncState === "syncing" ? "Samstilli…" : "Án nets — vistað í símanum";

  return (
    <div className="tk-root tk-home">
      <div className="tk-home-scroll">
        <header className="tk-home-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tk-logo" src="/tonklippa/icon-192.png" alt="" width={52} height={52} />
          <div className="tk-brand">
            <h1>Tónklippa</h1>
            <p>Tónlistin fyrir rútínuna þína</p>
          </div>
          <button type="button" className="tk-iconbtn" onClick={() => setMenu(true)} aria-label="Meira">
            <Ellipsis size={22} />
          </button>
        </header>

        <button type="button" className="tk-new" onClick={() => audioInput.current?.click()} disabled={!!status}>
          <span className="tk-new-plus" aria-hidden="true">
            <Plus size={30} strokeWidth={2.6} />
          </span>
          <span className="tk-new-text">
            <strong>Ný rútína</strong>
            <small>Veldu lag úr símanum til að byrja</small>
          </span>
        </button>
        <button type="button" className="tk-link" onClick={() => videoInput.current?.click()} disabled={!!status}>
          <Film size={17} /> Nota hljóð úr myndbandi
        </button>

        {error && (
          <p className="tk-error" role="alert">
            {error}
          </p>
        )}

        <div className="tk-section">
          <h2>Rútínurnar mínar</h2>
          <span className={`tk-sync ${syncState}`} role="status">
            {syncState === "synced" ? <Cloud size={15} /> : syncState === "syncing" ? <LoaderCircle size={15} className="tk-spin" /> : <CloudOff size={15} />}
            {syncLabel}
          </span>
        </div>

        {projects === null ? (
          <div className="tk-skeleton" aria-hidden="true" />
        ) : projects.length === 0 ? (
          <ol className="tk-steps-intro">
            <li>
              <Music size={22} />
              <div>
                <strong>Veldu lag</strong>
                <span>MP3 eða M4A úr Skrám (Files) — eða hljóðið úr myndbandi.</span>
              </div>
            </li>
            <li>
              <Scissors size={22} />
              <div>
                <strong>Klipptu kaflann</strong>
                <span>Hlustaðu og ýttu á „Byrja hér“ og „Enda hér“. Lengdin sést allan tímann.</span>
              </div>
            </li>
            <li>
              <Flag size={22} />
              <div>
                <strong>Merktu hápunktana</strong>
                <span>Stökk, snúningur, lokastaða — og láttu tónlistina hitta á þá.</span>
              </div>
            </li>
            <li>
              <Download size={22} />
              <div>
                <strong>Vistaðu MP3</strong>
                <span>Tilbúið til að spila á svellinu eða senda áfram.</span>
              </div>
            </li>
          </ol>
        ) : (
          <ul className="tk-cards">
            {projects.map((rec) => (
              <li key={rec.id} style={{ ["--tk-hue" as string]: hueOf(rec.id) }}>
                <button type="button" className="tk-card" onClick={() => void openProject(rec)} disabled={!!status}>
                  <span className="tk-card-art" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="tk-card-text">
                    <strong>{rec.name}</strong>
                    <small>
                      {formatTime(rec.length)} · {rec.tracks.length === 1 ? "1 lag" : `${rec.tracks.length} lög`} ·{" "}
                      {new Date(rec.updatedAt).toLocaleDateString("is-IS", { day: "numeric", month: "short" })}
                      {!isSynced(rec) && <CloudOff size={13} className="tk-card-unsynced" aria-label="Ekki komið í skýið" />}
                    </small>
                  </span>
                </button>
                <button type="button" className="tk-card-del" onClick={() => void remove(rec)} aria-label={`Eyða rútínunni ${rec.name}`}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {installHint && (
          <aside className="tk-install">
            <div>
              <strong>Settu Tónklippu á heimaskjáinn</strong>
              <span>
                Ýttu á <Share size={15} className="tk-inline" aria-label="Deila" /> neðst í Safari og veldu „Setja á heimaskjá“. Þá opnast
                appið eins og hvert annað app, með rútínunum þínum.
              </span>
            </div>
            <button
              type="button"
              className="tk-iconbtn small"
              aria-label="Fela"
              onClick={() => {
                setInstallHint(false);
                try {
                  window.localStorage.setItem(HINT_KEY, "1");
                } catch {
                  /* einkagluggi */
                }
              }}
            >
              <X size={18} />
            </button>
          </aside>
        )}
      </div>

      <input
        ref={audioInput}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void create(files);
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void create(files);
        }}
      />

      {menu && (
        <div className="tk-sheet-back" onClick={() => setMenu(false)}>
          <div className="tk-sheet" role="dialog" aria-modal="true" aria-label="Meira" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => void copyDeviceLink()} disabled={!keyRef.current}>
              <Link2 size={20} />
              <span>
                <strong>Opna rútínurnar mínar í öðru tæki</strong>
                <small>Afritar leynitengil — bara fyrir þig</small>
              </span>
            </button>
            <button type="button" onClick={() => void shareApp()}>
              <Share size={20} />
              <span>
                <strong>Deila appinu með vini</strong>
                <small>Vinurinn fær appið tómt, ekki rútínurnar þínar</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                void pull();
              }}
              disabled={!keyRef.current}
            >
              <RefreshCw size={20} />
              <span>
                <strong>Samstilla núna</strong>
                <small>{syncLabel}</small>
              </span>
            </button>
            <button type="button" className="tk-sheet-close" onClick={() => setMenu(false)}>
              Loka
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="tk-toast" role="status">
          {toast}
        </div>
      )}
      {status && (
        <div className="tk-busy" role="status">
          <span className="tk-spinner" />
          <span>{status}</span>
        </div>
      )}

      {open && (
        <TonklippaEditor
          key={open.key}
          projectId={open.id}
          initialName={open.name}
          initialArr={open.arr}
          initialTracks={open.tracks}
          sync={syncRef.current}
          syncState={syncState}
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
