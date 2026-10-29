"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import ImageZoom from "../ImageZoom";
import { PromptSlots, readStoredPromptSlots, type PromptSlotData } from "../PromptSlots";
import {
  SavedPresets,
  makePresetId,
  readStoredPresets,
  writeStoredPresets,
  type SavedPreset,
} from "../SavedPresets";
import { shrinkImageForUpload } from "../replicateImage";
import {
  BREYTA_MODE_KEY,
  BREYTA_MODE_LABELS,
  BREYTA_MODES,
  DEFAULT_BACKGROUND_SETTINGS,
  DEFAULT_HEADSHOT_SETTINGS,
  DEFAULT_PRUNA_SETTINGS,
  BACKGROUND_SETTINGS_KEY,
  HEADSHOT_SETTINGS_KEY,
  PRUNA_SETTINGS_KEY,
  normalizeBackgroundSettings,
  normalizeHeadshotSettings,
  normalizePrunaSettings,
  readStoredBackgroundSettings,
  readStoredBreytaMode,
  readStoredHeadshotSettings,
  readStoredPrunaSettings,
  runBackground,
  runHeadshot,
  runPruna,
  type BackgroundSettings,
  type BreytaMode,
  type HeadshotSettings,
  type PrunaSettings,
} from "./models";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const BAKGRUNNUR_PROMPT_SLOTS_KEY = "kjarni_private_breyta_bakgrunnur_prompt_slots";
const PRUNA_PROMPT_SLOTS_KEY = "kjarni_private_breyta_pruna_prompt_slots";
const BAKGRUNNUR_PRESETS_KEY = "kjarni_private_breyta_bakgrunnur_saved_presets";
const PRUNA_PRESETS_KEY = "kjarni_private_breyta_pruna_saved_presets";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function BreytaClient() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<BreytaMode>("headshot");
  const [headshot, setHeadshot] = useState<HeadshotSettings>(DEFAULT_HEADSHOT_SETTINGS);
  const [background, setBackground] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  const [pruna, setPruna] = useState<PrunaSettings>(DEFAULT_PRUNA_SETTINGS);
  const [bakgrunnurSlots, setBakgrunnurSlots] = useState<PromptSlotData>({ slots: ["", "", ""], active: 0 });
  const [prunaSlots, setPrunaSlots] = useState<PromptSlotData>({ slots: ["", "", ""], active: 0 });
  const [bakgrunnurPresets, setBakgrunnurPresets] = useState<SavedPreset[]>([]);
  const [prunaPresets, setPrunaPresets] = useState<SavedPreset[]>([]);
  // Síðasta vel heppnaða keyrsla í hvorum ham: notað til að ákveða hvort
  // "Vista stillingu" sé virkt (bara eftir keyrslu sem skilaði útkomu).
  const [lastRunBakgrunnurPrompt, setLastRunBakgrunnurPrompt] = useState<string>("");
  const [lastRunPrunaPrompt, setLastRunPrunaPrompt] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const resultUrlsRef = useRef<string[]>([]);
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setMode(readStoredBreytaMode());
    setHeadshot(readStoredHeadshotSettings());
    const nextBackground = readStoredBackgroundSettings();
    const nextPruna = readStoredPrunaSettings();
    setBackground(nextBackground);
    setPruna(nextPruna);
    setBakgrunnurSlots(readStoredPromptSlots(BAKGRUNNUR_PROMPT_SLOTS_KEY, nextBackground.prompt));
    setPrunaSlots(readStoredPromptSlots(PRUNA_PROMPT_SLOTS_KEY, nextPruna.prompt));
    setBakgrunnurPresets(readStoredPresets(BAKGRUNNUR_PRESETS_KEY));
    setPrunaPresets(readStoredPresets(PRUNA_PRESETS_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  function selectMode(next: BreytaMode) {
    setMode(next);
    window.localStorage.setItem(BREYTA_MODE_KEY, next);
    setError("");
  }

  function updateHeadshot(next: Partial<HeadshotSettings>) {
    setHeadshot((s) => {
      const merged = normalizeHeadshotSettings({ ...s, ...next });
      window.localStorage.setItem(HEADSHOT_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updateBackground(next: Partial<BackgroundSettings>) {
    setBackground((s) => {
      const merged = normalizeBackgroundSettings({ ...s, ...next });
      window.localStorage.setItem(BACKGROUND_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updatePruna(next: Partial<PrunaSettings>) {
    setPruna((s) => {
      const merged = normalizePrunaSettings({ ...s, ...next });
      window.localStorage.setItem(PRUNA_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updateBakgrunnurSlots(next: PromptSlotData) {
    setBakgrunnurSlots(next);
    try {
      window.localStorage.setItem(BAKGRUNNUR_PROMPT_SLOTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }

  function updatePrunaSlots(next: PromptSlotData) {
    setPrunaSlots(next);
    try {
      window.localStorage.setItem(PRUNA_PROMPT_SLOTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }

  function saveBakgrunnurPreset(name: string) {
    const preset: SavedPreset = {
      id: makePresetId(),
      name,
      prompt: lastRunBakgrunnurPrompt,
      negativePrompt: background.negativePrompt,
      seed: background.seed,
      createdAt: Date.now(),
    };
    const next = [preset, ...bakgrunnurPresets];
    setBakgrunnurPresets(next);
    writeStoredPresets(BAKGRUNNUR_PRESETS_KEY, next);
  }

  function deleteBakgrunnurPreset(id: string) {
    const next = bakgrunnurPresets.filter((p) => p.id !== id);
    setBakgrunnurPresets(next);
    writeStoredPresets(BAKGRUNNUR_PRESETS_KEY, next);
  }

  function applyBakgrunnurPreset(p: SavedPreset) {
    // Setjum prompt í virka slot-ið; seed og negative í settings-ið.
    const activeIdx = bakgrunnurSlots.active;
    const nextSlots: [string, string, string] = [
      bakgrunnurSlots.slots[0],
      bakgrunnurSlots.slots[1],
      bakgrunnurSlots.slots[2],
    ];
    nextSlots[activeIdx] = p.prompt;
    updateBakgrunnurSlots({ slots: nextSlots, active: activeIdx });
    updateBackground({
      negativePrompt: p.negativePrompt ?? background.negativePrompt,
      seed: p.seed,
    });
  }

  function savePrunaPreset(name: string) {
    const preset: SavedPreset = {
      id: makePresetId(),
      name,
      prompt: lastRunPrunaPrompt,
      seed: pruna.seed,
      createdAt: Date.now(),
    };
    const next = [preset, ...prunaPresets];
    setPrunaPresets(next);
    writeStoredPresets(PRUNA_PRESETS_KEY, next);
  }

  function deletePrunaPreset(id: string) {
    const next = prunaPresets.filter((p) => p.id !== id);
    setPrunaPresets(next);
    writeStoredPresets(PRUNA_PRESETS_KEY, next);
  }

  function applyPrunaPreset(p: SavedPreset) {
    const activeIdx = prunaSlots.active;
    const nextSlots: [string, string, string] = [
      prunaSlots.slots[0],
      prunaSlots.slots[1],
      prunaSlots.slots[2],
    ];
    nextSlots[activeIdx] = p.prompt;
    updatePrunaSlots({ slots: nextSlots, active: activeIdx });
    updatePruna({ seed: p.seed });
  }

  async function addFile(file: File) {
    setError("");
    try {
      // Headshot/Background/Pruna vinna vel við 1024px — passar undir
      // Vercel's 4.5MB body-mörk líka á stórum síma-ljósmyndum.
      const shrunk = await shrinkImageForUpload(file, { maxDim: 1024 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const url = URL.createObjectURL(file);
      sourceUrlRef.current = url;
      sourceDataUrlRef.current = shrunk.dataUrl;
      setSource({ url, name: file.name });
      for (const old of resultUrlsRef.current) URL.revokeObjectURL(old);
      resultUrlsRef.current = [];
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  async function run() {
    if (!source) {
      setError("Hladdu upp mynd fyrst.");
      return;
    }
    if (mode === "bakgrunnur") {
      const activePrompt = bakgrunnurSlots.slots[bakgrunnurSlots.active];
      if (!activePrompt.trim()) {
        setError("Virka prompt-ið er tómt — tappaðu á það og lýstu bakgrunninum fyrst.");
        return;
      }
    }
    if (mode === "pruna") {
      const activePrompt = prunaSlots.slots[prunaSlots.active];
      if (!activePrompt.trim()) {
        setError("Virka prompt-ið er tómt — tappaðu á það og skrifaðu lýsingu fyrst.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      let blobs: Blob[];
      if (mode === "headshot") blobs = await runHeadshot(headshot, sourceDataUrlRef.current);
      else if (mode === "bakgrunnur") {
        const activePrompt = bakgrunnurSlots.slots[bakgrunnurSlots.active];
        const bgWithPrompt: BackgroundSettings = { ...background, prompt: activePrompt };
        blobs = await runBackground(bgWithPrompt, sourceDataUrlRef.current);
        setLastRunBakgrunnurPrompt(activePrompt);
      } else {
        const activePrompt = prunaSlots.slots[prunaSlots.active];
        const prunaWithPrompt: PrunaSettings = { ...pruna, prompt: activePrompt };
        blobs = await runPruna(prunaWithPrompt, sourceDataUrlRef.current);
        setLastRunPrunaPrompt(activePrompt);
      }
      for (const old of resultUrlsRef.current) URL.revokeObjectURL(old);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current = urls;
      setResults(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Breyta mistókst.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Breyta…</p>
        </div>
      </StationChrome>
    );
  }

  const activeLabel = BREYTA_MODE_LABELS[mode];

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Breyta"}
          </p>
          <h1>Breyta mynd</h1>
          <p className="ac-lead">
            Þrjú skýja-líkön á Replicate undir einni UI: faglegt headshot úr hvaða portrett sem er, nýr
            bakgrunnur á vörumynd með texta, eða hraðvirk/ódýr multi-image breyting. Hvert líkan er
            opið og rukkar lítið per mynd.
          </p>

          <section className="ac-panel">
            <h2>Aðferð</h2>
            <div className="ac-modes" role="radiogroup">
              {BREYTA_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={mode === m ? "on" : undefined}
                  onClick={() => selectMode(m)}
                >
                  {BREYTA_MODE_LABELS[m].label}
                </button>
              ))}
            </div>
            <p className="ac-hint">
              {activeLabel.hint} <strong>{activeLabel.costHint}</strong>
            </p>
          </section>

          {!source && (
            <section
              className={`ac-drop ${drag ? "on" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void addFile(file);
              }}
            >
              <p>Slepptu mynd hér, eða</p>
              <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
                Velja mynd
              </button>
            </section>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addFile(file);
              e.target.value = "";
            }}
          />

          {source && (
            <section className="ac-panel">
              <h2>Mynd</h2>
              <p className="ac-hint">{source.name}</p>
              <ImageZoom src={source.url} alt={source.name} />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
                    sourceUrlRef.current = "";
                    sourceDataUrlRef.current = "";
                    setSource(null);
                    for (const old of resultUrlsRef.current) URL.revokeObjectURL(old);
                    resultUrlsRef.current = [];
                    setResults([]);
                  }}
                >
                  Ný mynd
                </button>
              </div>
            </section>
          )}

          <section className="ac-panel">
            <h2>Stillingar</h2>

            {mode === "headshot" && (
              <>
                <div className="ac-settings">
                  <label>
                    Kyn (fyrir face-engine)
                    <select
                      value={headshot.gender}
                      onChange={(e) => updateHeadshot({ gender: e.target.value as HeadshotSettings["gender"] })}
                    >
                      <option value="none">Látum líkanið giska</option>
                      <option value="female">Kvenkyn</option>
                      <option value="male">Karlkyn</option>
                    </select>
                    <small className="ac-rec">mælt: Látum líkanið giska (nema líkanið misskilji ítrekað)</small>
                  </label>
                  <label>
                    Bakgrunnur
                    <select
                      value={headshot.background}
                      onChange={(e) =>
                        updateHeadshot({ background: e.target.value as HeadshotSettings["background"] })
                      }
                    >
                      <option value="neutral">Neutral</option>
                      <option value="white">White</option>
                      <option value="black">Black</option>
                      <option value="gray">Gray</option>
                      <option value="office">Office</option>
                    </select>
                    <small className="ac-rec">mælt: Neutral (mýkra en White; Office fyrir viðskipta-headshot)</small>
                  </label>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={headshot.disableSafetyChecker}
                    onChange={(e) => updateHeadshot({ disableSafetyChecker: e.target.checked })}
                  />
                  Slökkva á öryggissíu (disable_safety_checker)
                  <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: AF (face-engine þarf öryggissíu til að forðast falska synjun)</small>
                </label>
              </>
            )}

            {mode === "bakgrunnur" && (
              <>
                <PromptSlots
                  label="Hvernig bakgrunnur?"
                  data={bakgrunnurSlots}
                  onChange={updateBakgrunnurSlots}
                  rows={3}
                />
                <label>
                  Neikvæð lýsing (má sleppa)
                  <textarea
                    value={background.negativePrompt}
                    onChange={(e) => updateBackground({ negativePrompt: e.target.value })}
                    rows={2}
                  />
                  <small className="ac-rec">mælt: „cluttered, people in background, distracting elements" (eða autt)</small>
                </label>
                <div className="ac-settings">
                  <label>
                    Fjöldi afbrigða ({background.numResults})
                    <input
                      type="range"
                      min={1}
                      max={4}
                      value={background.numResults}
                      onChange={(e) => updateBackground({ numResults: Number(e.target.value) })}
                    />
                    <small className="ac-rec">mælt: 1 (hækkaðu í 2-4 til að bera saman afbrigði; hvert kostar sitt)</small>
                  </label>
                  <label>
                    Seed ({background.seed === -1 ? "slembið" : background.seed})
                    <input
                      type="number"
                      value={background.seed}
                      onChange={(e) => updateBackground({ seed: Number(e.target.value) })}
                    />
                    <small className="ac-rec">mælt: -1 (slembið; nota fasta tölu bara til að endurtaka)</small>
                  </label>
                </div>
              </>
            )}

            {mode === "pruna" && (
              <>
                <PromptSlots
                  label="Hvað á að breyta?"
                  data={prunaSlots}
                  onChange={updatePrunaSlots}
                  rows={3}
                />
                <div className="ac-settings">
                  <label>
                    Seed ({pruna.seed === -1 ? "slembið" : pruna.seed})
                    <input
                      type="number"
                      value={pruna.seed}
                      onChange={(e) => updatePruna({ seed: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={pruna.disableSafetyChecker}
                    onChange={(e) => updatePruna({ disableSafetyChecker: e.target.checked })}
                  />
                  Slökkva á öryggissíu (disable_safety_checker)
                </label>
              </>
            )}

            {error && <p className="ac-error">{error}</p>}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
              {busy ? "Breyti…" : "Breyta mynd"}
            </button>
          </section>

          {mode === "bakgrunnur" && (
            <SavedPresets
              title="Vistaðir bakgrunnar"
              presets={bakgrunnurPresets}
              onSave={saveBakgrunnurPreset}
              onDelete={deleteBakgrunnurPreset}
              onApply={applyBakgrunnurPreset}
              canSave={!!lastRunBakgrunnurPrompt && results.length > 0}
              saveHint="Vistar virka prompt-ið, neikvæða lýsingu og seed úr síðustu keyrslu. Nota sama seed á næstu mynd úr myndatökunni → mjög svipaður bakgrunnur."
              showNegativePrompt
            />
          )}

          {mode === "pruna" && (
            <SavedPresets
              title="Vistaðar stillingar"
              presets={prunaPresets}
              onSave={savePrunaPreset}
              onDelete={deletePrunaPreset}
              onApply={applyPrunaPreset}
              canSave={!!lastRunPrunaPrompt && results.length > 0}
              saveHint="Vistar virka prompt-ið og seed úr síðustu keyrslu. Sama seed á næstu mynd úr myndatökunni → svipuð útkoma."
            />
          )}

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <div className="ac-results">
                {results.map((url, i) => (
                  <figure key={url}>
                    <ImageZoom src={url} alt={`Breyta útkoma ${i + 1}`} />
                    <figcaption>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => downloadBlob(url, `breyta-${mode}-${i + 1}.png`)}
                      >
                        Sækja mynd
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
