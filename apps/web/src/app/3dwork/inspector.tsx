'use client';

/**
 * Right-hand inspector: modify the selected part, measure it, or repair it.
 */

import { useMemo, useState } from 'react';
import { Eye, EyeOff, RotateCw, Ruler } from 'lucide-react';
import {
  MATERIALS,
  analyzeTube,
  describePart,
  massGrams,
  materialById,
  type Axis,
  type PartMeasurement,
} from '@/lib/3dwork/measure';
import type { FixReport, SimplifyReport } from '@/lib/3dwork/mesh';
import type { CylinderCut, SolidifyReport } from '@/lib/3dwork/solidify';
import { inspect } from '@/lib/3dwork/mesh';
import { PART_SWATCHES } from '@/lib/3dwork/project';
import type { Part, Project, Transform } from '@/lib/3dwork/project';
import {
  formatArea,
  formatCount,
  formatLength,
  formatMass,
  formatVolume,
  type Unit,
} from '@/lib/3dwork/format';
import { HARDWARE_LABELS, hardwareOverallLength, type HardwareSpec } from '@/lib/3dwork/hardware';
import { scaleSoup } from './bake';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL, VALUE } from './ui';

export type InspectorTab = 'modify' | 'measure' | 'repair';

interface InspectorProps {
  project: Project;
  part: Part | null;
  soup: Float32Array | null;
  unit: Unit;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onPatchPart: (partId: string, patch: Partial<Part>) => void;
  onPatchTransform: (partId: string, patch: Partial<Transform>) => void;
  onDropToTable: (partId: string) => void;
  onCenter: (partId: string) => void;
  onDuplicate: (partId: string) => void;
  onToggleVisible: (partId: string) => void;
  onAutoFix: (partId: string, options: { fillHoles: boolean; maxHoleEdges: number }) => void;
  onSimplify: (partId: string, options: { strength: number; alsoFix: boolean }) => void;
  onMakeSolid: (
    partId: string,
    options: { resolution: number; sealMm: number; bore: CylinderCut | null }
  ) => void;
  solidReport: SolidifyReport | null;
  onRevert: (partId: string) => void;
  onSelectVersion: (partId: string, versionId: string) => void;
  onDeleteVersion: (partId: string, versionId: string) => void;
  onUpdateHardware: (partId: string, spec: HardwareSpec) => void;
  canRevert: boolean;
  fixReport: FixReport | null;
  simplifyReport: SimplifyReport | null;
  busy: boolean;
  measurePoints: [number, number, number][];
  measuring: boolean;
  onToggleMeasuring: () => void;
  onClearMeasure: () => void;
  assemblyTotals: { parts: number; triangles: number; volume: number; mass: number };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{children}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className={`${LABEL} mb-1 block`}>{label}</span>
        <input
        type="number"
        className={FIELD}
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        step={step}
        inputMode="decimal"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 flex-1 px-2 py-2 text-[0.65rem] font-extrabold uppercase tracking-[0.05em] transition-colors ${
        active
          ? 'border-b-2 border-emerald-500 text-emerald-600'
          : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function ModifyTab({
  project,
  part,
  onPatchPart,
  onPatchTransform,
  onDropToTable,
  onCenter,
  onDuplicate,
  onUpdateHardware,
  measurement,
}: {
  project: Project;
  part: Part;
  onPatchPart: InspectorProps['onPatchPart'];
  onPatchTransform: InspectorProps['onPatchTransform'];
  onDropToTable: InspectorProps['onDropToTable'];
  onCenter: InspectorProps['onCenter'];
  onDuplicate: InspectorProps['onDuplicate'];
  onUpdateHardware: InspectorProps['onUpdateHardware'];
  measurement: PartMeasurement | null;
}) {
  const { transform } = part;

  const patchVec = (key: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', value: number) =>
    onPatchTransform(part.id, { [key]: { ...transform[key], [axis]: value } } as Partial<Transform>);

  const spin = (axis: 'x' | 'y' | 'z') =>
    patchVec('rotation', axis, (transform.rotation[axis] + 90) % 360);

  const mirror = (axis: 'x' | 'y' | 'z') =>
    patchVec('scale', axis, -transform.scale[axis]);

  /**
   * Rescale so the part measures `target` along one axis. `measurement` is
   * already at the current scale, so the ratio multiplies the existing scale
   * on every axis and the part keeps its proportions.
   */
  const scaleToLength = (axis: 0 | 1 | 2, target: number) => {
    if (!measurement || target <= 0) return;
    const current = measurement.bounds.size[axis];
    if (current <= 0) return;

    const ratio = target / current;
    onPatchTransform(part.id, {
      scale: {
        x: transform.scale.x * ratio,
        y: transform.scale.y * ratio,
        z: transform.scale.z * ratio,
      },
    });
  };

  return (
    <div className="space-y-4">
      {part.hardware && (
        <div className={`${PANEL} space-y-2 px-3 py-2`}>
          <span className={`${LABEL} block`}>
            {HARDWARE_LABELS[part.hardware.kind]} — generated stock
          </span>

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Length mm"
              value={part.hardware.length}
              onChange={(value) =>
                onUpdateHardware(part.id, { ...part.hardware!, length: Math.max(1, value) })
              }
            />
            <NumberField
              label={part.hardware.kind === 'pipe' ? 'Outside Ø mm' : 'Ø mm'}
              value={part.hardware.diameter}
              onChange={(value) =>
                onUpdateHardware(part.id, { ...part.hardware!, diameter: Math.max(0.5, value) })
              }
            />
            {part.hardware.kind === 'pipe' && (
              <NumberField
                label="Wall mm"
                step={0.1}
                value={part.hardware.wall ?? 1}
                onChange={(value) =>
                  onUpdateHardware(part.id, { ...part.hardware!, wall: Math.max(0.05, value) })
                }
              />
            )}
            {(part.hardware.kind === 'bolt' || part.hardware.kind === 'screw') && (
              <>
                <NumberField
                  label="Thread pitch"
                  step={0.05}
                  value={part.hardware.threadPitch ?? 1.5}
                  onChange={(value) =>
                    onUpdateHardware(part.id, { ...part.hardware!, threadPitch: value })
                  }
                />
                <NumberField
                  label="Head Ø mm"
                  value={part.hardware.headDiameter ?? part.hardware.diameter * 1.5}
                  onChange={(value) =>
                    onUpdateHardware(part.id, { ...part.hardware!, headDiameter: value })
                  }
                />
                <NumberField
                  label="Head height"
                  value={part.hardware.headHeight ?? part.hardware.diameter * 0.6}
                  onChange={(value) =>
                    onUpdateHardware(part.id, { ...part.hardware!, headHeight: value })
                  }
                />
              </>
            )}
          </div>

          <Row label="Overall length">{formatLength(hardwareOverallLength(part.hardware))}</Row>
          <p className="text-[0.65rem] text-slate-500">
            Change a number and the mesh is rebuilt in place. The measurements below follow.
          </p>
        </div>
      )}

      <label className="block">
        <span className={`${LABEL} mb-1 block`}>Name</span>
        <input
          className={FIELD}
          value={part.name}
          onChange={(event) => onPatchPart(part.id, { name: event.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={`${LABEL} mb-1 block`}>Slot</span>
          <select
            className={FIELD}
            value={part.slotId}
            onChange={(event) => onPatchPart(part.id, { slotId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {project.slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={`${LABEL} mb-1 block`}>Material</span>
          <select
            className={FIELD}
            value={part.materialId}
            onChange={(event) => onPatchPart(part.id, { materialId: event.target.value })}
          >
            {MATERIALS.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <span className={LABEL}>Colour</span>
          <input
            type="color"
            value={part.color}
            onChange={(event) => onPatchPart(part.id, { color: event.target.value })}
            className="h-7 w-14 cursor-pointer rounded border border-slate-300 bg-slate-200"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {PART_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              title={swatch}
              aria-label={`Set colour to ${swatch}`}
              onClick={() => onPatchPart(part.id, { color: swatch })}
              className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${
                part.color.toLowerCase() === swatch.toLowerCase()
                  ? 'border-slate-900 ring-1 ring-slate-900'
                  : 'border-slate-300'
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <div>
        <span className={`${LABEL} mb-1 block`}>Offset from mount point (mm)</span>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <NumberField
              key={axis}
              label={axis.toUpperCase()}
              value={transform.position[axis]}
              onChange={(value) => patchVec('position', axis, value)}
              step={0.1}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className={LABEL}>Rotation (deg)</span>
          <div className="flex gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                onClick={() => spin(axis)}
                className="flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                title={`Rotate 90° about ${axis.toUpperCase()}`}
              >
                <RotateCw className="h-2.5 w-2.5" />
                {axis}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <NumberField
              key={axis}
              label={axis.toUpperCase()}
              value={transform.rotation[axis]}
              onChange={(value) => patchVec('rotation', axis, value)}
              step={1}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className={LABEL}>Scale</span>
          <div className="flex gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                onClick={() => mirror(axis)}
                className="rounded border border-slate-300 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                title={`Mirror along ${axis.toUpperCase()}`}
              >
                ⇄ {axis}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <NumberField
              key={axis}
              label={axis.toUpperCase()}
              value={transform.scale[axis]}
              onChange={(value) => patchVec('scale', axis, value || 1)}
              step={0.05}
            />
          ))}
        </div>
      </div>

      {measurement && (
        <div>
          <span className={`${LABEL} mb-1 block`}>Resize to a measurement (mm)</span>
          <div className="grid grid-cols-3 gap-2">
            {(['X', 'Y', 'Z'] as const).map((axis, index) => (
              <NumberField
                key={axis}
                label={axis}
                value={measurement.bounds.size[index]}
                onChange={(value) => scaleToLength(index as 0 | 1 | 2, value)}
              />
            ))}
          </div>
          <p className="mt-1 text-[0.65rem] text-slate-500">
            Scales all three axes together so the part keeps its proportions.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={ACTION_GHOST} onClick={() => onCenter(part.id)}>
          Centre on mount
        </button>
        <button type="button" className={ACTION_GHOST} onClick={() => onDropToTable(part.id)}>
          Drop to table
        </button>
        <button type="button" className={ACTION_GHOST} onClick={() => onDuplicate(part.id)}>
          Duplicate as variant
        </button>
        <button
          type="button"
          className={ACTION_GHOST}
          onClick={() =>
            onPatchTransform(part.id, {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            })
          }
        >
          Reset transform
        </button>
      </div>
    </div>
  );
}

function MeasureTab({
  part,
  soup,
  unit,
  measurement,
  measuring,
  measurePoints,
  onToggleMeasuring,
  onClearMeasure,
  assemblyTotals,
}: {
  part: Part;
  soup: Float32Array;
  unit: Unit;
  measurement: PartMeasurement;
  measuring: boolean;
  measurePoints: [number, number, number][];
  onToggleMeasuring: () => void;
  onClearMeasure: () => void;
  assemblyTotals: InspectorProps['assemblyTotals'];
}) {
  const [axis, setAxis] = useState<Axis | 'auto'>('auto');
  const tube = useMemo(
    () => analyzeTube(soup, axis === 'auto' ? undefined : axis),
    [soup, axis]
  );

  const density = materialById(part.materialId).density;
  const mass = massGrams(measurement.volume, density);

  const rulerLength = useMemo(() => {
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      const a = measurePoints[i - 1];
      const b = measurePoints[i];
      total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    return total;
  }, [measurePoints]);

  return (
    <div className="space-y-4">
      <div className={`${PANEL} px-3 py-2`}>
        <span className={`${LABEL} mb-1 block`}>Bounding box</span>
        <Row label="Width (X)">{formatLength(measurement.bounds.size[0], unit)}</Row>
        <Row label="Height (Y)">{formatLength(measurement.bounds.size[1], unit)}</Row>
        <Row label="Depth (Z)">{formatLength(measurement.bounds.size[2], unit)}</Row>
        <Row label="Diagonal">{formatLength(measurement.bounds.diagonal, unit)}</Row>
      </div>

      <div className={`${PANEL} px-3 py-2`}>
        <span className={`${LABEL} mb-1 block`}>Solid</span>
        <Row label="Volume">{formatVolume(measurement.volume)}</Row>
        <Row label="Surface">{formatArea(measurement.area)}</Row>
        <Row label={`Mass · ${materialById(part.materialId).name}`}>{formatMass(mass)}</Row>
        <Row label="Triangles">{formatCount(measurement.triangles)}</Row>
        <Row label="Watertight">
          <span className={measurement.watertight ? 'text-emerald-600' : 'text-amber-600'}>
            {measurement.watertight ? 'yes' : 'no — volume is an estimate'}
          </span>
        </Row>
      </div>

      <div className={`${PANEL} px-3 py-2`}>
        <div className="mb-1 flex items-center justify-between">
          <span className={LABEL}>Pipe / tube</span>
          <select
            className="rounded border border-slate-300 bg-slate-200 px-1 py-0.5 text-[0.6rem] text-slate-700"
            value={axis}
            onChange={(event) => setAxis(event.target.value as Axis | 'auto')}
            aria-label="Measurement axis"
          >
            <option value="auto">auto axis</option>
            <option value="x">along X</option>
            <option value="y">along Y</option>
            <option value="z">along Z</option>
          </select>
        </div>
        <Row label="Axis">{tube.axis.toUpperCase()}</Row>
        <Row label="Length">{formatLength(tube.length, unit)}</Row>
        <Row label="Outside Ø">{formatLength(tube.outerDiameter, unit)}</Row>
        {tube.hollow ? (
          <>
            <Row label="Inside Ø">{formatLength(tube.innerDiameter, unit)}</Row>
            <Row label="Wall">{formatLength(tube.wallThickness, unit)}</Row>
          </>
        ) : (
          <Row label="Bore">
            <span className="text-slate-500">solid — no bore found</span>
          </Row>
        )}
        <Row label="Roundness">{`${Math.round(tube.roundness * 100)}%`}</Row>
        <p className="mt-1 text-[0.65rem] text-slate-500">
          Measured off the mesh surface. Low roundness means the section is not a circle, so read
          the diameters as the enclosing size rather than a pipe spec.
        </p>
      </div>

      <div className={`${PANEL} px-3 py-2`}>
        <div className="mb-1 flex items-center justify-between">
          <span className={LABEL}>Ruler</span>
          <button
            type="button"
            onClick={onToggleMeasuring}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[0.6rem] font-extrabold uppercase ${
              measuring ? 'bg-amber-500 text-white' : 'border border-slate-300 text-slate-500'
            }`}
          >
            <Ruler className="h-3 w-3" />
            {measuring ? 'picking' : 'pick points'}
          </button>
        </div>
        {measurePoints.length === 0 ? (
          <p className="text-[0.7rem] text-slate-500">
            Turn on picking, then click points on any part to measure across them.
          </p>
        ) : (
          <>
            <Row label={`Points (${measurePoints.length})`}>{formatLength(rulerLength, unit)}</Row>
            {measurePoints.length >= 2 && (
              <Row label="Straight line">
                {formatLength(
                  Math.hypot(
                    measurePoints[0][0] - measurePoints[measurePoints.length - 1][0],
                    measurePoints[0][1] - measurePoints[measurePoints.length - 1][1],
                    measurePoints[0][2] - measurePoints[measurePoints.length - 1][2]
                  ),
                  unit
                )}
              </Row>
            )}
            <button type="button" className={`${ACTION_GHOST} mt-2 w-full`} onClick={onClearMeasure}>
              Clear points
            </button>
          </>
        )}
      </div>

      <div className={`${PANEL} px-3 py-2`}>
        <span className={`${LABEL} mb-1 block`}>Whole assembly</span>
        <Row label="Fitted parts">{formatCount(assemblyTotals.parts)}</Row>
        <Row label="Triangles">{formatCount(assemblyTotals.triangles)}</Row>
        <Row label="Volume">{formatVolume(assemblyTotals.volume)}</Row>
        <Row label="Mass">{formatMass(assemblyTotals.mass)}</Row>
      </div>
    </div>
  );
}

/** Cluster cell as a fraction of the part's diagonal, coarsest first. */
const DETAIL_LEVELS: { id: string; label: string; strength: number; note: string }[] = [
  { id: 'light', label: 'Light', strength: 0.002, note: 'Barely visible. Trims dense curves.' },
  { id: 'medium', label: 'Medium', strength: 0.004, note: 'Keeps shape and holes. Good default.' },
  { id: 'strong', label: 'Strong', strength: 0.01, note: 'Softens small detail and lettering.' },
  { id: 'brutal', label: 'Brutal', strength: 0.02, note: 'Blocky. For mock-ups and test fits.' },
];

function RepairTab({
  soup,
  part,
  onAutoFix,
  onSimplify,
  onMakeSolid,
  solidReport,
  onRevert,
  onSelectVersion,
  onDeleteVersion,
  canRevert,
  fixReport,
  simplifyReport,
  busy,
}: {
  soup: Float32Array;
  part: Part;
  onAutoFix: InspectorProps['onAutoFix'];
  onSimplify: InspectorProps['onSimplify'];
  onMakeSolid: InspectorProps['onMakeSolid'];
  solidReport: SolidifyReport | null;
  onRevert: InspectorProps['onRevert'];
  onSelectVersion: InspectorProps['onSelectVersion'];
  onDeleteVersion: InspectorProps['onDeleteVersion'];
  canRevert: boolean;
  fixReport: FixReport | null;
  simplifyReport: SimplifyReport | null;
  busy: boolean;
}) {
  const [fillHoles, setFillHoles] = useState(true);
  const [maxHoleEdges, setMaxHoleEdges] = useState(200);
  const [detail, setDetail] = useState('medium');
  const [resolution, setResolution] = useState(200);
  const [sealMm, setSealMm] = useState(0.8);
  const [bore, setBore] = useState(false);
  const [boreDiameter, setBoreDiameter] = useState(28);
  const [boreAxis, setBoreAxis] = useState<'x' | 'y' | 'z'>('z');
  const topology = useMemo(() => inspect(soup), [soup]);
  const level = DETAIL_LEVELS.find((entry) => entry.id === detail) ?? DETAIL_LEVELS[1];

  const problems = [
    topology.boundaryEdges > 0 && `${formatCount(topology.holes)} hole(s)`,
    topology.nonManifoldEdges > 0 && `${formatCount(topology.nonManifoldEdges)} non-manifold edges`,
    topology.inconsistentEdges > 0 && `${formatCount(topology.inconsistentEdges)} flipped faces`,
    topology.signedVolume < 0 && 'solid is inside-out',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className={`${PANEL} px-3 py-2`}>
        <span className={`${LABEL} mb-1 block`}>Health</span>
        <Row label="Status">
          <span className={topology.watertight ? 'text-emerald-600' : 'text-amber-600'}>
            {topology.watertight ? 'print ready' : 'needs repair'}
          </span>
        </Row>
        <Row label="Triangles">{formatCount(topology.triangles)}</Row>
        <Row label="Vertices">{formatCount(topology.vertices)}</Row>
        <Row label="Open edges">{formatCount(topology.boundaryEdges)}</Row>
        <Row label="Holes">{formatCount(topology.holes)}</Row>
        <Row label="Non-manifold">{formatCount(topology.nonManifoldEdges)}</Row>
        <Row label="Flipped faces">{formatCount(topology.inconsistentEdges)}</Row>

        {problems.length > 0 && (
          <p className="mt-2 text-[0.7rem] text-amber-600/90">Found: {problems.join(', ')}.</p>
        )}
      </div>

      <div className={`${PANEL} space-y-2 px-3 py-2`}>
        <span className={`${LABEL} block`}>Auto fix</span>
        <label className="flex items-center gap-2 text-[0.7rem] text-slate-700">
          <input
            type="checkbox"
            checked={fillHoles}
            onChange={(event) => setFillHoles(event.target.checked)}
            className="accent-emerald-500"
          />
          Fill holes
        </label>
        {fillHoles && (
          <NumberField
            label="Largest hole to fill (edges)"
            value={maxHoleEdges}
            onChange={setMaxHoleEdges}
            step={20}
          />
        )}
        <p className="text-[0.65rem] text-slate-500">
          Welds split vertices, drops zero-area and duplicate faces, makes every face wind the same
          way, then patches rims up to that size. Bigger openings are left alone and reported —
          a flat patch across a large gap would invent geometry.
        </p>
        <button
          type="button"
          className={`${ACTION_PRIMARY} w-full`}
          disabled={busy}
          onClick={() => onAutoFix(part.id, { fillHoles, maxHoleEdges })}
        >
          {busy ? 'Working…' : 'Auto fix this part'}
        </button>
      </div>

      <div className={`${PANEL} space-y-2 px-3 py-2`}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Make solid</span>
          {!topology.watertight && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-amber-700">
              suggested
            </span>
          )}
        </div>

        <p className="text-[0.65rem] text-slate-500">
          Rebuilds the part from scratch through a voxel grid instead of patching its edges.
          Missing faces, holes, doubled shells and surfaces crossing each other all stop mattering,
          because none of the original triangles survive. Detail finer than one voxel is lost.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={`${LABEL} mb-1 block`}>Detail (voxels)</span>
            <select
              className={FIELD}
              value={resolution}
              onChange={(event) => setResolution(Number(event.target.value))}
            >
              <option value={96}>96 · fastest</option>
              <option value={144}>144 · quick</option>
              <option value={200}>200 · balanced</option>
              <option value={260}>260 · fine</option>
            </select>
          </label>
          <NumberField label="Seal gaps up to (mm)" value={sealMm} step={0.2} onChange={setSealMm} />
        </div>

        <Row label="Voxel size">
          {formatLength(Math.max(...topology.bounds.size) / resolution)}
        </Row>

        <label className="flex items-center gap-2 text-[0.7rem] text-slate-700">
          <input
            type="checkbox"
            checked={bore}
            onChange={(event) => setBore(event.target.checked)}
            className="accent-emerald-600"
          />
          Bore a hole through it
        </label>

        {bore && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Bore ⌀ (mm)" value={boreDiameter} onChange={setBoreDiameter} />
            <label className="block">
              <span className={`${LABEL} mb-1 block`}>Along axis</span>
              <select
                className={FIELD}
                value={boreAxis}
                onChange={(event) => setBoreAxis(event.target.value as 'x' | 'y' | 'z')}
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </label>
          </div>
        )}

        <button
          type="button"
          className={`${ACTION_PRIMARY} w-full`}
          disabled={busy}
          onClick={() => {
            const centreOf = (axis: 'x' | 'y' | 'z'): [number, number] => {
              const index = { x: 0, y: 1, z: 2 }[axis];
              const others = [0, 1, 2].filter((i) => i !== index);
              return [topology.bounds.center[others[0]], topology.bounds.center[others[1]]];
            };
            onMakeSolid(part.id, {
              resolution,
              sealMm,
              bore: bore
                ? { axis: boreAxis, diameter: boreDiameter, center: centreOf(boreAxis) }
                : null,
            });
          }}
        >
          {busy ? 'Working…' : bore ? 'Make solid + bore' : 'Make solid'}
        </button>
      </div>

      {solidReport && (
        <div className={`${PANEL} px-3 py-2`}>
          <span className={`${LABEL} mb-1 block`}>Last rebuild</span>
          <Row label="Voxel size">{formatLength(solidReport.voxelSize)}</Row>
          <Row label="Grid">{solidReport.grid.join(' × ')}</Row>
          <Row label="Triangles">
            {formatCount(solidReport.trianglesBefore)} →{' '}
            <span className="text-emerald-600">{formatCount(solidReport.trianglesAfter)}</span>
          </Row>
          <Row label="Open edges">
            <span
              className={
                solidReport.after.boundaryEdges === 0 ? 'text-emerald-600' : 'text-amber-600'
              }
            >
              {formatCount(solidReport.after.boundaryEdges)}
            </span>
          </Row>
          <Row label="Flipped faces">{formatCount(solidReport.after.inconsistentEdges)}</Row>
          <Row label="Non-manifold">{formatCount(solidReport.after.nonManifoldEdges)}</Row>
          {solidReport.cutVoxels > 0 && (
            <Row label="Bored away">{formatVolume(solidReport.cutVoxels * solidReport.voxelSize ** 3)}</Row>
          )}
        </div>
      )}

      <div className={`${PANEL} space-y-2 px-3 py-2`}>
        <span className={`${LABEL} block`}>Simplify for printing</span>

        <div className="grid grid-cols-4 gap-1">
          {DETAIL_LEVELS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setDetail(entry.id)}
              className={`rounded border px-1 py-1.5 text-[0.6rem] font-bold uppercase transition-colors ${
                detail === entry.id
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                  : 'border-slate-300 text-slate-500 hover:border-slate-400'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <p className="text-[0.65rem] text-slate-500">{level.note}</p>
        <Row label="Cell size">
          {formatLength(topology.bounds.diagonal * level.strength)}
        </Row>

        <p className="text-[0.65rem] text-slate-500">
          Snaps vertices onto a grid and drops the triangles that collapse. It ignores topology
          entirely, which is why it works on meshes an edge-collapse decimator refuses — but detail
          finer than the cell disappears, and two walls closer than the cell merge into one. Keep
          the cell under your thinnest wall.
        </p>

        <button
          type="button"
          className={`${ACTION_PRIMARY} w-full`}
          disabled={busy}
          onClick={() => onSimplify(part.id, { strength: level.strength, alsoFix: true })}
        >
          {busy ? 'Working…' : 'Simplify + fix'}
        </button>
        <button
          type="button"
          className={`${ACTION_GHOST} w-full`}
          disabled={busy}
          onClick={() => onSimplify(part.id, { strength: level.strength, alsoFix: false })}
        >
          Simplify only
        </button>
        {canRevert && (
          <button
            type="button"
            className={`${ACTION_GHOST} w-full`}
            disabled={busy}
            onClick={() => onRevert(part.id)}
          >
            Revert to imported
          </button>
        )}
      </div>

      <div className={`${PANEL} px-3 py-2`}>
        <div className="mb-1 flex items-center justify-between">
          <span className={LABEL}>Versions</span>
          <span className="font-mono text-[0.6rem] text-slate-500">{part.versions.length}</span>
        </div>
        <p className="mb-2 text-[0.65rem] text-slate-500">
          Every repair saves a new version and keeps the old one. Switch back any time to compare.
        </p>
        <div className="space-y-1">
          {part.versions.map((version) => {
            const active = version.id === part.activeVersionId;
            return (
              <div
                key={version.id}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                  active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectVersion(part.id, version.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div
                    className={`truncate text-[0.68rem] font-bold ${
                      active ? 'text-emerald-600' : 'text-slate-700'
                    }`}
                  >
                    {version.label}
                  </div>
                  <div className="truncate font-mono text-[0.6rem] text-slate-500">
                    {formatCount(version.triangles)} tri · {version.note}
                  </div>
                </button>
                {part.versions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteVersion(part.id, version.id)}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label={`Delete ${version.label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {simplifyReport && (
        <div className={`${PANEL} px-3 py-2`}>
          <span className={`${LABEL} mb-1 block`}>Last simplify</span>
          <Row label="Triangles">
            {formatCount(simplifyReport.trianglesBefore)} →{' '}
            <span className="text-emerald-600">{formatCount(simplifyReport.trianglesAfter)}</span>
          </Row>
          <Row label="Reduction">
            <span className="text-emerald-600">
              {Math.round(simplifyReport.reduction * 100)}%
            </span>
          </Row>
          <Row label="Cell used">{formatLength(simplifyReport.cellSize)}</Row>
          <Row label="Non-manifold">{formatCount(simplifyReport.after.nonManifoldEdges)}</Row>
          <Row label="Size kept">
            {simplifyReport.after.bounds.size.map((n) => n.toFixed(1)).join(' × ')} mm
          </Row>
        </div>
      )}

      {fixReport && (
        <div className={`${PANEL} px-3 py-2`}>
          <span className={`${LABEL} mb-1 block`}>Last repair</span>
          <Row label="Welded vertices">{formatCount(fixReport.weldedVertices)}</Row>
          <Row label="Removed degenerate">{formatCount(fixReport.removedDegenerate)}</Row>
          <Row label="Removed duplicates">{formatCount(fixReport.removedDuplicateTriangles)}</Row>
          <Row label="Re-wound faces">{formatCount(fixReport.flippedTriangles)}</Row>
          <Row label="Filled holes">{formatCount(fixReport.filledHoles)}</Row>
          {fixReport.unfilledHoles > 0 && (
            <Row label="Left open">
              <span className="text-amber-600">{formatCount(fixReport.unfilledHoles)}</span>
            </Row>
          )}
          {fixReport.invertedSolid && (
            <Row label="Turned outside-in">
              <span className="text-emerald-600">yes</span>
            </Row>
          )}
          <Row label="Now">
            <span className={fixReport.after.watertight ? 'text-emerald-600' : 'text-amber-600'}>
              {fixReport.after.watertight ? 'watertight' : 'still open'}
            </span>
          </Row>
        </div>
      )}
    </div>
  );
}

export function Inspector(props: InspectorProps) {
  const { part, soup, tab, onTabChange } = props;

  // Measure the part at the size it is set to, not the size it was modelled at.
  // Repair still works on the raw soup, since scaling is a display concern.
  const scaledSoup = useMemo(
    () =>
      soup && part
        ? scaleSoup(soup, part.transform.scale.x, part.transform.scale.y, part.transform.scale.z)
        : null,
    [soup, part]
  );
  const measurement = useMemo(
    () => (scaledSoup ? describePart(scaledSoup) : null),
    [scaledSoup]
  );

  return (
    <div className={`${PANEL} flex h-full flex-col overflow-hidden`}>
      <div className="flex border-b border-slate-300">
        <TabButton active={tab === 'modify'} onClick={() => onTabChange('modify')}>
          Modify
        </TabButton>
        <TabButton active={tab === 'measure'} onClick={() => onTabChange('measure')}>
          Measure
        </TabButton>
        <TabButton active={tab === 'repair'} onClick={() => onTabChange('repair')}>
          Repair
        </TabButton>
      </div>

      {part && (
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <button
            type="button"
            className={`${ACTION_GHOST} flex min-h-11 flex-1 items-center justify-center gap-2`}
            onClick={() => props.onToggleVisible(part.id)}
          >
            {part.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {part.visible ? 'Hide from table' : 'Show on table'}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!part || !soup ? (
          <p className="pt-6 text-center text-[0.75rem] text-slate-500">
            Select a part on the table or in the gallery.
          </p>
        ) : tab === 'modify' ? (
          <ModifyTab
            project={props.project}
            part={part}
            onPatchPart={props.onPatchPart}
            onPatchTransform={props.onPatchTransform}
            onDropToTable={props.onDropToTable}
            onCenter={props.onCenter}
            onDuplicate={props.onDuplicate}
            onUpdateHardware={props.onUpdateHardware}
            measurement={measurement}
          />
        ) : tab === 'measure' && measurement && scaledSoup ? (
          <MeasureTab
            part={part}
            soup={scaledSoup}
            unit={props.unit}
            measurement={measurement}
            measuring={props.measuring}
            measurePoints={props.measurePoints}
            onToggleMeasuring={props.onToggleMeasuring}
            onClearMeasure={props.onClearMeasure}
            assemblyTotals={props.assemblyTotals}
          />
        ) : (
          <RepairTab
            soup={soup}
            part={part}
            onAutoFix={props.onAutoFix}
            onSimplify={props.onSimplify}
            onMakeSolid={props.onMakeSolid}
            solidReport={props.solidReport}
            onRevert={props.onRevert}
            onSelectVersion={props.onSelectVersion}
            onDeleteVersion={props.onDeleteVersion}
            canRevert={props.canRevert}
            fixReport={props.fixReport}
            simplifyReport={props.simplifyReport}
            busy={props.busy}
          />
        )}
      </div>
    </div>
  );
}
