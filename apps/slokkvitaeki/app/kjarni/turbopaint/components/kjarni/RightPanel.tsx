"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";
import { isFirewallMark } from "../../lib/board/detect-firewalls";
import { findLayer, objectLayerId } from "../../lib/board/layers";
import { isMvsMark } from "../../lib/board/mvs165";
import { FILL_PRESETS, STICKY_COLORS, STROKE_PRESETS, type BoardObject, type SymbolObject } from "../../lib/board/types";
import { erStimpil, merkiLykill, stimpilDef, stimpillMerkis, type UttektTaeki } from "../../lib/board/uttekt";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";
import { StaerdValinna } from "./StaerdAllra";
import { TaekjaListi } from "./TaekjaListi";
import { TengjaVidHaed } from "./TengjaVidHaed";
import { raesaFjolcrop } from "../../lib/board/fjolcrop";
import { useBoardStore } from "../../lib/board/store";
import { getSymbol } from "../../lib/board/symbols";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import { Textarea } from "../ui/textarea";
import { LayerList } from "./LayerList";
import { HamStika } from "./HamStika";
import { VeggjaHamSpjald } from "./VeggjaRitill";
import { useHamur, type HamAdgerd, type HamurId } from "../../lib/board/hamir";
import { RoomList } from "./RoomList";
import { CustomColorSwatch } from "./ColorPicker";
import { useCustomColors, withAlpha } from "../../lib/board/custom-colors";

type LayerGroupId =
  | "teikning"
  | "rými"
  | "eldveggur"
  | "mvs"
  | "takn"
  | "kalt"
  | "heitt"
  | "skolp"
  | "loftræsting"
  | "hitakerfi"
  | "gegnumtak"
  | "annad";

const LAYER_GROUPS: { id: LayerGroupId; label: string }[] = [
  { id: "teikning", label: "Teikningar" },
  { id: "rými", label: "Rými" },
  { id: "eldveggur", label: "Eldveggir" },
  { id: "mvs", label: "165.BR1" },
  { id: "takn", label: "Tákn" },
  { id: "kalt", label: "Kalt vatn" },
  { id: "heitt", label: "Heitt vatn" },
  { id: "skolp", label: "Skolp / fráveita" },
  { id: "loftræsting", label: "Loftræsting" },
  { id: "hitakerfi", label: "Hitakerfi" },
  { id: "gegnumtak", label: "Gegnumtök" },
  { id: "annad", label: "Annað" },
];

/** Hópar hlutalistans sem hver hamur sýnir — hamur sparar pláss, sýnir aðeins það sem á við (Agnar 03.10.2026). */
const HAM_HOPAR: Record<HamurId, LayerGroupId[]> = {
  teikning: ["teikning", "annad"],
  slokkvitaeki: ["takn", "mvs"],
  brunathettingar: ["eldveggur", "gegnumtak", "kalt", "heitt", "skolp", "loftræsting", "hitakerfi"],
  brunakerfi: ["takn"],
  rymi: ["rými"],
  // Veggir-hamur: tólin í VeggjaHamSpjald — enginn hlutalisti
  veggir: [],
};

function layerGroupOf(obj: BoardObject): LayerGroupId {
  if (obj.type === "rect" && obj.isRoom) return "rými";
  if (obj.name.startsWith("Gegnumtak")) return "gegnumtak";
  const lid = objectLayerId(obj);
  if (lid === "kalt" || lid === "heitt" || lid === "skolp" || lid === "loftræsting" || lid === "hitakerfi") {
    return lid;
  }
  if (obj.type === "image") return "teikning";
  if (isFirewallMark(obj)) return "eldveggur";
  if (isMvsMark(obj)) return "mvs";
  if (obj.type === "symbol") return "takn";
  return "annad";
}

