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
import {
  STUDIO_MODES,
  readStoredMode,
  studioModeHint,
  writeStoredMode,
  type StudioMode,
} from "./modes";
import { assertAdultPrompt } from "./guard";
import PersonProfilePanel from "./PersonProfile";
import {
  avatarPrompt,
  AVATAR_DENOISING,
  IDENTITY_DENOISING_MAX,
  canBuildAvatar,
  clampIdentityDenoising,
  missingOrbitSlots,
  orbitCount,
  hasIdentity,
  identityPrompt,
  identityStill,
  lockFaceRefs,
  mergeIdentity,
  mergeIdentityNegative,
  orbitImages,
  ORBIT_SLOTS,
  SHARPEN_DENOISING,
  type OrbitId,
  type OrbitMap,
  type PersonProfile,
} from "./profile";
import { faceSheet } from "./profileImage";
import AvatarTurn from "./AvatarTurn";
import BasesPanel from "./BasesPanel";
import MeshPanel from "./MeshPanel";
import PartsPanel from "./PartsPanel";
import { spinYaws, type CaptureYaws } from "./mesh";
import { captureStandInYaws } from "./meshView";
import {
  IMPRINT_DENOISING,
  bodyPart,
  imprintPrompt,
  isClipStamp,
  pickKeyFrame,
  type BodyPart,
  type PartStamp,
} from "./parts";
import { imprintOnto, partMask } from "./partsImage";
import {
  BASE_DENOISING,
  DEFAULT_LOOK,
  LOOK_KEY,
  adaptBasePrompt,
  mannequinDataUrl,
  readStoredLook,
  studioBase,
  type BodyLook,
} from "./bases";
import { rasterizeBase } from "./basesImage";
import LooksPanel from "./LooksPanel";
import {
  LOOKBOOK_DENOISING,
  LOOKBOOK_SHOTS,
  lookbookPrompt,
  mergeLooks,
  sequenceFrames,
} from "./looks";
import RefsPanel from "./RefsPanel";
import {
  canPaintSubmit,
  isUserPaintEdit,
  paintEditCfg,
  paintEditDenoising,
  paintEditFaceRefs,
  paintEditMaskBlur,
  paintEditPrompt,
  paintEditRestoreFaces,
  paintInpaintFill,
  type PaintShotKind,
} from "./paintEdit";
import { stampShotIntoMask } from "./paintEditImage";
import WantShot from "./WantShot";
import {
  FIX_DENOISING,
  STYLE_DENOISING,
  TURN_DENOISING,
  fixPrompt,
  mergePose,
  mergeStyle,
  motionRecreatePrompt,
  nearestOrbitView,
  orbitFillDenoising,
  orbitFillOrder,
  poseDenoising,
  studioStill,
  turnPreview,
  yawPrompt,
  yawSlot,
  yawToSlot,
  type StyleKind,
} from "./refs";
import { extractVideoFrames } from "./refsImage";
import VersionsPanel from "./VersionsPanel";
import {
  VERSION_DENOISING,
  dropVersion,
  loadVersions,
  mergeVersion,
  newVersionId,
  saveVersions,
  upsertVersion,
  versionPreset,
  versionPrompt,
  type AvatarVersion,
} from "./versions";
import VideoPanel from "./VideoPanel";
import {
  commandFromPrompt,
  DEFAULT_VIDEO,
  deleteCustomAction,
  loopFrames,
  mergeMotion,
  readCustomActions,
  readStoredVideo,
  saveCustomAction,
  VIDEO_KEY,
  resolveClipSeed,
  videoDenoising,
  videoFrameInit,
  videoFrameSeed,
  type ActionCommand,
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
  findStudioAdapters,
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
  const [poseAdapter, setPoseAdapter] = useState<FaceAdapter | null>(null);
  const [styleAdapter, setStyleAdapter] = useState<FaceAdapter | null>(null);
  const [poseRef, setPoseRef] = useState("");
  const [styleRef, setStyleRef] = useState("");
  const [styleKind, setStyleKind] = useState<StyleKind>("clothes");
  const [paintShotKind, setPaintShotKind] = useState<PaintShotKind>("clothes");
  const [motionFrames, setMotionFrames] = useState<string[]>([]);
  const [motionName, setMotionName] = useState("");
  const [yaw, setYaw] = useState(0);
  const [turnViews, setTurnViews] = useState<Partial<Record<OrbitId, string>>>({});
  const [versions, setVersions] = useState<AvatarVersion[]>([]);
  const [versionPresetId, setVersionPresetId] = useState("summer");
  const [baseId, setBaseId] = useState("w-avg");
  const [bodyLook, setBodyLook] = useState<BodyLook>(DEFAULT_LOOK);
  const [customBase, setCustomBase] = useState("");
  const [partStamps, setPartStamps] = useState<Partial<Record<string, PartStamp>>>({});
  const meshCaptureRef = useRef<CaptureYaws | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [clip, setClip] = useState<VideoSettings>(DEFAULT_VIDEO);
  const [clipText, setClipText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [customActions, setCustomActions] = useState<ActionCommand[]>([]);
  const [looks, setLooks] = useState<string[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [compare, setCompare] = useState(50);
  const [sheetUrl, setSheetUrl] = useState("");
  const [mode, setMode] = useState<StudioMode>("still");

  useEffect(() => {
    setAccepted(window.localStorage.getItem(GATE_KEY) === "1");
    setWebui(readStoredWebuiUrl());
    setSettings(readStoredSettings());
    setLights(readStoredLights());
    setBodyLook(readStoredLook());
    setClip(readStoredVideo());
    setCustomActions(readCustomActions());
    setMode(readStoredMode());
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
    window.localStorage.setItem(LOOK_KEY, JSON.stringify(bodyLook ?? DEFAULT_LOOK));
  }, [ready, bodyLook]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(VIDEO_KEY, JSON.stringify(clip));
  }, [ready, clip]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!activeProfileId) {
      setVersions([]);
      return;
    }
    void loadVersions(activeProfileId).then(setVersions);
  }, [activeProfileId]);

  function acceptGate() {
    window.localStorage.setItem(GATE_KEY, "1");
    setAccepted(true);
  }

  function pickMode(id: StudioMode) {
    setMode(id);
    writeStoredMode(id);
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
      const adapters = await findStudioAdapters(url);
      setFaceAdapter(adapters.face);
      setPoseAdapter(adapters.pose);
      setStyleAdapter(adapters.style);
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
      setPoseAdapter(null);
      setStyleAdapter(null);
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

  function extraControls(override?: { poseRef?: string; styleRef?: string }) {
    return {
      poseRef: override?.poseRef || poseRef || undefined,
      styleRef: override?.styleRef || styleRef || undefined,
      poseAdapter,
      styleAdapter,
    };
  }

  function adoptStill(src: string, name: string) {
    setSource(src);
    setSourceName(name);
    setWorking(src);
    setMask(null);
    setRegions([]);
    setSelectedRegion(null);
    setPresetMask(null);
    setError("");
  }

  async function runGenerate(opts?: {
    prompt?: string;
    mask?: string | null;
    denoisingStrength?: number;
    initImage?: string;
    poseRef?: string;
    styleRef?: string;
    turn?: boolean;
    quiet?: boolean;
  }): Promise<string[]> {
    const text = opts?.prompt ?? prompt;
    const init = identityStill({
      init: opts?.initImage,
      working,
      source,
      profile,
    });
    const painted = Boolean((opts && "mask" in opts ? opts.mask : mask) || "");
    const userPaint = isUserPaintEdit(painted, opts?.denoisingStrength);
    setError("");
    try {
      assertAdultPrompt(text, negative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óleyfileg beiðni");
      return [];
    }
    if (!init) {
      setError("Settu inn ljósmynd af manneskjunni. Án myndar teiknar líkanið nýtt andlit.");
      return [];
    }
    if (!opts?.quiet) setBusy(true);
    try {
      const paintedMask = (opts && "mask" in opts ? opts.mask : mask) || undefined;
      const shot = (opts?.styleRef || styleRef || "").trim();
      const useShot = userPaint && Boolean(shot);
      let initForPaint = init;
      if (useShot && paintedMask) {
        try {
          initForPaint = await stampShotIntoMask(init, paintedMask, shot);
        } catch {
          initForPaint = init;
        }
      }
      const { faceRefs: locked } = await identityBundle(init);
      const faceRefs = userPaint ? paintEditFaceRefs(paintShotKind, useShot ? shot : "", locked) : locked;
      const denoise = userPaint
        ? paintEditDenoising(settings.denoisingStrength, useShot)
        : clampIdentityDenoising(
            opts?.denoisingStrength ?? settings.denoisingStrength,
            true,
            painted,
            Boolean(opts?.turn),
          );
      const out = await generateLocal(webui, {
        prompt: userPaint
          ? paintEditPrompt(text, useShot, paintShotKind)
          : mergeIdentity(mergePrompt(mergeLooks(text, looks), lights), profile?.name || "", true),
        negativePrompt: mergeIdentityNegative(negative),
        initImage: initForPaint,
        mask: paintedMask,
        maskBlur: userPaint ? paintEditMaskBlur(maskBlur) : maskBlur,
        inpaintingFill: userPaint ? paintInpaintFill(useShot) : undefined,
        restoreFaces: userPaint ? paintEditRestoreFaces(paintShotKind, useShot) : true,
        faceRefs,
        faceAdapter,
        ...extraControls({ poseRef: opts?.poseRef, styleRef: useShot ? shot : opts?.styleRef }),
        ...settings,
        cfgScale: userPaint ? paintEditCfg(settings.cfgScale) : settings.cfgScale,
        denoisingStrength: denoise,
      });
      setImages(out);
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
      return out;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /fetch|network|failed to load/i.test(raw)
          ? "Gat ekki myndað. Er staðbundna WebUI-ið í gangi með --api og CORS?"
          : raw || "Gat ekki myndað. Er staðbundna WebUI-ið í gangi með --api og CORS?",
      );
      return [];
    } finally {
      if (!opts?.quiet) setBusy(false);
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!canPaintSubmit(mask, prompt, styleRef)) {
      setError("Skrifaðu hvað á að koma eða slepptu skjáskoti (bikini / haus) á rauða svæðið.");
      return;
    }
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
    if (!identityStill({ working, source, profile })) {
      setError("Settu inn ljósmynd. Án myndar teiknar líkanið nýtt andlit á dúkinn.");
      return;
    }
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

  function selectedBaseImage(): string {
    return customBase || mannequinDataUrl(studioBase(baseId), bodyLook);
  }

  async function makeAvatar() {
    if (!canBuildAvatar(profile)) {
      setError("Settu inn að minnsta kosti 4 skýrar myndir (andlit + hringur) til að gera avatar.");
      return;
    }
    const base = studioBase(baseId);
    const photo = identityStill({ working, source, profile });
    const raw = selectedBaseImage();
    let mannequin = "";
    try {
      mannequin = await rasterizeBase(raw);
    } catch {
      mannequin = "";
    }
    const init = photo || mannequin || undefined;
    const text = photo
      ? mergeIdentity(adaptBasePrompt(profile?.name || "", base, bodyLook), profile?.name || "", true)
      : mannequin
        ? adaptBasePrompt(profile?.name || "", base, bodyLook)
        : avatarPrompt(profile?.name || "");
    const denoise = photo ? IDENTITY_DENOISING_MAX : mannequin ? BASE_DENOISING : AVATAR_DENOISING;
    setPrompt(text);
    setUseProfile(true);
    patchSettings({ width: 768, height: 1024, denoisingStrength: denoise });
    const out = await runGenerate({
      prompt: text,
      mask: null,
      denoisingStrength: denoise,
      initImage: init,
    });
    if (out[0]) {
      setTurnViews({ front: out[0] });
      adoptStill(out[0], "avatar.png");
    }
  }

  async function takePartFile(part: BodyPart, file: File) {
    setError("");
    try {
      if (file.type.startsWith("video/")) {
        const frames = await extractVideoFrames(file);
        const image = pickKeyFrame(frames);
        if (!image) throw new Error("Gat ekki lesið ramma úr videóinu");
        await stampPart(part, { image, frames, name: file.name });
        return;
      }
      const image = await readImageFile(file);
      await stampPart(part, { image, name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki lesið skrána á partinn");
    }
  }

  async function stampPart(part: BodyPart, stamp: PartStamp) {
    setError("");
    try {
      let start = studioStill(working, images, source);
      if (!start) start = await rasterizeBase(selectedBaseImage());
      const next = await imprintOnto(start, stamp.image, part);
      setPartStamps((cur) => ({ ...cur, [part.id]: stamp }));
      adoptStill(next, `part-${part.id}.png`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki málað partinn");
    }
  }

  async function bakePart(partId: string) {
    const part = bodyPart(partId);
    const stamp = partStamps[partId];
    const start = studioStill(working, images, source);
    if (!part || !stamp?.image || !start) {
      setError("Málaðu partinn fyrst.");
      return;
    }
    const text = imprintPrompt(part, profile?.name || "");
    const maskUrl = await partMask(start, part);
    setPrompt(text);
    patchSettings({ denoisingStrength: IMPRINT_DENOISING });
    const out = await runGenerate({
      prompt: text,
      mask: maskUrl,
      initImage: start,
      denoisingStrength: IMPRINT_DENOISING,
      styleRef: stamp.image,
    });
    if (out[0]) {
      adoptStill(out[0], `baka-${part.id}.png`);
    }
  }

  async function playPart(partId: string) {
    const part = bodyPart(partId);
    const stamp = partStamps[partId];
    const start = studioStill(working, images, source);
    const frames = stamp?.frames || [];
    if (!part || !isClipStamp(stamp) || !start) {
      setError("Dragðu videóbrot á partinn fyrst.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const out: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        setClipText(`${part.label} ${i + 1}/${frames.length}`);
        out.push(await imprintOnto(start, frames[i], part));
      }
      setClipText("Sauma partahreyfingu…");
      const blob = await stitchWebm(out, clip.fps);
      setVideoUrl((cur) => {
        if (cur) URL.revokeObjectURL(cur);
        return URL.createObjectURL(blob);
      });
      setImages(out);
      if (out[out.length - 1]) setWorking(out[out.length - 1]);
      setClipText(`${out.length} rammar · ${part.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki hreyft partinn");
      setClipText("");
    } finally {
      setBusy(false);
    }
  }

  async function spinMesh(capture: (deg: number) => Promise<string>) {
    setError("");
    setBusy(true);
    try {
      const yaws = spinYaws();
      const frames: string[] = [];
      for (let i = 0; i < yaws.length; i++) {
        setClipText(`3D ${i + 1}/${yaws.length}`);
        frames.push(await capture(yaws[i]));
      }
      setClipText("Sauma 3D-snúning…");
      const blob = await stitchWebm(frames, clip.fps);
      setVideoUrl((cur) => {
        if (cur) URL.revokeObjectURL(cur);
        return URL.createObjectURL(blob);
      });
      setImages(frames);
      if (frames[0]) adoptStill(frames[0], "mesh-spin.png");
      setClipText(`${frames.length} rammar · 3D snúningur`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki snúið möskvanum");
      setClipText("");
    } finally {
      setBusy(false);
    }
  }

  async function bakeAllParts() {
    for (const id of Object.keys(partStamps)) {
      if (partStamps[id]) await bakePart(id);
    }
  }

  async function identityBundle(still?: string) {
    const photo = identityStill({ init: still, working, source, profile });
    const faces = profile?.faces || [];
    if (!photo && faces.length === 0 && orbitCount(profile) === 0) {
      return { useId: false, faceRefs: undefined as string[] | undefined };
    }
    const [sheet, orbitSheet] = await Promise.all([
      faceSheet(faces),
      faceSheet(orbitImages(profile)),
    ]);
    return { useId: true, faceRefs: lockFaceRefs(photo, faces, sheet, orbitSheet) };
  }

  async function makeVideo(still?: string) {
    const start = still || studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst — hreyfimyndin byrjar á þeim ramma.");
      return;
    }
    const text = mergeIdentity(
      mergePrompt(mergeLooks(mergeMotion(prompt || "same adult person", clip.kind, customActions), looks), lights),
      profile?.name || "",
      true,
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
      const { faceRefs } = await identityBundle(start);
      const frames = [start];
      const clipSeed = resolveClipSeed(settings.seed);
      const denoise = clampIdentityDenoising(videoDenoising(clip.motion), true);
      for (let i = 1; i < clip.frames; i++) {
        setClipText(`Rami ${i + 1}/${clip.frames}`);
        const out = await generateLocal(webui, {
          prompt: text,
          negativePrompt: mergeIdentityNegative(negative),
          initImage: videoFrameInit(start),
          restoreFaces: true,
          faceRefs,
          faceAdapter,
          ...extraControls(),
          ...settings,
          denoisingStrength: denoise,
          seed: videoFrameSeed(clipSeed, i),
        });
        frames.push(out[0]);
      }
      setClipText("Sauma WebM…");
      const blob = await stitchWebm(loopFrames(frames, clip.kind, customActions), clip.fps);
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

  async function makeLookbook() {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst — lookbookið byrjar á henni.");
      return;
    }
    setError("");
    setBusy(true);
    setClipText("Lookbook…");
    try {
      const { faceRefs } = await identityBundle(start);
      const out: string[] = [];
      for (const shot of LOOKBOOK_SHOTS) {
        setClipText(`Lookbook · ${shot.label}`);
        const text = mergeIdentity(
          mergePrompt(mergeLooks(lookbookPrompt(shot.id, profile?.name || ""), looks), lights),
          profile?.name || "",
          true,
        );
        assertAdultPrompt(text, negative);
        const imgs = await generateLocal(webui, {
          prompt: text,
          negativePrompt: mergeIdentityNegative(negative),
          initImage: start,
          restoreFaces: true,
          faceRefs,
          faceAdapter,
          ...extraControls(),
          ...settings,
          denoisingStrength: clampIdentityDenoising(LOOKBOOK_DENOISING, true),
        });
        out.push(imgs[0]);
      }
      setImages(out);
      setClipText("Lookbook tilbúið · 4 myndir");
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw || "Gat ekki gert lookbook.");
      setClipText("");
    } finally {
      setBusy(false);
    }
  }

  async function makeSequence() {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst.");
      return;
    }
    if (queue.length === 0) {
      setError("Bættu athöfn við röðina fyrst.");
      return;
    }
    const per = sequenceFrames(queue.length, clip.frames);
    setError("");
    setBusy(true);
    try {
      const { faceRefs } = await identityBundle(start);
      const all: string[] = [];
      let step = 0;
      const total = per * queue.length;
      const clipSeed = resolveClipSeed(settings.seed);
      const denoise = clampIdentityDenoising(videoDenoising(clip.motion), true);
      for (const kind of queue) {
        const text = mergeIdentity(
          mergePrompt(mergeLooks(mergeMotion(prompt || "same adult person", kind, customActions), looks), lights),
          profile?.name || "",
          true,
        );
        assertAdultPrompt(text, negative);
        for (let i = 0; i < per; i++) {
          step += 1;
          setClipText(`Röð ${step}/${total}`);
          const imgs = await generateLocal(webui, {
            prompt: text,
            negativePrompt: mergeIdentityNegative(negative),
            initImage: videoFrameInit(start),
            restoreFaces: true,
            faceRefs,
            faceAdapter,
            ...extraControls(),
            ...settings,
            denoisingStrength: denoise,
            seed: videoFrameSeed(clipSeed, step),
          });
          all.push(imgs[0]);
        }
      }
      setClipText("Sauma röð…");
      const blob = await stitchWebm(all, clip.fps);
      setVideoUrl((cur) => {
        if (cur) URL.revokeObjectURL(cur);
        return URL.createObjectURL(blob);
      });
      setImages(all);
      setClipText(`${all.length} rammar · röð`);
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw || "Gat ekki keyrt röð.");
      setClipText("");
    } finally {
      setBusy(false);
    }
  }

  async function makeSheet() {
    if (images.length === 0) return;
    const sheet = await faceSheet(images);
    if (sheet) setSheetUrl(sheet);
  }

  async function takeMotion(file: File) {
    setError("");
    try {
      const frames = await extractVideoFrames(file);
      setMotionFrames(frames);
      setMotionName(`${file.name} · ${frames.length} rammar`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki lesið videóið");
    }
  }

  async function matchPose() {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst — pósuviðmiðið vinnur á honum.");
      return;
    }
    if (!poseRef) {
      setError("Veldu pósuviðmið fyrst.");
      return;
    }
    const text = mergePose(prompt, profile?.name || "");
    const denoise = poseDenoising(Boolean(poseAdapter));
    setPrompt(text);
    patchSettings({ denoisingStrength: denoise });
    const out = await runGenerate({ prompt: text, mask: null, denoisingStrength: denoise, initImage: start });
    if (out[0]) setWorking(out[0]);
  }

  async function applyStyle() {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst.");
      return;
    }
    if (!styleRef) {
      setError("Veldu skjámynd af fötum eða skarti fyrst.");
      return;
    }
    const text = mergeStyle(prompt, styleKind);
    setPrompt(text);
    patchSettings({ denoisingStrength: STYLE_DENOISING });
    const out = await runGenerate({ prompt: text, mask: null, denoisingStrength: STYLE_DENOISING, initImage: start });
    if (out[0]) setWorking(out[0]);
  }

  async function recreateMotion() {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar eða settu inn mynd fyrst.");
      return;
    }
    if (motionFrames.length === 0) {
      setError("Veldu stutt videó fyrst.");
      return;
    }
    const text = mergeIdentity(
      mergePrompt(mergeLooks(motionRecreatePrompt(profile?.name || ""), looks), lights),
      profile?.name || "",
      true,
    );
    try {
      assertAdultPrompt(text, negative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óleyfileg beiðni");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { faceRefs } = await identityBundle(start);
      const frames = [start];
      const clipSeed = resolveClipSeed(settings.seed);
      const denoise = clampIdentityDenoising(videoDenoising(clip.motion), true);
      for (let i = 0; i < motionFrames.length; i++) {
        setClipText(`Hreyfing ${i + 1}/${motionFrames.length}`);
        const out = await generateLocal(webui, {
          prompt: text,
          negativePrompt: mergeIdentityNegative(negative),
          initImage: videoFrameInit(start),
          restoreFaces: true,
          faceRefs,
          faceAdapter,
          ...extraControls({ poseRef: motionFrames[i] }),
          ...settings,
          denoisingStrength: denoise,
          seed: videoFrameSeed(clipSeed, i + 1),
        });
        frames.push(out[0]);
      }
      setClipText("Sauma hreyfingu…");
      const blob = await stitchWebm(frames, clip.fps);
      setVideoUrl((cur) => {
        if (cur) URL.revokeObjectURL(cur);
        return URL.createObjectURL(blob);
      });
      setImages(frames);
      if (frames[frames.length - 1]) setWorking(frames[frames.length - 1]);
      setClipText(`${frames.length} rammar · hreyfistykki`);
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw || "Gat ekki endurgert hreyfingu.");
      setClipText("");
    } finally {
      setBusy(false);
    }
  }

  function openTurnView() {
    const preview = turnPreview(yaw, turnViews, profile, studioStill(working, images, source));
    if (!preview) {
      setError("Snúðu avatarnum eða settu inn hringmynd fyrst.");
      return;
    }
    adoptStill(preview.src, `sjónarhorn-${preview.label}.png`);
  }

  async function turnAvatar() {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar fyrst.");
      return;
    }
    const slot = yawSlot(yaw);
    const text = yawPrompt(yaw, profile?.name || "");
    const orbit = nearestOrbitView(profile, yaw);
    setPrompt(text);
    patchSettings({ denoisingStrength: TURN_DENOISING });
    const out = await runGenerate({
      prompt: text,
      mask: null,
      denoisingStrength: TURN_DENOISING,
      initImage: start,
      poseRef: orbit?.src,
    });
    if (out[0]) {
      setTurnViews((cur) => ({ ...cur, [slot.id]: out[0] }));
      adoptStill(out[0], `avatar-${slot.label}.png`);
    }
  }

  async function guessOrbit(): Promise<OrbitMap | null> {
    if (!profile) {
      setError("Búðu fyrst til prófíl.");
      return null;
    }
    if (orbitCount(profile) === 0) {
      setError("Settu inn að minnsta kosti eina ljósmynd á hringinn. 3D-dúkkan er bara horn, ekki manneskjan.");
      return null;
    }
    const missing = missingOrbitSlots(profile.orbit);
    if (missing.length === 0) return profile.orbit;
    const photos = ORBIT_SLOTS.filter((slot) => profile.orbit[slot.id]).map((slot) => ({ deg: slot.deg }));
    const queue = orbitFillOrder(missing, photos);
    const orbit: OrbitMap = { ...profile.orbit };
    setError("");
    setBusy(true);
    try {
      setClipText("Les 3D-horn…");
      const yaws = queue.map((slot) => slot.deg);
      const shots = meshCaptureRef.current
        ? await meshCaptureRef.current(yaws)
        : await captureStandInYaws(bodyLook, studioBase(baseId), yaws);
      let filled = 0;
      for (let i = 0; i < queue.length; i++) {
        const slot = queue[i];
        setClipText(`Mála ${slot.label} af ljósmynd (${i + 1}/${queue.length})`);
        const neighbor = nearestOrbitView({ ...profile, orbit }, slot.deg);
        if (!neighbor) continue;
        const pose = shots[slot.deg] || "";
        const text = yawPrompt(slot.deg, profile.name);
        const out = await runGenerate({
          prompt: text,
          mask: null,
          initImage: neighbor.src,
          poseRef: pose || undefined,
          denoisingStrength: orbitFillDenoising(neighbor.deg, slot.deg),
          turn: true,
          quiet: true,
        });
        if (!out[0]) continue;
        orbit[slot.id] = out[0];
        filled += 1;
        setTurnViews((cur) => ({ ...cur, [slot.id]: out[0] }));
      }
      if (filled === 0) {
        setError("Gat ekki málað vantar horn. Tengdu Forge og reyndu aftur — dúkkan er ekki sett inn sem mynd.");
        return null;
      }
      const first = orbit.front || orbit.frontLeft || orbit.frontRight || Object.values(orbit)[0];
      if (first) adoptStill(first, "hringur.png");
      setClipText(`${orbitCount({ ...profile, orbit })} af 8 hornum · málað af ljósmynd`);
      return orbit;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki fyllt hornin af ljósmyndinni.");
      return orbitCount({ ...profile, orbit }) > orbitCount(profile) ? orbit : null;
    } finally {
      setBusy(false);
    }
  }

  async function fixPainted() {
    if (!mask) {
      setError("Málaðu gallann rauðan fyrst.");
      return;
    }
    const text = fixPrompt(prompt);
    setPrompt(text);
    patchSettings({ denoisingStrength: FIX_DENOISING });
    const out = await runGenerate({
      prompt: text,
      mask,
      denoisingStrength: FIX_DENOISING,
      initImage: working || source,
    });
    if (out[0]) {
      setTurnViews((cur) => ({ ...cur, [yawToSlot(yaw)]: out[0] }));
      adoptStill(out[0], sourceName || "avatar-lagad.png");
    }
  }

  async function persistVersions(next: AvatarVersion[]) {
    if (!activeProfileId) {
      setError("Búðu til prófíl fyrst til að vista útgáfur.");
      return;
    }
    setVersions(await saveVersions(activeProfileId, next));
  }

  async function makeVersion(label: string) {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar fyrst.");
      return;
    }
    if (!activeProfileId) {
      setError("Búðu til prófíl fyrst.");
      return;
    }
    const preset = versionPreset(versionPresetId);
    const line = preset && preset.label === label ? preset.prompt : versionPrompt(label);
    const text = mergeVersion(prompt, line);
    try {
      assertAdultPrompt(text, negative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óleyfileg beiðni");
      return;
    }
    setPrompt(text);
    patchSettings({ denoisingStrength: VERSION_DENOISING });
    const out = await runGenerate({
      prompt: text,
      mask: null,
      denoisingStrength: VERSION_DENOISING,
      initImage: start,
    });
    if (!out[0]) return;
    const row: AvatarVersion = {
      id: newVersionId(),
      label,
      image: out[0],
      prompt: text,
      updatedAt: Date.now(),
    };
    await persistVersions(upsertVersion(versions, row));
    adoptStill(out[0], `utgafa-${label}.png`);
  }

  async function saveCurrentVersion(label: string) {
    const start = studioStill(working, images, source);
    if (!start) {
      setError("Gerðu avatar fyrst.");
      return;
    }
    if (!activeProfileId) {
      setError("Búðu til prófíl fyrst.");
      return;
    }
    const row: AvatarVersion = {
      id: newVersionId(),
      label,
      image: start,
      prompt: prompt.trim(),
      updatedAt: Date.now(),
    };
    await persistVersions(upsertVersion(versions, row));
  }

  function loadVersion(row: AvatarVersion) {
    adoptStill(row.image, `utgafa-${row.label}.png`);
    if (row.prompt) setPrompt(row.prompt);
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
  const hasPerson = Boolean(identityStill({ working, source, profile }));
  const preset = sizePresetId(settings.width, settings.height);
  const hasStill = Boolean(studioStill(working, images, source));

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a> · Einkastúdíó
          </p>
          <div className="ac-studio-head">
            <h1>Staðbundið líkan</h1>
            {accepted && (
              <div className="ac-modes" role="tablist" aria-label="Stúdíóhamur">
                {STUDIO_MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`studio-mode-${item.id}`}
                    aria-controls={`studio-mode-panel-${item.id}`}
                    aria-selected={mode === item.id}
                    className={mode === item.id ? "on" : undefined}
                    onClick={() => pickMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="ac-lead">
            {accepted
              ? studioModeHint(mode)
              : "Myndirnar verða til á tölvunni þinni gegnum Automatic1111, Forge eða SD.Next. Engin skýjasía, ekkert sent út. Fullorðinsmyndefni er leyfilegt. Ekkert sem snýr að börnum."}
          </p>
          {accepted && (
            <p className="ac-hint">
              Automatic1111, Forge eða SD.Next á tölvunni þinni. Ekkert sent út. Ekkert
              sem snýr að börnum.
            </p>
          )}

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

              {mode === "person" && (
              <section
                className="ac-panel"
                id="studio-mode-panel-person"
                role="tabpanel"
                aria-labelledby="studio-mode-person"
              >
                <PersonProfilePanel
                  activeId={activeProfileId}
                  onActive={(id, next) => {
                    if (id !== activeProfileId) setTurnViews({});
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
                  onGuessOrbit={() => guessOrbit()}
                  avatarBusy={busy || analyzing}
                />
                <BasesPanel
                  baseId={baseId}
                  look={bodyLook}
                  customBase={customBase}
                  onBase={(id) => {
                    const next = studioBase(id);
                    setBaseId(id);
                    setBodyLook((cur) => ({ ...cur, build: next.build }));
                    setCustomBase("");
                    setPartStamps({});
                  }}
                  onLook={setBodyLook}
                  onCustom={setCustomBase}
                  onClearCustom={() => setCustomBase("")}
                  onAdapt={() => void makeAvatar()}
                  busy={busy || analyzing}
                  canAdapt={canBuildAvatar(profile)}
                />
                <MeshPanel
                  look={bodyLook}
                  baseId={baseId}
                  busy={busy}
                  onStill={(src) => adoptStill(src, "mesh.png")}
                  onSpin={(capture) => void spinMesh(capture)}
                  onCapture={(capture) => {
                    meshCaptureRef.current = capture;
                  }}
                />
                <PartsPanel
                  still={studioStill(working, images, source) || mannequinDataUrl(studioBase(baseId), bodyLook)}
                  stamps={partStamps}
                  onFile={(part, file) => void takePartFile(part, file)}
                  onBake={(id) => void bakePart(id)}
                  onBakeAll={() => void bakeAllParts()}
                  onPlay={(id) => void playPart(id)}
                  onClear={(id) =>
                    setPartStamps((cur) => {
                      const next = { ...cur };
                      delete next[id];
                      return next;
                    })
                  }
                  busy={busy}
                />
                <AvatarTurn
                  yaw={yaw}
                  onYaw={setYaw}
                  view={turnPreview(yaw, turnViews, profile, studioStill(working, images, source))}
                  onTurn={() => void turnAvatar()}
                  onOpen={openTurnView}
                  onFix={() => void fixPainted()}
                  busy={busy}
                  hasMask={Boolean(mask)}
                  hasStill={hasStill}
                />
                <VersionsPanel
                  presetId={versionPresetId}
                  onPreset={setVersionPresetId}
                  versions={versions}
                  onMake={(label) => void makeVersion(label)}
                  onSave={(label) => void saveCurrentVersion(label)}
                  onLoad={loadVersion}
                  onDelete={(id) => void persistVersions(dropVersion(versions, id))}
                  busy={busy}
                  hasStill={hasStill}
                  hasProfile={Boolean(activeProfileId)}
                />
              </section>
              )}

              {mode === "still" && (
              <>
              <form
                className="ac-panel"
                id="studio-mode-panel-still"
                role="tabpanel"
                aria-labelledby="studio-mode-still"
                onSubmit={generate}
              >
                <h2>{editing ? "Breyta mynd" : "Prompt"}</h2>
                <p className="ac-hint">
                  {mask
                    ? "Málaðu yfir kjól eða haus. Skrifaðu bikini / sundfatnaður eða slepptu skjáskoti af því sem á að koma. Aðeins rauða svæðið er endurskrifað."
                    : editing
                      ? "Promptið eitt og sér málar yfir alla myndina og skemmir hana. Málaðu fyrst svæðið sem á að breytast."
                      : "Settu inn ljósmynd af manneskjunni fyrst. Án myndar teiknar líkanið alltaf nýtt andlit."}
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

                <LooksPanel
                  selected={looks}
                  onChange={setLooks}
                  onLookbook={() => void makeLookbook()}
                  busy={busy}
                  hasStill={hasStill}
                />

                <RefsPanel
                  poseRef={poseRef}
                  styleRef={styleRef}
                  styleKind={styleKind}
                  motionFrames={motionFrames}
                  motionName={motionName}
                  onPose={setPoseRef}
                  onStyle={setStyleRef}
                  onStyleKind={setStyleKind}
                  onMotionFile={(file) => void takeMotion(file)}
                  onClearPose={() => setPoseRef("")}
                  onClearStyle={() => setStyleRef("")}
                  onClearMotion={() => {
                    setMotionFrames([]);
                    setMotionName("");
                  }}
                  onMatchPose={() => void matchPose()}
                  onApplyStyle={() => void applyStyle()}
                  onRecreateMotion={() => void recreateMotion()}
                  busy={busy}
                  hasStill={hasStill}
                  poseHint={
                    poseAdapter
                      ? `OpenPose: ${poseAdapter.model}`
                      : status === "up"
                        ? "Engin OpenPose á vélinni — prófum með prompti"
                        : "Prófaðu tengingu til að sjá hvort OpenPose er til"
                  }
                  styleHint={
                    styleAdapter
                      ? `Útlitsadapter: ${styleAdapter.model}`
                      : status === "up"
                        ? "Ekkert IP-Adapter (án andlits) — prófum með prompti"
                        : "Prófaðu tengingu til að sjá hvort útlitsadapter er til"
                  }
                />

                <div className="ac-paint-ask">
                  <label>
                    Lýsing
                    <textarea
                      rows={5}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={
                        mask
                          ? "t.d. bikini / sundfatnaður — eða slepptu skjáskoti"
                          : editing
                            ? "same adult woman, red dress, keep face and pose…"
                            : "nude adult woman, natural light, film still…"
                      }
                    />
                  </label>
                  <WantShot
                    src={styleRef}
                    kind={paintShotKind}
                    onSrc={setStyleRef}
                    onKind={setPaintShotKind}
                    onClear={() => setStyleRef("")}
                  />
                </div>
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
                      {mask && styleRef
                        ? "Skjáskot er sett í gatið (minnst 0.50). Utan rauða helst."
                        : mask
                          ? "Málað svæði er endurskrifað (minnst 0.62). Utan rauða helst."
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
                  <button type="submit" className="ac-btn" disabled={busy || !hasPerson}>
                    {busy
                      ? "Mynda…"
                      : mask
                        ? "Breyta máluðu svæði"
                        : hasPerson
                          ? "Breyta mynd"
                          : "Settu inn mynd fyrst"}
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

              {images.length > 0 && (
                <section className="ac-panel">
                  <h2>Útkoma</h2>
                  {source && images[0] && (
                    <div className="ac-compare">
                      <p className="ac-hint">Samanburður — dragðu til að sjá uppruna á móti útkomu.</p>
                      <div className="ac-compare-stage">
                        <img src={images[0]} alt="Nýtt" />
                        <img
                          src={source}
                          alt="Uppruni"
                          style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                        />
                      </div>
                      <label className="ac-range">
                        Uppruni ← {compare}% → Nýtt
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={compare}
                          onChange={(e) => setCompare(Number(e.target.value))}
                        />
                      </label>
                    </div>
                  )}
                  <div className="ac-row">
                    <button type="button" className="ac-btn ghost" onClick={() => void makeSheet()} disabled={images.length < 2}>
                      Snertilisti
                    </button>
                  </div>
                  {sheetUrl && (
                    <figure className="ac-clip">
                      <img src={sheetUrl} alt="Snertilisti" />
                      <figcaption>
                        <a className="ac-btn ghost" href={sheetUrl} download="kjarni-studio-snertilisti.jpg">
                          Sækja snertilista
                        </a>
                      </figcaption>
                    </figure>
                  )}
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
                            onClick={() => {
                              pickMode("video");
                              void makeVideo(src);
                            }}
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

              {mode === "video" && (
              <div
                id="studio-mode-panel-video"
                role="tabpanel"
                aria-labelledby="studio-mode-video"
              >
              <VideoPanel
                settings={clip}
                onChange={setClip}
                onMake={() => void makeVideo()}
                busy={busy}
                progress={clipText}
                videoUrl={videoUrl}
                hasStill={hasStill}
                prompt={prompt}
                custom={customActions}
                onSaveAction={(label) => {
                  try {
                    assertAdultPrompt(prompt, negative);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Óleyfileg skipun");
                    return;
                  }
                  const row = commandFromPrompt(label, prompt);
                  if (!row) {
                    setError("Skrifaðu prompt til að vista skipun.");
                    return;
                  }
                  setCustomActions(saveCustomAction(customActions, row));
                  setClip((cur) => ({ ...cur, kind: row.id, motion: row.motion }));
                  setError("");
                }}
                onDeleteAction={(id) => {
                  const next = deleteCustomAction(customActions, id);
                  setCustomActions(next);
                  if (clip.kind === id) {
                    setClip((cur) => ({ ...cur, kind: "breathe" }));
                  }
                }}
                queue={queue}
                onQueue={setQueue}
                onRunQueue={() => void makeSequence()}
              />
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
