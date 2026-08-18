/**
 * The project model: parts, the slots they can occupy, and the two ways the
 * bench arranges them — assembled into one blaster, or scattered across the
 * table so alternatives for each slot sit side by side.
 */

import type { HardwareSpec } from './hardware';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  /** Offset from the slot anchor, mm. */
  position: Vec3;
  /** Euler XYZ, degrees — degrees because that is what the panel shows. */
  rotation: Vec3;
  scale: Vec3;
}

/**
 * One saved state of a part's geometry.
 *
 * Repairing is destructive and not always right, so a fix never overwrites: it
 * adds a version and switches to it. The damaged original stays exactly as
 * imported and you can flip back to compare at any time. Geometry is stored
 * against the version id, not the part id.
 */
export interface PartVersion {
  id: string;
  label: string;
  note: string;
  triangles: number;
  createdAt: number;
}

export interface Part {
  id: string;
  name: string;
  fileName: string;
  /** Slot this part is a candidate for. Empty means loose on the table. */
  slotId: string;
  color: string;
  visible: boolean;
  transform: Transform;
  triangles: number;
  materialId: string;
  notes: string;
  versions: PartVersion[];
  activeVersionId: string;
  /** Set when the part is generated stock rather than an imported mesh. */
  hardware?: HardwareSpec;
  /**
   * Set when the part is several parts bundled into one. The members are kept
   * whole rather than merged away, so ungrouping restores exactly what went in
   * — including which slots they were fitted to.
   */
  group?: PartGroup;
  /** Data-URL preview rendered when the part was loaded. */
  thumbnail?: string;
  addedAt: number;
}

export interface PartGroup {
  members: Part[];
  /** Slots the members were fitted to, so the build survives a round trip. */
  fitted: { slotId: string; partId: string }[];
}

export function activeVersion(part: Part): PartVersion | undefined {
  return part.versions.find((version) => version.id === part.activeVersionId);
}

export function nextVersionLabel(part: Part): string {
  return `v${part.versions.length + 1}`;
}

export interface Slot {
  id: string;
  name: string;
  /** Where this slot sits on the assembled blaster, mm. */
  anchor: Vec3;
  activePartId: string | null;
}

export interface Project {
  id: string;
  name: string;
  slots: Slot[];
  parts: Part[];
  materialId: string;
  updatedAt: number;
}

export const identityTransform = (): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

/**
 * Default mount points for a Nerf-style blaster, laid out with the muzzle
 * pointing +X and up being +Y. Anchors are ordinary data — drag them or edit
 * the numbers and the assembly follows.
 */
export const DEFAULT_SLOTS: Omit<Slot, 'activePartId'>[] = [
  { id: 'body', name: 'Body / receiver', anchor: { x: 0, y: 0, z: 0 } },
  { id: 'barrel', name: 'Barrel', anchor: { x: 130, y: 0, z: 0 } },
  { id: 'muzzle', name: 'Muzzle / tip', anchor: { x: 250, y: 0, z: 0 } },
  { id: 'sight', name: 'Sight / scope', anchor: { x: 40, y: 58, z: 0 } },
  { id: 'rail', name: 'Rail accessory', anchor: { x: 140, y: 52, z: 0 } },
  { id: 'magazine', name: 'Magazine', anchor: { x: 15, y: -78, z: 0 } },
  { id: 'grip', name: 'Grip', anchor: { x: -55, y: -70, z: 0 } },
  { id: 'trigger', name: 'Trigger', anchor: { x: -25, y: -22, z: 0 } },
  { id: 'stock', name: 'Stock', anchor: { x: -150, y: -5, z: 0 } },
  { id: 'internals', name: 'Internals', anchor: { x: -40, y: 5, z: 0 } },
];

/**
 * Auto-assigned to parts as they arrive. Bright and well separated, because
 * their job is to tell one part from the next on a crowded table.
 */
export const PART_COLORS = [
  '#f97316',
  '#38bdf8',
  '#a3e635',
  '#f472b6',
  '#facc15',
  '#c084fc',
  '#2dd4bf',
  '#fb7185',
];

/**
 * Quick picks in the inspector. The neutrals are the point of the second row —
 * a build is mostly black plastic and grey steel, and telling parts apart
 * matters less than seeing what the thing will actually look like once you are
 * past sorting them.
 */
export const PART_SWATCHES = [
  ...PART_COLORS,
  '#000000',
  '#1f2937',
  '#4b5563',
  '#9ca3af',
  '#d4d4d8',
  '#f4f4f5',
];

/**
 * A blank project. Deliberately free of `Date.now()` so it can be built during
 * render without making the component non-deterministic — the real id is
 * stamped on once the client is up.
 */