export function RightPanel({
  onFocusObject,
  onHamAdgerd,
  onFela,
}: { onFocusObject?: (id: string) => void; onHamAdgerd?: (a: HamAdgerd) => void; onFela?: () => void } = {}) {
  const objects = useBoardStore((s) => s.objects);
  const layers = useBoardStore((s) => s.layers);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const hamur = useHamur((s) => s.hamur);
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const primary = selected[0];
  const roomSelected = primary?.type === "rect" && Boolean(primary.isRoom);
  const gogn = useUttektGogn((s) => s.gogn);
  const valdirTakn = selected.filter((o): o is SymbolObject => o.type === "symbol");
  const tengdTakn = selected.filter(
    (o): o is SymbolObject => o.type === "symbol" && o.uttektUnitId != null && o.uttektUnitId !== ""
  );

  // Lög heita „tegund + númer" í sköpunarröð (Slökkvitæki 1, 2 …) í stað þess
  // að allt heiti „Tákn". Númer bætist aðeins við þegar fleiri en eitt deila nafni.
  const layerNames = (() => {
    const base = new Map<string, string>();
    const totals = new Map<string, number>();
    for (const obj of objects) {
      const b =
        obj.type === "symbol" && (!obj.name || obj.name === "Tákn")
          ? getSymbol(obj.symbolId).name
          : obj.name || obj.type;
      base.set(obj.id, b);
      totals.set(b, (totals.get(b) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const obj of objects) {
      const b = base.get(obj.id)!;
      const n = (seen.get(b) ?? 0) + 1;
      seen.set(b, n);
      out.set(obj.id, (totals.get(b) ?? 0) > 1 ? `${b} ${n}` : b);
    }
    return out;
  })();

  return (
    <aside className="relative flex h-full w-[264px] shrink-0 flex-col border-l border-white/8 bg-[#12141c] text-stone-200">
      {onFela ? (
        <button
          type="button"
          title="Leggja hliðarspjaldið saman — meira pláss fyrir teikninguna"
          onClick={onFela}
          className="absolute top-2 right-1.5 z-10 rounded px-1 text-sm leading-none text-stone-500 hover:bg-white/10 hover:text-white"
        >
          ›
        </button>
      ) : null}
      {onHamAdgerd ? <HamStika onAdgerd={onHamAdgerd} /> : null}
      {hamur === "veggir" ? <VeggjaHamSpjald /> : null}
      {selected.length ? (
      <div className="border-b border-white/8 px-4 py-3">
        <div className="text-[11px] font-medium tracking-[0.12em] text-[#FE653F]">EIGINLEIKAR</div>
        <div className="mt-1 text-sm text-stone-300">
          {selected.length === 0
            ? "Ekkert valið"
            : selected.length === 1
              ? primary?.name || primary?.type
              : `${selected.length} atriði`}
        </div>
      </div>
      ) : null}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {hamur === "rymi" ? <RoomList onFocusObject={onFocusObject} /> : null}
        {primary ? (
          <div className="space-y-4">
            {tengdTakn.length ? (
              <div className="space-y-1.5 rounded-md border border-white/10 bg-white/4 p-2">
                <div className="text-[11px] leading-snug text-stone-300">
                  {tengdTakn.length === 1 ? lysingTengds(tengdTakn[0], gogn?.taeki) : `${tengdTakn.length} tengd tæki/merki valin`}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-white/10 bg-white/5 text-stone-200"
                  onClick={() => {
                    useBoardStore.getState().deleteIds(tengdTakn.map((o) => o.id));
                    toast.message(
                      "Tekið af teikningunni — tækið er áfram í tækjalistanum (ekki staðsett). Vistast með „Vista í úttekt“."
                    );
                  }}
                >
                  Taka af teikningu
                </Button>
              </div>
            ) : null}
            {primary.type === "symbol" ? (
              <Field label="Merki / númer">
                <Input
                  value={primary.label}
                  onChange={(e) =>
                    useBoardStore.getState().patchObject(primary.id, { label: e.target.value })
                  }
                  placeholder={getSymbol(primary.symbolId).name}
                  className="h-8 border-white/10 bg-white/5 text-stone-100"
                />
              </Field>
            ) : null}
            {/* Stærð: öll valin tákn í einu (Agnar 07.10.2026: „þarf að gera hvert fyrir sig") */}
            {valdirTakn.length ? <StaerdValinna takn={valdirTakn} /> : null}
            {primary.type === "text" || primary.type === "sticky" ? (
              <Field label="Texti">
                <Textarea
                  value={primary.text}
                  onChange={(e) =>
                    useBoardStore.getState().patchObject(primary.id, { text: e.target.value })
                  }
                  className="min-h-24 border-white/10 bg-white/5 text-stone-100"
                />
              </Field>
            ) : null}
            {primary.type === "image" ? (
              <>
                {primary.bladhluti ? <TengjaVidHaed mynd={primary} /> : null}
                <p className="text-xs leading-relaxed text-stone-400">
                  Dragðu gólfplönið til að færa skjalið. Merkingar, tákn og minnismiðar ofan á síðunni
                  fylgja með. Læstu síðunni ef þú vilt ekki hreyfa hana óvart.
                </p>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-white/10 bg-white/5 px-1.5 text-stone-200"
                    onClick={() => {
                      useBoardStore.getState().setTool("crop");
                      toast.message("Dragðu ramma yfir svæðið sem á að HALDA — restin sníðst af");
                    }}
                  >
                    ✂ Croppa teikningu
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title="Margar grunnmyndir á einu blaði: dragðu kassa yfir hverja (1, 2, 3 …), skerðu þær allar í einu og tengdu hverja við sína hæð"
                    className="flex-1 border-[#FE653F]/40 bg-[#FE653F]/10 px-1.5 text-stone-100"
                    onClick={() => {
                      raesaFjolcrop();
                      toast.message("Croppa oft: dragðu kassa yfir hverja grunnmynd — Enter sker, Esc hættir");
                    }}
                  >
                    ✂ Croppa oft
                  </Button>
                </div>
              </>
            ) : null}
            {primary.type === "rect" && primary.isCheckbox ? (
              <Field label="Gátreitur">
                <Button
                  size="sm"
                  variant="outline"
                  className={`w-full border-white/10 ${primary.checked ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-white/5 text-stone-200"}`}
                  onClick={() => useBoardStore.getState().toggleChecked(primary.id)}
                >
                  {primary.checked ? "☑ Hakað — smelltu til að afhaka" : "☐ Óhakað — smelltu til að haka við"}
                </Button>
                <p className="text-[11px] leading-relaxed text-stone-500">
                  Smelltu líka á ✓ í horni reitsins á borðinu. Hakað = allur reiturinn grænn.
                </p>
              </Field>
            ) : null}
            {"stroke" in primary && !roomSelected ? (
              <Field label="Strokulitur">
                <Swatches
                  colors={STROKE_PRESETS}
                  value={primary.stroke}
                  onPreview={(stroke) =>
                    useBoardStore.getState().patchObject(primary.id, { stroke } as never, false)
                  }
                  onChange={(stroke) =>
                    useBoardStore.getState().patchObject(primary.id, { stroke } as never)
                  }
                />
              </Field>
            ) : null}
            {"fill" in primary && !roomSelected ? (
              <Field label="Fylling">
                <Swatches
                  colors={primary.type === "sticky" ? STICKY_COLORS : FILL_PRESETS}
                  value={primary.fill}
                  // A custom fill is half-transparent, like the tinted presets,
                  // so the drawing underneath stays readable.
                  customAlpha={primary.type === "sticky" ? undefined : "66"}
                  onPreview={(fill) =>
                    useBoardStore.getState().patchObject(primary.id, { fill } as never, false)
                  }
                  onChange={(fill) =>
                    useBoardStore.getState().patchObject(primary.id, { fill } as never)
                  }
                />
              </Field>
            ) : null}
            {!roomSelected ? (
            <Field label={`Gegnsæi · ${Math.round(primary.opacity * 100)}%`}>
              <Slider
                min={0.15}
                max={1}
                step={0.05}
                value={[primary.opacity]}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  useBoardStore.getState().patchObject(primary.id, { opacity: n }, false);
                }}
              />
            </Field>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-white/10 bg-white/5 text-stone-200"
                onClick={() => useBoardStore.getState().lockSelected(!primary.locked)}
              >
                {primary.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                {primary.locked ? "Aflæsa" : "Læsa"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => useBoardStore.getState().deleteIds(selectedIds)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-stone-300"
                onClick={() => useBoardStore.getState().sendBackward()}
              >
                Aftur
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-stone-300"
                onClick={() => useBoardStore.getState().bringForward()}
              >
                Fram
              </Button>
            </div>
          </div>
        ) : objects.length === 0 ? (
          <p className="text-xs leading-relaxed text-stone-500">
            Dragðu inn PDF eða TIF af gólfplani. Síðan seturðu inn slökkvitæki, flóttaleiðir, línur og
            minnispunkta — eins og á hvítu borði.
          </p>
        ) : null}
        {/* Tækjalistinn á eftir eiginleikunum: „Taka af teikningu" valins tækis er efst, listinn fyrir neðan. */}
        {hamur === "slokkvitaeki" || hamur === "teikning" ? (
          <div className={primary ? "mt-4" : ""}>
            <TaekjaListi onFocusObject={onFocusObject} />
          </div>
        ) : null}
        {hamur === "brunathettingar" ? (
          <div className="mt-4">
            <LayerList />
          </div>
        ) : null}
        {HAM_HOPAR[hamur].length ? (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium tracking-[0.12em] text-stone-500">
            HLUTIR · {objects.filter((o) => HAM_HOPAR[hamur].includes(layerGroupOf(o))).length}
          </div>
          <div className="space-y-2">
            {LAYER_GROUPS.filter((g) => HAM_HOPAR[hamur].includes(g.id)).map((group) => {
              const items = [...objects].reverse().filter((obj) => layerGroupOf(obj) === group.id);
              if (!items.length) return null;
              return (
                <details key={group.id} open className="rounded-md bg-white/4">
                  <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold tracking-wide text-stone-400">
                    {group.label}
                    <span className="pl-1.5 font-normal text-stone-600">{items.length}</span>
                  </summary>
                  <div className="space-y-0.5 pb-1">
                    {items.map((obj) => (
                      <button
                        key={obj.id}
                        type="button"
                        onClick={() => {
                          useBoardStore.getState().setTool("select");
                          useBoardStore.getState().setSelected([obj.id]);
                          onFocusObject?.(obj.id);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                          selectedIds.includes(obj.id)
                            ? "bg-white/10 text-white"
                            : "text-stone-400 hover:bg-white/5"
                        }`}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full ring-1 ring-white/15"
                          style={{ background: findLayer(layers, objectLayerId(obj))?.color ?? "#78716c" }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {layerNames.get(obj.id) ?? obj.name ?? obj.type}
                        </span>
                        <span
                          role="presentation"
                          onClick={(e) => {
                            e.stopPropagation();
                            useBoardStore.getState().patchObject(obj.id, { hidden: !obj.hidden });
                          }}
                        >
                          {obj.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </span>
                        {obj.locked ? <Lock className="size-3.5" /> : null}
                      </button>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
        ) : null}
      </div>
    </aside>
  );
}

/** „Léttvatn · TMP-N5VABN" fyrir tengt tæki, „Merki Teikning: Út" fyrir stimpil. */
function lysingTengds(s: SymbolObject, taeki: UttektTaeki[] | undefined): string {
  const m = { unitId: s.uttektUnitId, kind: s.uttektKind, sign: s.uttektSign };
  if (erStimpil(m)) {
    const sign = stimpillMerkis(m);
    return "Merki í Teikning: " + (stimpilDef(sign)?.nafn ?? sign ?? "merki");
  }
  const t = taeki?.find((x) => merkiLykill(x.id) === merkiLykill(s.uttektUnitId));
  return t ? `Tæki: ${t.type || "tæki"} · ${t.serial || "#" + t.id}` : `Tæki #${String(s.uttektUnitId)}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[11px] text-stone-500">{label}</div>
      {children}
    </label>
  );
}

function Swatches({
  colors,
  value,
  onPreview,
  onChange,
  customAlpha,
}: {
  colors: readonly string[];
  value: string;
  /** Live while the colour picker is open — applied without a history step. */
  onPreview?: (c: string) => void;
  onChange: (c: string) => void;
  /** Alpha appended to a picked custom colour (fills), e.g. "66". */
  customAlpha?: string;
}) {
  const recent = useCustomColors();
  const custom = recent
    .map((c) => withAlpha(c, customAlpha))
    .filter((c) => !colors.some((preset) => preset.toLowerCase() === c.toLowerCase()));
  const active = (c: string) => value.toLowerCase() === c.toLowerCase();
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`size-6 rounded-md border ${active(c) ? "ring-2 ring-white" : "border-white/15"}`}
          style={{
            background:
              c === "transparent"
                ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 8px 8px"
                : c,
          }}
        />
      ))}
      {custom.map((c) => (
        <button
          key={`custom-${c}`}
          type="button"
          title="Sérsniðinn litur"
          onClick={() => onChange(c)}
          className={`size-6 rounded-md border ${active(c) ? "ring-2 ring-white" : "border-dashed border-white/40"}`}
          style={{ background: c }}
        />
      ))}
      <CustomColorSwatch
        value={value}
        onPreview={onPreview ? (hex) => onPreview(withAlpha(hex, customAlpha)) : undefined}
        onChange={(hex) => onChange(withAlpha(hex, customAlpha))}
      />
    </div>
  );
}
