'use client';

/**
 * Hammer and valve calculator: the main spring, the hammer it throws, the
 * valve the hammer hits. The numbers stay in localStorage, so a marker only
 * has to be typed in once, and the part selected on the bench can be weighed
 * in as the hammer.
 */

import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  DEFAULT_HAMMER,
  hammerStrike,
  springRate,
  type HammerInputs,
  type SpringCoil,
} from '@/lib/3dwork/hammer';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL } from './ui';

const STORAGE_KEY = 'kjarni3d_hammer';

interface HammerDialogProps {
  open: boolean;
  onClose: () => void;
  /** The part selected on the bench, weighed, to use as the hammer. */
  selected: { name: string; massG: number } | null;
}

function storedInputs(): HammerInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_HAMMER, ...(JSON.parse(raw) as Partial<HammerInputs>) };
  } catch {
    /* private mode, or a value from an older version */
  }
  return DEFAULT_HAMMER;
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={`${LABEL} mb-1 block truncate`}>
        {label}
        {suffix ? ` (${suffix})` : ''}
      </span>
      <input
        type="number"
        className={FIELD}
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1">
      <span className="text-[0.7rem] text-slate-600">{label}</span>
      <span className="text-right font-mono text-[0.75rem] font-bold text-slate-900">
        {value}
        {note ? <span className="ml-1 font-sans text-[0.62rem] font-semibold text-amber-700">{note}</span> : null}
      </span>
    </div>
  );
}