export function createProject(name = 'Untitled blaster', id = 'prj_draft'): Project {
  return {
    id,
    name,
    slots: DEFAULT_SLOTS.map((slot) => ({ ...slot, activePartId: null })),
    parts: [],
    materialId: 'pla',
    updatedAt: 0,
  };
}

export function newProjectId(): string {
  return `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function partsForSlot(project: Project, slotId: string): Part[] {
  return project.parts.filter((part) => part.slotId === slotId);
}

export function activePart(project: Project, slot: Slot): Part | undefined {
  if (!slot.activePartId) return undefined;
  return project.parts.find((part) => part.id === slot.activePartId);
}

/** The parts that make up the blaster right now — one per filled slot. */
export function assembledParts(project: Project): Part[] {
  return project.slots
    .map((slot) => activePart(project, slot))
    .filter((part): part is Part => Boolean(part) && part!.visible);
}

export interface PartSize {
  width: number;
  height: number;
  depth: number;
}

export interface Placement {
  partId: string;
  position: Vec3;
  /** Alternatives that are not currently fitted are dimmed on the table. */
  dimmed: boolean;
}

export function assembledPlacement(project: Project): Placement[] {
  const placements: Placement[] = [];
  for (const slot of project.slots) {
    const part = activePart(project, slot);
    if (!part) continue;
    placements.push({
      partId: part.id,
      position: {
        x: slot.anchor.x + part.transform.position.x,
        y: slot.anchor.y + part.transform.position.y,
        z: slot.anchor.z + part.transform.position.z,
      },
      dimmed: false,
    });
  }
  return placements;
}

const GAP = 40;
const ROW_GAP = 60;

/**
 * Spread every part — fitted and spare alike — across the table in one lane per
 * slot, so swapping a part is a matter of looking along its row and clicking.
 */
export function scatterPlacement(project: Project, sizes: Map<string, PartSize>): Placement[] {
  const lanes: { slotId: string; parts: Part[] }[] = project.slots
    .map((slot) => ({ slotId: slot.id, parts: partsForSlot(project, slot.id) }))
    .filter((lane) => lane.parts.length > 0);

  const loose = project.parts.filter(
    (part) => !project.slots.some((slot) => slot.id === part.slotId)
  );
  if (loose.length > 0) lanes.push({ slotId: '', parts: loose });

  const fallback: PartSize = { width: 60, height: 60, depth: 60 };
  const placements: Placement[] = [];

  // Centre the whole spread on the origin so the camera framing stays put.
  const laneDepths = lanes.map((lane) =>
    lane.parts.reduce((deepest, part) => Math.max(deepest, (sizes.get(part.id) ?? fallback).depth), 0)
  );
  const totalDepth =
    laneDepths.reduce((sum, depth) => sum + depth, 0) + ROW_GAP * Math.max(0, lanes.length - 1);

  let z = -totalDepth / 2;
  lanes.forEach((lane, laneIndex) => {
    const laneDepth = laneDepths[laneIndex];
    const widths = lane.parts.map((part) => (sizes.get(part.id) ?? fallback).width);
    const laneWidth = widths.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, lane.parts.length - 1);

    let x = -laneWidth / 2;
    lane.parts.forEach((part, index) => {
      const slot = project.slots.find((s) => s.id === lane.slotId);
      placements.push({
        partId: part.id,
        position: { x: x + widths[index] / 2, y: 0, z: z + laneDepth / 2 },
        dimmed: Boolean(slot) && slot!.activePartId !== part.id,
      });
      x += widths[index] + GAP;
    });

    z += laneDepth + ROW_GAP;
  });

  return placements;
}

export function nextColor(project: Project): string {
  return PART_COLORS[project.parts.length % PART_COLORS.length];
}

/** Slot ids guessed from the file name, so a folder drop lands roughly right. */
const SLOT_HINTS: { slotId: string; patterns: RegExp }[] = [
  { slotId: 'barrel', patterns: /barrel|hlaup|tube|pipe/i },
  { slotId: 'muzzle', patterns: /muzzle|tip|brake|shroud/i },
  { slotId: 'magazine', patterns: /mag(azine)?|clip|drum/i },
  { slotId: 'stock', patterns: /stock|butt|shoulder/i },
  { slotId: 'grip', patterns: /grip|handle|foregrip/i },
  { slotId: 'trigger', patterns: /trigger|sear/i },
  { slotId: 'sight', patterns: /sight|scope|optic|iron/i },
  { slotId: 'rail', patterns: /rail|picatinny|accessory|light|laser/i },
  { slotId: 'internals', patterns: /plunger|spring|internal|catch|bolt|piston/i },
  { slotId: 'body', patterns: /body|receiver|shell|frame|main/i },
];

export function guessSlot(fileName: string): string {
  for (const hint of SLOT_HINTS) {
    if (hint.patterns.test(fileName)) return hint.slotId;
  }
  return '';
}
