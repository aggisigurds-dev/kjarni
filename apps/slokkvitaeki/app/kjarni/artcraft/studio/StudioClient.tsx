"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftAppHref, artcraftHubHref } from "../apps";
import "../artcraft.css";
import AdjustPanel from "./AdjustPanel";
import { actionDenoising, actionPrompt, type RegionKind } from "./analyze";
import LightPlanPanel from "./LightPlan";
import {
  backdropShootPrompt,
  backgroundOf,
  DEFAULT_LIGHT_PLAN,
  LIGHTS_KEY,
  mergePrompt,
  readStoredLights,
  STUDIO_SHOOT_DENOISING,
  type LightPlan,
} from "./lights";
import { analyzeStudioImage, type StudioRegion } from "./analyzeImage";
import { assertAdultPrompt } from "./guard";
import PersonProfilePanel from "./PersonProfile";
import {
  avatarPrompt,
  AVATAR_DENOISING,
  canBuildAvatar,
  hasIdentity,
  identityPrompt,
  identityRefs,
  mergeIdentity,
  orbitImages,
  SHARPEN_DENOISING,
  type PersonProfile,
} from "./profile";
import { faceSheet } from "./profileImage";
import VideoPanel from "./VideoPanel";
import {
  DEFAULT_VIDEO,
  mergeMotion,
  pingPong,
  readStoredVideo,
  VIDEO_KEY,
  videoDenoising,
  type VideoSettings,
} from "./video";
import { stitchWebm } from "./videoImage";
import {
  DEFAULT_SETTINGS,
  DEFAULT_WEBUI_URL,
  SAMPLERS,
  SETTINGS_KEY,
  SIZE_PRESETS,
  WEBUI_URL_KEY,
  canEmbedLocalWebui,
  denoisingHint,
  findFaceAdapter,
  generateLocal,
  pingWebui,
  readStoredSettings,
  readStoredWebuiUrl,
  sizePresetId,
  type FaceAdapter,
  type LocalModel,
  type StudioSettings,
} from "./webui";

const GATE_KEY = "kjarni_private_studio_v1";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg";

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Veldu PNG, JPEG eða WebP."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gat ekki lesið myndina"));
    reader.readAsDataURL(file);
  });
}