const fixed = (value: number, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

export function HammerDialog({ open, onClose, selected }: HammerDialogProps) {
  const [input, setInput] = useState<HammerInputs>(DEFAULT_HAMMER);
  const [coil, setCoil] = useState<SpringCoil>({ wireMm: 1.2, meanDiameterMm: 10, activeCoils: 20 });
  const [loaded, setLoaded] = useState(false);

  // Read the stored marker once the dialog first opens, and keep it stored after that.
  useEffect(() => {
    if (open && !loaded) {
      setInput(storedInputs());
      setLoaded(true);
    }
  }, [open, loaded]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    } catch {
      /* the numbers just are not remembered */
    }
  }, [input, loaded]);

  const result = useMemo(() => hammerStrike(input), [input]);
  const coilRate = useMemo(() => springRate(coil), [coil]);
  const set = (patch: Partial<HammerInputs>) => setInput((current) => ({ ...current, ...patch }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${PANEL} flex max-h-[92dvh] w-full max-w-3xl flex-col p-4`}>
        <div className="mb-2 flex items-start gap-2">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Hammer and valve</h2>
            <p className="text-[0.7rem] text-slate-500">
              The main spring throws the hammer at the valve; the gas and the valve spring throw it
              back. First-order numbers for sizing a spring, a hammer and a valve — not a promise to
              three decimals.
            </p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <section>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={LABEL}>Hammer</span>
                {selected ? (
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                    onClick={() => set({ hammerMassG: Number(selected.massG.toFixed(2)) })}
                    title="Mass from the part's volume and material"
                  >
                    Use {selected.name} ({selected.massG.toFixed(1)} g)
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Mass" suffix="g" step={0.5} value={input.hammerMassG} onChange={(v) => set({ hammerMassG: v })} />
                <NumberField label="Drag on the hammer" suffix="N" step={0.5} value={input.dragN} onChange={(v) => set({ dragN: v })} />
              </div>
            </section>

            <section>
              <span className={`${LABEL} mb-1 block`}>Main spring</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <NumberField label="Rate" suffix="N/mm" step={0.05} value={input.springRateNmm} onChange={(v) => set({ springRateNmm: v })} />
                <NumberField label="Free length" suffix="mm" step={0.5} value={input.freeLengthMm} onChange={(v) => set({ freeLengthMm: v })} />
                <NumberField label="Length forward" suffix="mm" step={0.5} value={input.strikeLengthMm} onChange={(v) => set({ strikeLengthMm: v })} />
                <NumberField label="Length cocked" suffix="mm" step={0.5} value={input.cockedLengthMm} onChange={(v) => set({ cockedLengthMm: v })} />
              </div>
              <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">
                    Rate from the coil
                  </span>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                    onClick={() => set({ springRateNmm: Number(coilRate.toFixed(3)) })}
                    disabled={coilRate <= 0}
                  >
                    Use {fixed(coilRate, 3)} N/mm
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label="Wire" suffix="mm" step={0.05} value={coil.wireMm} onChange={(v) => setCoil((c) => ({ ...c, wireMm: v }))} />
                  <NumberField label="Mean ⌀" suffix="mm" step={0.1} value={coil.meanDiameterMm} onChange={(v) => setCoil((c) => ({ ...c, meanDiameterMm: v }))} />
                  <NumberField label="Active coils" step={0.5} value={coil.activeCoils} onChange={(v) => setCoil((c) => ({ ...c, activeCoils: v }))} />
                </div>
                <p className="mt-1 text-[0.62rem] leading-snug text-slate-500">
                  Spring steel, G = 79.3 GPa. Mean diameter is the outside diameter less one wire.
                </p>
              </div>
            </section>

            <section>
              <span className={`${LABEL} mb-1 block`}>Valve</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <NumberField label="Pressure" suffix="bar" step={1} value={input.pressureBar} onChange={(v) => set({ pressureBar: v })} />
                <NumberField label="Seal ⌀" suffix="mm" step={0.1} value={input.valveSealMm} onChange={(v) => set({ valveSealMm: v })} />
                <NumberField label="Spring preload" suffix="N" step={0.5} value={input.valvePreloadN} onChange={(v) => set({ valvePreloadN: v })} />
                <NumberField label="Lift" suffix="mm" step={0.1} value={input.valveLiftMm} onChange={(v) => set({ valveLiftMm: v })} />
              </div>
            </section>

            <section>
              <span className={`${LABEL} mb-1 block`}>Strike and blowback</span>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Contact time" suffix="ms" step={0.1} min={0.01} value={input.contactMs} onChange={(v) => set({ contactMs: v })} />
                <NumberField label="Hammer face ⌀ (0 = skip)" suffix="mm" step={0.5} value={input.hammerFaceMm} onChange={(v) => set({ hammerFaceMm: v })} />
              </div>
            </section>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <span className={`${LABEL} mb-1 block`}>Results</span>
            <Row label="Hammer travel" value={`${fixed(result.travelMm)} mm`} />
            <Row label="Sear holds (cocked)" value={`${fixed(result.cockedForceN)} N`} />
            <Row label="Spring push at the stem" value={`${fixed(result.strikeForceN)} N`} />
            <Row label="Energy into the hammer" value={`${fixed(result.energyJ, 3)} J`} />
            <Row label="Hammer speed at the valve" value={`${fixed(result.velocityMs, 2)} m/s`} />
            <Row label="Momentum" value={`${fixed(result.momentumNs * 1000)} mN·s`} />
            <Row
              label={`Impact force, average over ${fixed(input.contactMs, 2)} ms`}
              value={`${fixed(result.impactForceN, 0)} N`}
            />
            <div className="mt-2" />
            <Row label="Gas on the valve seal" value={`${fixed(result.gasForceN)} N`} />
            <Row label="Holding the valve shut" value={`${fixed(result.holdingForceN)} N`} />
            <Row
              label="Valve lift from the strike"
              value={`${fixed(result.valveLiftMm, 2)} mm`}
              note={result.bottomsOut ? `bottoms out at ${fixed(input.valveLiftMm, 1)}` : undefined}
            />
            <Row label="Valve open (dwell)" value={`≈ ${fixed(result.dwellMs, 2)} ms`} />
            {result.recocks !== null ? (
              <>
                <div className="mt-2" />
                <Row label="Gas on the hammer face" value={`${fixed(result.blowbackForceN, 0)} N`} />
                <Row
                  label="Needed to re-cock"
                  value={`${fixed(result.recockForceN, 0)} N`}
                  note={result.recocks ? 're-cocks' : 'will not re-cock'}
                />
              </>
            ) : null}
            <p className="mt-2 text-[0.62rem] leading-snug text-slate-500">
              Lift and dwell take the valve as held shut by a constant force while it opens; the
              impact force is the momentum spread over the contact time you chose.
            </p>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={() => setInput(DEFAULT_HAMMER)}
            title="Back to the example marker"
          >
            Reset
          </button>
          <button type="button" className={ACTION_PRIMARY} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
