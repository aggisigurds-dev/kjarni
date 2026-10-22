"use client";

import { useEffect, useRef, useState } from "react";
import {
  canBuildAvatar,
  canGuessOrbit,
  deleteProfile,
  missingOrbitSlots,
  hasIdentity,
  listProfiles,
  MAX_FACES,
  newProfileId,
  orbitCount,
  ORBIT_SLOTS,
  saveProfile,
  writeActiveProfileId,
  type OrbitId,
  type OrbitMap,
  type PersonProfile,
} from "./profile";
import { shrinkFace } from "./profileImage";

type Props = {
  activeId: string;
  onActive: (id: string, profile: PersonProfile | null) => void;
  useProfile: boolean;
  onUseProfile: (on: boolean) => void;
  adapterHint?: string;
  onAvatar?: () => void;
  avatarBusy?: boolean;
  onGuessOrbit?: () => Promise<OrbitMap | null>;
};

export default function PersonProfilePanel({
  activeId,
  onActive,
  useProfile,
  onUseProfile,
  adapterHint,
  onAvatar,
  avatarBusy,
  onGuessOrbit,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const orbitRef = useRef<HTMLInputElement>(null);
  const [orbitSlot, setOrbitSlot] = useState<OrbitId>("front");
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = profiles.find((p) => p.id === activeId) || null;

  async function reload(selectId?: string) {
    const rows = await listProfiles();
    setProfiles(rows);
    const next = rows.find((p) => p.id === (selectId || activeId)) || rows[0] || null;
    onActive(next?.id || "", next);
    if (next) setName(next.name);
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Gat ekki lesið prófíla"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    const row: PersonProfile = {
      id: newProfileId(),
      name: name.trim() || "Nýr prófíll",
      faces: [],
      orbit: {},
      updatedAt: Date.now(),
    };
    await saveProfile(row);
    writeActiveProfileId(row.id);
    await reload(row.id);
  }

  async function saveName() {
    if (!active) return;
    await saveProfile({ ...active, name: name.trim() || active.name });
    await reload(active.id);
  }

  async function addFiles(files: FileList | File[]) {
    if (!active) {
      setError("Búðu fyrst til prófíl.");
      return;
    }
    const room = MAX_FACES - active.faces.length;
    if (room <= 0) {
      setError("Prófíllinn er fullur (10 andlitsmyndir).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
      const faces = [...active.faces];
      for (const file of picked) {
        const raw = await file.arrayBuffer();
        const blob = new Blob([raw], { type: file.type });
        const url = URL.createObjectURL(blob);
        try {
          faces.push(await shrinkFace(url));
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const next = { ...active, faces };
      await saveProfile(next);
      await reload(active.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki vistað andlitsmynd");
    } finally {
      setBusy(false);
    }
  }

  async function addOrbit(files: FileList | File[], slot: OrbitId) {
    if (!active) {
      setError("Búðu fyrst til prófíl.");
      return;
    }
    const file = [...files].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const raw = await file.arrayBuffer();
      const url = URL.createObjectURL(new Blob([raw], { type: file.type }));
      try {
        const src = await shrinkFace(url, 640);
        const next = { ...active, orbit: { ...active.orbit, [slot]: src } };
        await saveProfile(next);
        await reload(active.id);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki vistað hringmynd");
    } finally {
      setBusy(false);
    }
  }

  async function removeOrbit(slot: OrbitId) {
    if (!active) return;
    const orbit = { ...active.orbit };
    delete orbit[slot];
    await saveProfile({ ...active, orbit });
    await reload(active.id);
  }

  async function removeFace(index: number) {
    if (!active) return;
    const next = { ...active, faces: active.faces.filter((_, i) => i !== index) };
    await saveProfile(next);
    await reload(active.id);
  }

  async function guessRest() {
    if (!active || !onGuessOrbit) return;
    setBusy(true);
    setError("");
    try {
      const orbit = await onGuessOrbit();
      if (!orbit) return;
      await saveProfile({ ...active, orbit });
      await reload(active.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki áætlað hornin");
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile() {
    if (!active) return;
    await deleteProfile(active.id);
    writeActiveProfileId("");
    setName("");
    await reload("");
  }

  return (
    <div className="ac-profile">
      <h2>Persónuprófíll</h2>
      <p className="ac-hint">
        6–10 skýrar andlitsmyndir og 8 sjónarhorn allan hringinn. Vantar horn fyllir
        innbyggður 3D-líkami eða GLB sem þú setur inn; realistic avatar er samræmdur
        2D-snúningsblað ofan á það.
      </p>
      <div className="ac-row">
        <label>
          Prófíll
          <select
            value={active?.id || ""}
            onChange={(e) => {
              const next = profiles.find((p) => p.id === e.target.value) || null;
              writeActiveProfileId(next?.id || "");
              onActive(next?.id || "", next);
              setName(next?.name || "");
            }}
          >
            <option value="">Ekkert valið</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.faces.length}/{MAX_FACES} · {orbitCount(p)}/8)
              </option>
            ))}
          </select>
        </label>
        <label>
          Nafn
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="t.d. nafn persónu" />
        </label>
      </div>
      <div className="ac-row">
        <button type="button" className="ac-btn ghost" onClick={() => void create()}>
          Nýr prófíll
        </button>
        <button type="button" className="ac-btn ghost" onClick={() => void saveName()} disabled={!active}>
          Vista nafn
        </button>
        <button
          type="button"
          className="ac-btn ghost"
          onClick={() => fileRef.current?.click()}
          disabled={!active || busy || (active?.faces.length || 0) >= MAX_FACES}
        >
          {busy ? "Hleð…" : "Bæta við andlitsmyndum"}
        </button>
        <button type="button" className="ac-btn ghost" onClick={() => void removeProfile()} disabled={!active}>
          Eyða prófíl
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="ac-error">{error}</p>}
      <label className="ac-check">
        <input
          type="checkbox"
          checked={useProfile}
          disabled={!hasIdentity(active)}
          onChange={(e) => onUseProfile(e.target.checked)}
        />
        Nota prófílinn við myndgerð
        {active ? ` (${active.name}, ${active.faces.length} andlit, ${orbitCount(active)} hring)` : ""}
      </label>
      {adapterHint && <p className="ac-hint">{adapterHint}</p>}
      {active && (
        <div className="ac-faces">
          {active.faces.map((src, i) => (
            <figure key={`${active.id}-${i}`}>
              <img src={src} alt={`Andlit ${i + 1}`} />
              <button type="button" className="ac-btn ghost" onClick={() => void removeFace(i)}>
                Taka út
              </button>
            </figure>
          ))}
          {active.faces.length === 0 && <p className="ac-hint">Engin andlitsmynd enn. Best eru 6–10 skýrar.</p>}
        </div>
      )}
      {active && (
        <div className="ac-orbit-wrap">
          <h3>Hringur — 8 sjónarhorn</h3>
          <p className="ac-hint">
            Fullorðin manneskja, sama fatnaður, skýrt ljós. Framan → hægri → aftan → vinstri.
            Vantar horn? Ýttu á Fylla vantar horn með 3D — ekkert extra forrit þarf.
            Leiðbeiningar og hlekkir (Meshy, Tripo, Sketchfab) eru undir 3D möskvi.
          </p>
          <div className="ac-orbit">
            {ORBIT_SLOTS.map((slot) => {
              const src = active.orbit?.[slot.id];
              return (
                <figure key={slot.id} className={`ac-orbit-slot ${src ? "has" : ""}`}>
                  {src ? <img src={src} alt={slot.label} /> : <span className="ac-orbit-empty">{slot.deg}°</span>}
                  <figcaption>{slot.label}</figcaption>
                  <div className="ac-row">
                    <button
                      type="button"
                      className="ac-btn ghost"
                      disabled={busy}
                      onClick={() => {
                        setOrbitSlot(slot.id);
                        orbitRef.current?.click();
                      }}
                    >
                      {src ? "Skipta" : "Setja inn"}
                    </button>
                    {src && (
                      <button type="button" className="ac-btn ghost" onClick={() => void removeOrbit(slot.id)}>
                        Taka út
                      </button>
                    )}
                  </div>
                </figure>
              );
            })}
          </div>
          <input
            ref={orbitRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void addOrbit(e.target.files, orbitSlot);
              e.target.value = "";
            }}
          />
          {(onAvatar || onGuessOrbit) && (
            <div className="ac-row">
              {onGuessOrbit && (
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={avatarBusy || busy || !canGuessOrbit(active)}
                  onClick={() => void guessRest()}
                >
                  {avatarBusy ? "Áætla…" : `Fylla vantar horn með 3D (${missingOrbitSlots(active.orbit).length})`}
                </button>
              )}
              {onAvatar && (
                <button
                  type="button"
                  className="ac-btn"
                  disabled={avatarBusy || !canBuildAvatar(active)}
                  onClick={onAvatar}
                >
                  Realistic avatar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