export default function StudioClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [webui, setWebui] = useState(DEFAULT_WEBUI_URL);
  const [status, setStatus] = useState<"idle" | "checking" | "up" | "down">("idle");
  const [statusText, setStatusText] = useState("Ekki prófað enn");
  const [models, setModels] = useState<LocalModel[]>([]);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [working, setWorking] = useState("");
  const [mask, setMask] = useState<string | null>(null);
  const [maskBlur, setMaskBlur] = useState(4);
  const [regions, setRegions] = useState<StudioRegion[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [presetMask, setPresetMask] = useState<string | null>(null);
  const [presetMaskTick, setPresetMaskTick] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeText, setAnalyzeText] = useState("");
  const [colorWant, setColorWant] = useState("red");
  const [bgWant, setBgWant] = useState("soft daylight, quiet street");
  const [lights, setLights] = useState<LightPlan>(DEFAULT_LIGHT_PLAN);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [useProfile, setUseProfile] = useState(true);
  const [faceAdapter, setFaceAdapter] = useState<FaceAdapter | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [clip, setClip] = useState<VideoSettings>(DEFAULT_VIDEO);
  const [clipText, setClipText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    setAccepted(window.localStorage.getItem(GATE_KEY) === "1");
    setWebui(readStoredWebuiUrl());
    setSettings(readStoredSettings());
    setLights(readStoredLights());
    setClip(readStoredVideo());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(LIGHTS_KEY, JSON.stringify(lights));
  }, [ready, lights]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(VIDEO_KEY, JSON.stringify(clip));
  }, [ready, clip]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function acceptGate() {
    window.localStorage.setItem(GATE_KEY, "1");
    setAccepted(true);
  }

  function patchSettings(patch: Partial<StudioSettings>) {
    setSettings((cur) => ({ ...cur, ...patch }));
  }

  function pickRegion(region: StudioRegion) {
    setSelectedRegion(region.id);
    setPresetMask(region.maskUrl);
    setPresetMaskTick((n) => n + 1);
  }

  async function analyze() {
    if (!source) return;
    setError("");
    setAnalyzing(true);
    setAnalyzeText("Greini myndina…");
    try {
      const found = await analyzeStudioImage(source, setAnalyzeText);
      setRegions(found);
      const first = found.find((r) => r.kind === "person") || found[0];
      if (first) pickRegion(first);
      setAnalyzeText(`${found.length} svæði`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki greint myndina");
      setAnalyzeText("");
    } finally {
      setAnalyzing(false);
    }
  }

  function applyAction(action: "remove" | "recolor" | "background") {
    const region = regions.find((r) => r.id === selectedRegion);
    const kind: RegionKind = region?.kind || (action === "background" ? "background" : "clothes");
    if (action === "background" && region?.kind !== "background") {
      const bg = regions.find((r) => r.kind === "background");
      if (bg) pickRegion(bg);
    }
    setPrompt(actionPrompt(kind, action, action === "recolor" ? colorWant : bgWant));
    patchSettings({ denoisingStrength: actionDenoising(action) });
  }

  async function checkServer(url = webui) {
    setStatus("checking");
    setStatusText("Athuga staðbundið líkan…");
    const result = await pingWebui(url);
    if (result.ok) {
      setStatus("up");
      setModels(result.models);
      const adapter = await findFaceAdapter(url);
      setFaceAdapter(adapter);
      setStatusText(
        result.models.length > 0
          ? `Tengt · ${result.models.length} líkön`
          : "Tengt · ekkert líkan hlaðið í WebUI",
      );
      window.localStorage.setItem(WEBUI_URL_KEY, url);
    } else {
      setStatus("down");
      setModels([]);
      setFaceAdapter(null);
      setStatusText(result.error);
    }
  }

  async function takeFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await readImageFile(file);
      setSource(data);
      setSourceName(file.name);
      setWorking("");
      setMask(null);
      setRegions([]);
      setSelectedRegion(null);
      setPresetMask(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki lesið myndina");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void takeFile(e.dataTransfer.files[0]);
  }

  async function runGenerate(opts?: { prompt?: string; mask?: string | null; denoisingStrength?: number }) {
    const text = opts?.prompt ?? prompt;
    setError("");
    try {
      assertAdultPrompt(text, negative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óleyfileg beiðni");
      return;
    }
    if (!source && !text.trim()) {
      setError("Skrifaðu prompt, eða settu inn mynd til að breyta.");
      return;
    }
    setBusy(true);
    try {
      const useId = Boolean(useProfile && hasIdentity(profile));
      let faceRefs: string[] | undefined;
      if (useId && profile) {
        const [sheet, orbitSheet] = await Promise.all([faceSheet(profile.faces), faceSheet(orbitImages(profile))]);
        faceRefs = identityRefs(profile.faces, sheet, orbitSheet);
      }
      const out = await generateLocal(webui, {
        prompt: mergeIdentity(mergePrompt(text, lights), profile?.name || "", useId),
        negativePrompt: negative.trim(),
        initImage: working || source || undefined,
        mask: (opts && "mask" in opts ? opts.mask : mask) || undefined,
        maskBlur,
        restoreFaces: useId,
        faceRefs,
        faceAdapter: useId ? faceAdapter : null,
        ...settings,
        denoisingStrength: opts?.denoisingStrength ?? settings.denoisingStrength,
      });
      setImages(out);
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /fetch|network|failed to load/i.test(raw)
          ? "Gat ekki myndað. Er staðbundna WebUI-ið í gangi með --api og CORS?"
          : raw || "Gat ekki myndað. Er staðbundna WebUI-ið í gangi með --api og CORS?",
      );
    } finally {
      setBusy(false);
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    await runGenerate();
  }

  async function sharpenFace() {
    if (!source) {
      setError("Settu inn mynd til að skerpa.");
      return;
    }
    if (!profile?.faces.length) {
      setError("Búðu til persónuprófíl með skýrum andlitsmyndum fyrst.");
      return;
    }
    setError("");
    let found = regions;
    if (!found.some((r) => r.kind === "head" || r.kind === "person")) {
      setAnalyzing(true);
      setAnalyzeText("Greini andlit…");
      try {
        found = await analyzeStudioImage(source, setAnalyzeText);
        setRegions(found);
        setAnalyzeText(`${found.length} svæði`);
      } catch {
        setAnalyzeText("");
      } finally {
        setAnalyzing(false);
      }
    }
    const head = found.find((r) => r.kind === "head") || found.find((r) => r.kind === "person");
    if (head) pickRegion(head);
    const text = identityPrompt(profile.name);
    setPrompt(text);
    setUseProfile(true);
    patchSettings({ denoisingStrength: SHARPEN_DENOISING });
    await runGenerate({ prompt: text, mask: head?.maskUrl || null, denoisingStrength: SHARPEN_DENOISING });
  }

  async function studioShoot() {
    const paper = backgroundOf(lights.background);
    const text = backdropShootPrompt(lights.background, profile?.name || "");
    setPrompt(text);
    setBgWant(paper.prompt);
    patchSettings({ denoisingStrength: STUDIO_SHOOT_DENOISING });
    setError("");
    let bgMask: string | null | undefined;
    if (source) {
      let found = regions;
      if (!found.some((r) => r.kind === "background")) {
        setAnalyzing(true);
        setAnalyzeText("Greini bakgrunn…");
        try {
          found = await analyzeStudioImage(source, setAnalyzeText);
          setRegions(found);
          setAnalyzeText(`${found.length} svæði`);
        } catch {
          setAnalyzeText("");
        } finally {
          setAnalyzing(false);
        }
      }
      const bg = found.find((r) => r.kind === "background");
      if (bg) {
        pickRegion(bg);
        bgMask = bg.maskUrl;
      }
    }
    await runGenerate({
      prompt: text,
      mask: source ? bgMask || null : undefined,
      denoisingStrength: STUDIO_SHOOT_DENOISING,
    });
  }

  async function makeAvatar() {
    if (!canBuildAvatar(profile)) {
      setError("Settu inn að minnsta kosti 4 skýrar myndir (andlit + hringur) til að gera avatar.");
      return;
    }
    const text = avatarPrompt(profile?.name || "");
    setPrompt(text);
    setUseProfile(true);
    patchSettings({ width: 1024, height: 1024, denoisingStrength: AVATAR_DENOISING });
    await runGenerate({ prompt: text, mask: null, denoisingStrength: AVATAR_DENOISING });
  }

  async function identityBundle() {
    const useId = Boolean(useProfile && hasIdentity(profile));
    if (!useId || !profile) return { useId: false, faceRefs: undefined as string[] | undefined };
    const [sheet, orbitSheet] = await Promise.all([faceSheet(profile.faces), faceSheet(orbitImages(profile))]);
    return { useId: true, faceRefs: identityRefs(profile.faces, sheet, orbitSheet) };
  }

  async function makeVideo(still?: string) {
    const start = still || working || source || images[0] || "";
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst — hreyfimyndin byrjar á þeim ramma.");
      return;
    }
    const text = mergeIdentity(
      mergePrompt(mergeMotion(prompt || "same adult person", clip.kind), lights),
      profile?.name || "",
      Boolean(useProfile && hasIdentity(profile)),
    );
    try {
      assertAdultPrompt(text, negative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óleyfileg beiðni");
      return;
    }
    setError("");
    setBusy(true);
    setClipText(`Rami 1/${clip.frames}`);
    try {
      const { useId, faceRefs } = await identityBundle();
      const frames = [start];
      let prev = start;
      const denoise = videoDenoising(clip.motion);
      for (let i = 1; i < clip.frames; i++) {
        setClipText(`Rami ${i + 1}/${clip.frames}`);
        const out = await generateLocal(webui, {
          prompt: text,
          negativePrompt: negative.trim(),
          initImage: prev,
          restoreFaces: useId,
          faceRefs,
          faceAdapter: useId ? faceAdapter : null,
          ...settings,
          denoisingStrength: denoise,
          seed: settings.seed === -1 ? -1 : settings.seed + i,
        });
        frames.push(out[0]);
        prev = out[0];
      }
      setClipText("Sauma WebM…");
      const blob = await stitchWebm(pingPong(frames), clip.fps);
      setVideoUrl((cur) => {
        if (cur) URL.revokeObjectURL(cur);
        return URL.createObjectURL(blob);
      });
      setImages(frames);
      setClipText(`${frames.length} rammar · lykkja`);
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /fetch|network|failed to load/i.test(raw)
          ? "Gat ekki saumað hreyfimynd. Er staðbundna WebUI-ið í gangi með --api og CORS?"
          : raw || "Gat ekki saumað hreyfimynd.",
      );
      setClipText("");
    } finally {
      setBusy(false);
    }
  }

  function download(src: string, index: number) {
    const a = document.createElement("a");
    a.href = src;
    a.download = `kjarni-studio-${index + 1}.png`;
    a.click();
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð einkastúdíó…</p>
        </div>
      </StationChrome>
    );
  }

  const editing = Boolean(source);
  const preset = sizePresetId(settings.width, settings.height);

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a> · Einkastúdíó
          </p>
          <h1>Staðbundið líkan</h1>
          <p className="ac-lead">
            Myndirnar verða til á tölvunni þinni gegnum Automatic1111, Forge eða
            SD.Next. Engin skýjasía, ekkert sent út. Fullorðinsmyndefni er leyfilegt.
            Ekkert sem snýr að börnum.
          </p>

          {!accepted ? (
            <div className="ac-gate">
              <p>
                Þetta er einkastúdíó fyrir fullorðna. Þú staðfestir að þú sért 18 ára
                eða eldri, að notkunin sé einka, og að þú biðjir ekki um kynferðislegt
                myndefni af börnum eða ólögráða.
              </p>
              <button type="button" className="ac-btn" onClick={acceptGate}>
                Ég staðfesti — opna stúdíó
              </button>
            </div>
          ) : (
            <>
              <section className="ac-panel">
                <h2>Staðbundið WebUI</h2>
                <p className="ac-hint">
                  Keyrðu Forge / A1111 / SD.Next með{" "}
                  <code>--api --cors-allow-origins=*</code> og hladdu því líkani sem þú
                  vilt. Kjarni bætir ekki við neikvæðu nsfw-prompti.
                </p>
                <div className="ac-row">
                  <label>
                    Slóð
                    <input
                      value={webui}
                      onChange={(e) => setWebui(e.target.value)}
                      spellCheck={false}
                      autoCapitalize="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => checkServer()}
                    disabled={status === "checking"}
                  >
                    Prófa tengingu
                  </button>
                  <a className="ac-btn" href={webui} target="_blank" rel="noreferrer">
                    Opna WebUI-viðmót
                  </a>
                </div>
                <p className={`ac-status ${status}`}>{statusText}</p>
                {canEmbedLocalWebui() && status === "up" ? (
                  <iframe
                    className="ac-webui"
                    src={webui}
                    title="Staðbundið WebUI"
                    allow="fullscreen"
                  />
                ) : (
                  <p className="ac-hint">
                    WebUI-viðmótið opnast í nýjum flipa. HTTPS-Kjarni getur ekki fellt
                    HTTP-viðmótið inn, en formið hér talar samt við vélina þína.
                  </p>
                )}
                {models.length > 0 && (
                  <p className="ac-hint">
                    Í gangi: {models.slice(0, 4).map((m) => m.title || m.model_name).join(" · ")}
                    {models.length > 4 ? ` · +${models.length - 4}` : ""}
                  </p>
                )}
              </section>

              <section className="ac-panel">
                <PersonProfilePanel
                  activeId={activeProfileId}
                  onActive={(id, next) => {
                    setActiveProfileId(id);
                    setProfile(next);
                  }}
                  useProfile={useProfile}
                  onUseProfile={setUseProfile}
                  adapterHint={
                    faceAdapter
                      ? `Andlitsadapter: ${faceAdapter.model}`
                      : status === "up"
                        ? "GFPGAN restore_faces — ControlNet IP-Adapter Face fannst ekki á vélinni"
                        : "Prófaðu tengingu til að sjá hvort andlitsadapter er til"
                  }
                  onAvatar={() => void makeAvatar()}
                  avatarBusy={busy || analyzing}
                />
              </section>

              <form className="ac-panel" onSubmit={generate}>
                <h2>{editing ? "Breyta mynd" : "Prompt"}</h2>
                <p className="ac-hint">
                  {editing
                    ? "Promptið segir hvað á að breytast. Denoising stýrir hversu mikið líkanið má fara frá upprunalegu myndinni."
                    : "Án myndar verður til ný mynd. Settu inn ljósmynd til að breyta fötum, bakgrunni eða smáatriðum."}
                </p>

                <div
                  className={`ac-drop compact ${drag ? "on" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                >
                  {source ? (
                    <div className="ac-source">
                      <img src={source} alt="Mynd til að breyta" />
                      <div>
                        <p>{sourceName || "Upprunamynd"}</p>
                        <p className="ac-hint">img2img · denoising {settings.denoisingStrength.toFixed(2)}</p>
                        <div className="ac-row">
                          <button
                            type="button"
                            className="ac-btn ghost"
                            onClick={() => fileRef.current?.click()}
                          >
                            Skipta um mynd
                          </button>
                          <button
                            type="button"
                            className="ac-btn"
                            onClick={() => void analyze()}
                            disabled={analyzing}
                          >
                            {analyzing ? "Greini…" : "Greina"}
                          </button>
                          <button
                            type="button"
                            className="ac-btn ghost"
                            onClick={() => void sharpenFace()}
                            disabled={busy || analyzing || !hasIdentity(profile)}
                          >
                            Skerpa andlit
                          </button>
                          <button
                            type="button"
                            className="ac-btn ghost"
                            onClick={() => {
                              setSource("");
                              setSourceName("");
                              setWorking("");
                              setMask(null);
                              setRegions([]);
                              setSelectedRegion(null);
                              setPresetMask(null);
                            }}
                          >
                            Fjarlægja
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p>Slepptu mynd hér til að breyta henni, eða</p>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => fileRef.current?.click()}
                      >
                        Velja mynd
                      </button>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    hidden
                    onChange={(e) => {
                      void takeFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {source && (
                  <>
                    {(analyzeText || regions.length > 0) && (
                      <div className="ac-analyze">
                        {analyzeText && <p className="ac-hint">{analyzeText}</p>}
                        {regions.length > 0 && (
                          <>
                            <p className="ac-hint">Veldu svæði, svo hvað á að gera við það.</p>
                            <div className="ac-row ac-chips">
                              {regions.map((region) => (
                                <button
                                  key={region.id}
                                  type="button"
                                  className={`ac-btn ghost ${selectedRegion === region.id ? "on" : ""}`}
                                  onClick={() => pickRegion(region)}
                                >
                                  {region.label}
                                </button>
                              ))}
                            </div>
                            <div className="ac-row">
                              <button type="button" className="ac-btn ghost" onClick={() => applyAction("remove")}>
                                Fjarlægja
                              </button>
                              <button type="button" className="ac-btn ghost" onClick={() => applyAction("recolor")}>
                                Breyta lit
                              </button>
                              <button type="button" className="ac-btn ghost" onClick={() => applyAction("background")}>
                                Nýr bakgrunnur
                              </button>
                            </div>
                            <div className="ac-settings">
                              <label>
                                Nýr litur
                                <input value={colorWant} onChange={(e) => setColorWant(e.target.value)} />
                              </label>
                              <label className="ac-range">
                                Nýr bakgrunnur
                                <input value={bgWant} onChange={(e) => setBgWant(e.target.value)} />
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <AdjustPanel
                      key={`${sourceName}:${source.length}`}
                      source={source}
                      presetMask={presetMask}
                      presetMaskTick={presetMaskTick}
                      onWorkingChange={(next) => {
                        setWorking(next.image);
                        setMask(next.mask);
                      }}
                    />
                  </>
                )}

                <LightPlanPanel
                  plan={lights}
                  onChange={(next) => {
                    if (next.background !== lights.background) {
                      setBgWant(backgroundOf(next.background).prompt);
                    }
                    setLights(next);
                  }}
                  onStudioShoot={() => void studioShoot()}
                  shootBusy={busy || analyzing}
                />

                <label>
                  Lýsing
                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      editing
                        ? "same adult woman, red dress, keep face and pose…"
                        : "nude adult woman, natural light, film still…"
                    }
                  />
                </label>
                <label>
                  Negative (valfrjálst — ekki fyllt með nsfw-banni)
                  <textarea
                    rows={2}
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    placeholder="low quality, blurry, deformed"
                  />
                </label>

                <div className="ac-settings">
                  <label>
                    Stærð
                    <select
                      value={preset}
                      onChange={(e) => {
                        const next = SIZE_PRESETS.find((p) => p.id === e.target.value);
                        if (next) patchSettings({ width: next.width, height: next.height });
                      }}
                    >
                      {SIZE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Skref
                    <input
                      type="number"
                      min={1}
                      max={80}
                      value={settings.steps}
                      onChange={(e) => patchSettings({ steps: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    CFG
                    <input
                      type="number"
                      min={1}
                      max={20}
                      step={0.5}
                      value={settings.cfgScale}
                      onChange={(e) => patchSettings({ cfgScale: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Seed (−1 = handahóf)
                    <input
                      type="number"
                      value={settings.seed}
                      onChange={(e) => patchSettings({ seed: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Sampler
                    <select
                      value={settings.samplerName}
                      onChange={(e) => patchSettings({ samplerName: e.target.value })}
                    >
                      {SAMPLERS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Fjöldi
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={settings.batchSize}
                      onChange={(e) => patchSettings({ batchSize: Number(e.target.value) })}
                    />
                  </label>
                  <label className={`ac-range ${editing ? "" : "dim"}`}>
                    Denoising {settings.denoisingStrength.toFixed(2)}
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.01}
                      value={settings.denoisingStrength}
                      disabled={!editing}
                      onChange={(e) => patchSettings({ denoisingStrength: Number(e.target.value) })}
                    />
                    <span className="ac-hint">
                      {mask
                        ? "Hærra gildi fyllir málaða svæðið meira eftir promptinu"
                        : editing
                          ? denoisingHint(settings.denoisingStrength)
                          : "Kemur í gagnið þegar mynd er sett inn"}
                    </span>
                  </label>
                  {mask && (
                    <label className="ac-range">
                      Maskableyja {maskBlur}px
                      <input
                        type="range"
                        min={0}
                        max={32}
                        value={maskBlur}
                        onChange={(e) => setMaskBlur(Number(e.target.value))}
                      />
                    </label>
                  )}
                </div>

                {error && <p className="ac-error">{error}</p>}
                <div className="ac-row">
                  <button type="submit" className="ac-btn" disabled={busy}>
                    {busy ? "Mynda…" : mask ? "Breyta máluðu svæði" : editing ? "Breyta mynd" : "Mynda staðbundið"}
                  </button>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => void studioShoot()}
                    disabled={busy || analyzing}
                  >
                    Stúdíómyndataka
                  </button>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => void makeAvatar()}
                    disabled={busy || analyzing || !canBuildAvatar(profile)}
                  >
                    Realistic avatar
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onClick={() => void sharpenFace()}
                      disabled={busy || analyzing || !hasIdentity(profile)}
                    >
                      Skerpa andlit
                    </button>
                  )}
                </div>
              </form>

              <VideoPanel
                settings={clip}
                onChange={setClip}
                onMake={() => void makeVideo()}
                busy={busy}
                progress={clipText}
                videoUrl={videoUrl}
                hasStill={Boolean(working || source || images[0])}
              />

              {images.length > 0 && (
                <section className="ac-panel">
                  <h2>Útkoma</h2>
                  <div className="ac-results">
                    {images.map((src, i) => (
                      <figure key={i}>
                        <img src={src} alt={`Útkoma ${i + 1}`} />
                        <figcaption>
                          <button type="button" className="ac-btn ghost" onClick={() => download(src, i)}>
                            Sækja PNG
                          </button>
                          <button
                            type="button"
                            className="ac-btn ghost"
                            onClick={() => {
                              setSource(src);
                              setSourceName(`útkoma-${i + 1}.png`);
                              setWorking("");
                              setMask(null);
                              setRegions([]);
                              setSelectedRegion(null);
                              setPresetMask(null);
                            }}
                          >
                            Nota sem uppruna
                          </button>
                          <button
                            type="button"
                            className="ac-btn ghost"
                            onClick={() => void makeVideo(src)}
                            disabled={busy}
                          >
                            Hreyfimynd
                          </button>
                          <a className="ac-btn ghost" href={artcraftAppHref("photocraft")}>
                            Opna PhotoCraft
                          </a>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
