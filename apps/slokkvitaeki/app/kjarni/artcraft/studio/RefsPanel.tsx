"use client";

import { useRef } from "react";
import { STYLE_KINDS, type StyleKind } from "./refs";

type Props = {
  poseRef: string;
  styleRef: string;
  styleKind: StyleKind;
  motionFrames: string[];
  motionName: string;
  onPose: (src: string) => void;
  onStyle: (src: string) => void;
  onStyleKind: (kind: StyleKind) => void;
  onMotionFile: (file: File) => void;
  onClearPose: () => void;
  onClearStyle: () => void;
  onClearMotion: () => void;
  onMatchPose: () => void;
  onApplyStyle: () => void;
  onRecreateMotion: () => void;
  busy: boolean;
  hasStill: boolean;
  poseHint: string;
  styleHint: string;
};

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

export default function RefsPanel({
  poseRef,
  styleRef,
  styleKind,
  motionFrames,
  motionName,
  onPose,
  onStyle,
  onStyleKind,
  onMotionFile,
  onClearPose,
  onClearStyle,
  onClearMotion,
  onMatchPose,
  onApplyStyle,
  onRecreateMotion,
  busy,
  hasStill,
  poseHint,
  styleHint,
}: Props) {
  const poseInput = useRef<HTMLInputElement>(null);
  const styleInput = useRef<HTMLInputElement>(null);
  const motionInput = useRef<HTMLInputElement>(null);

  function readImage(file: File | undefined, into: (src: string) => void) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => into(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  return (
    <div className="ac-refs">
      <h2>Viðmið — pósa, hreyfing, skart</h2>
      <p className="ac-hint">
        Gerðu avatar fyrst. Markmiðsmynd læsir pósu hans (ekki upprunalegu
        ljósmyndinni). Stutt videó verður að römmum sem hann endurgerir.
        Skjámynd af fötum eða skarti fer á manneskjuna — andlitið helst.
        Við promptið má líka sleppa skjáskoti inn á málað svæði (bikini / haus).
      </p>

      <div className="ac-ref-grid">
        <div className="ac-ref-slot">
          <p className="ac-hint">Pósuviðmið</p>
          {poseRef ? <img src={poseRef} alt="Pósuviðmið" /> : <p className="ac-hint">Engin mynd</p>}
          <div className="ac-row">
            <button type="button" className="ac-btn ghost" onClick={() => poseInput.current?.click()}>
              Velja pósu
            </button>
            {poseRef && (
              <button type="button" className="ac-btn ghost" onClick={onClearPose}>
                Hreinsa
              </button>
            )}
          </div>
          <p className="ac-hint">{poseHint}</p>
          <button
            type="button"
            className="ac-btn"
            onClick={onMatchPose}
            disabled={busy || !poseRef || !hasStill}
          >
            Ná sömu pósu
          </button>
          <input
            ref={poseInput}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              readImage(e.target.files?.[0], onPose);
              e.target.value = "";
            }}
          />
        </div>

        <div className="ac-ref-slot">
          <p className="ac-hint">Hreyfistykki</p>
          {motionFrames.length > 0 ? (
            <div className="ac-ref-strip">
              {motionFrames.map((src, i) => (
                <img key={i} src={src} alt={`Rami ${i + 1}`} />
              ))}
            </div>
          ) : (
            <p className="ac-hint">Ekkert videó</p>
          )}
          {motionName && <p className="ac-hint">{motionName}</p>}
          <div className="ac-row">
            <button type="button" className="ac-btn ghost" onClick={() => motionInput.current?.click()}>
              Velja videó
            </button>
            {motionFrames.length > 0 && (
              <button type="button" className="ac-btn ghost" onClick={onClearMotion}>
                Hreinsa
              </button>
            )}
          </div>
          <button
            type="button"
            className="ac-btn"
            onClick={onRecreateMotion}
            disabled={busy || motionFrames.length === 0 || !hasStill}
          >
            Endurgera hreyfingu
          </button>
          <input
            ref={motionInput}
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onMotionFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="ac-ref-slot">
          <p className="ac-hint">Skart / fatnaður</p>
          {styleRef ? <img src={styleRef} alt="Útlitsviðmið" /> : <p className="ac-hint">Engin skjámynd</p>}
          <div className="ac-row ac-chips">
            {STYLE_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                className={`ac-btn ghost ${styleKind === kind.id ? "on" : ""}`}
                onClick={() => onStyleKind(kind.id)}
              >
                {kind.label}
              </button>
            ))}
          </div>
          <div className="ac-row">
            <button type="button" className="ac-btn ghost" onClick={() => styleInput.current?.click()}>
              Velja skjámynd
            </button>
            {styleRef && (
              <button type="button" className="ac-btn ghost" onClick={onClearStyle}>
                Hreinsa
              </button>
            )}
          </div>
          <p className="ac-hint">{styleHint}</p>
          <button
            type="button"
            className="ac-btn"
            onClick={onApplyStyle}
            disabled={busy || !styleRef || !hasStill}
          >
            Setja á manneskju
          </button>
          <input
            ref={styleInput}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              readImage(e.target.files?.[0], onStyle);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
