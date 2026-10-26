'use client';

/**
 * Prufukeyrsla — the test-run panel. The parts already on the bench are tagged
 * with a role, then the blowback cycle plays on them so the stroke, the valve
 * and the ball can be watched and checked for clearance. The numbers come from
 * the same `hammer.ts` model the Hammer dialog uses, so they agree.
 */

import { Play, Pause, Gauge, X } from 'lucide-react';
import type { HammerInputs, HammerResult, SpringCoil } from '@/lib/3dwork/hammer';
import type { MarkerRole } from '@/lib/3dwork/project';
import { ACTION_GHOST, FIELD, LABEL } from './ui';

const ROLES: { value: MarkerRole | 'none'; label: string }[] = [
  { value: 'none', label: 'Kyrrt' },
  { value: 'recip', label: 'Bolti + hamar' },
  { value: 'valve', label: 'Ventilpinni' },
  { value: 'ball', label: 'Kúla' },
];

const fixed = (value: number, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

export interface MotionPanelProps {
  onClose: () => void;
  parts: { id: string; name: string; role?: MarkerRole }[];
  onRole: (id: string, role: MarkerRole | undefined) => void;
  onAuto: () => void;
  input: HammerInputs;
  setInput: (patch: Partial<HammerInputs>) => void;
  coil: SpringCoil;
  setCoil: (patch: Partial<SpringCoil>) => void;
  result: HammerResult;
  strokeMm: number;
  setStroke: (mm: number) => void;
  selected: { name: string; massG: number } | null;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  scrub: number | null;
  setScrub: (v: number | null) => void;
  speed: number;
  setSpeed: (v: number) => void;
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  setAxis: (a: 'x' | 'y' | 'z') => void;
  flip: () => void;
  clashCount: number;
  onOpenHammer: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        <span className="font-mono text-[0.72rem] font-bold text-slate-900">
          {Number.isFinite(value) ? value : 0}
          {suffix ? <span className="ml-0.5 font-sans font-normal text-slate-400">{suffix}</span> : null}
        </span>
      </span>
      <input
        type="range"
        className="w-full accent-amber-500"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function MotionPanel({
  onClose,
  parts,
  onRole,
  onAuto,
  input,
  setInput,
  coil,
  setCoil,
  result,
  strokeMm,
  setStroke,
  selected,
  playing,
  setPlaying,
  scrub,
  setScrub,
  speed,
  setSpeed,
  axis,
  sign,
  setAxis,
  flip,
  clashCount,
  onOpenHammer,
}: MotionPanelProps) {
  const tagged = parts.filter((p) => p.role).length;
  const energyTone =
    result.energyJ <= 0
      ? 'text-slate-400'
      : result.energyJ < 8
        ? 'text-amber-600'
        : result.energyJ <= 16
          ? 'text-emerald-600'
          : 'text-red-600';

  return (
    <aside className="pointer-events-auto absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[320px] max-w-[88vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <Gauge className="h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-tight text-slate-900">Prufukeyrsla</h2>
          <p className="truncate text-[0.68rem] text-slate-500">Blowback-hringur á pörtunum þínum</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Loka"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Playback */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (playing && scrub === null) {
                  setPlaying(false);
                } else {
                  setScrub(null);
                  setPlaying(true);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[0.75rem] font-bold uppercase tracking-wide text-amber-950 hover:bg-amber-400"
            >
              {playing && scrub === null ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing && scrub === null ? 'Hlé' : 'Spila'}
            </button>
            <label className="flex flex-1 items-center gap-1.5">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Hraði</span>
              <input
                type="range"
                className="w-full accent-amber-500"
                min={0.1}
                max={2}
                step={0.05}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
              <span className="w-9 text-right font-mono text-[0.7rem] text-slate-600">{speed.toFixed(2)}×</span>
            </label>
          </div>
          <label className="block">
            <span className="mb-0.5 flex items-baseline justify-between">
              <span className={LABEL}>Sleði (frysta hring)</span>
              <span className="font-mono text-[0.68rem] text-slate-500">{scrub === null ? 'spilar' : `${Math.round(scrub * 100)}%`}</span>
            </span>
            <input
              type="range"
              className="w-full accent-slate-500"
              min={0}
              max={1}
              step={0.01}
              value={scrub ?? 0}
              onChange={(event) => setScrub(Number(event.target.value))}
            />
          </label>
        </section>

        {/* Axis */}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <span className={`${LABEL} mb-1 block`}>Hreyfiás (fram að hlaupi)</span>
          <div className="flex gap-1.5">
            {(['x', 'y', 'z'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAxis(a)}
                className={`flex-1 rounded border px-2 py-1 text-[0.72rem] font-bold uppercase ${
                  axis === a ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                }`}
              >
                {a}
              </button>
            ))}
            <button
              type="button"
              onClick={flip}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[0.72rem] font-bold uppercase text-slate-600 hover:bg-slate-100"
              title="Snúa stefnunni við ef bolti fer aftur á bak"
            >
              {sign > 0 ? '+' : '−'} snúa
            </button>
          </div>
        </section>

        {/* Roles */}
        <section>
          <div className="mb-1 flex items-center justify-between">
            <span className={LABEL}>Hlutverk parta ({tagged}/{parts.length})</span>
            <button
              type="button"
              onClick={onAuto}
              className="rounded border border-slate-300 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
            >
              Ágiska
            </button>
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
            {parts.length === 0 ? (
              <p className="text-[0.68rem] text-slate-400">Engir partar á borðinu.</p>
            ) : (
              parts.map((part) => (
                <div key={part.id} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[0.72rem] text-slate-700" title={part.name}>
                    {part.name}
                  </span>
                  <select
                    className="w-[108px] shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[0.68rem] text-slate-700"
                    value={part.role ?? 'none'}
                    onChange={(event) => {
                      const v = event.target.value as MarkerRole | 'none';
                      onRole(part.id, v === 'none' ? undefined : v);
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Tunables */}
        <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <span className={`${LABEL} block`}>Stillingar</span>
          <Slider label="Slaglengd" suffix="mm" min={5} max={80} step={1} value={Math.round(strokeMm)} onChange={setStroke} />
          <Slider label="Gormalengd (frí)" suffix="mm" min={40} max={200} step={1} value={Math.round(input.freeLengthMm)} onChange={(v) => setInput({ freeLengthMm: v })} />
          <Slider label="Vírþykkt" suffix="mm" min={0.6} max={3.5} step={0.05} value={coil.wireMm} onChange={(v) => setCoil({ wireMm: v })} />
          <Slider label="Ventlagat (sæti ⌀)" suffix="mm" min={2} max={10} step={0.5} value={input.valveSealMm} onChange={(v) => setInput({ valveSealMm: v })} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`${LABEL} mb-0.5 block`}>Hamarþyngd (g)</span>
              <input type="number" className={FIELD} step={1} min={0} value={input.hammerMassG} onChange={(e) => setInput({ hammerMassG: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className={`${LABEL} mb-0.5 block`}>Þrýstingur (bar)</span>
              <input type="number" className={FIELD} step={1} min={0} value={input.pressureBar} onChange={(e) => setInput({ pressureBar: Number(e.target.value) })} />
            </label>
          </div>
          {selected ? (
            <button
              type="button"
              onClick={() => setInput({ hammerMassG: Number(selected.massG.toFixed(1)) })}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
            >
              Vigta {selected.name} ({selected.massG.toFixed(1)} g) sem hamar
            </button>
          ) : null}
        </section>

        {/* Results */}
        <section className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="flex items-baseline justify-between border-b border-slate-100 pb-1">
            <span className={LABEL}>Orka</span>
            <span className={`font-mono text-lg font-bold ${energyTone}`}>
              {fixed(result.energyJ, 1)} <span className="text-[0.7rem] font-normal text-slate-400">J</span>
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-[0.72rem]">
            <div className="flex justify-between">
              <span className="text-slate-500">Hamarhraði</span>
              <span className="font-mono font-semibold">{fixed(result.velocityMs, 2)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Dvöl (dwell)</span>
              <span className="font-mono font-semibold">≈ {fixed(result.dwellMs, 2)} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Ventill opnast</span>
              <span className={`font-mono font-semibold ${result.valveLiftMm > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {result.valveLiftMm > 0 ? 'já' : 'nei'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Árekstur</span>
              <span className={`font-mono font-semibold ${clashCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {clashCount > 0 ? `${clashCount} partar` : 'enginn'}
              </span>
            </div>
          </div>
          <button type="button" onClick={onOpenHammer} className={`${ACTION_GHOST} mt-2 w-full`}>
            Opna Hamar-reiknivél (fleiri stillingar)
          </button>
        </section>

        <p className="text-[0.62rem] leading-snug text-slate-400">
          Áætlaðar tölur — chronografaðu raunbyssuna. Markmið 12–16 J. Augnhlíf og lögleg mörk.
        </p>
      </div>
    </aside>
  );
}
