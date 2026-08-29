/**
 * Shared classes for the bench.
 *
 * A light workshop palette: pale grey ground, white panels, dark text. The
 * workbench keeps its own palette rather than following the app theme so the
 * 3D viewport and the drafting sheet stay consistent in both light and dark
 * mode — a viewport that flips its background mid-session is disorienting.
 */

export const SURFACE = 'bg-slate-200';

export const PANEL = 'rounded border border-slate-300 bg-white/85';

export const LABEL =
  'text-[0.65rem] font-extrabold uppercase tracking-[0.05em] text-slate-500';

export const VALUE = 'font-mono text-sm text-slate-900';

// No width here on purpose: grid and flex call sites stretch these themselves,
// and a baked-in w-full cannot be overridden by a later utility class.
export const ACTION =
  'rounded px-2 py-2 text-[0.7rem] font-extrabold uppercase tracking-[0.025em] ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export const ACTION_PRIMARY = `${ACTION} bg-emerald-600 text-white hover:bg-emerald-500`;

export const ACTION_GHOST = `${ACTION} border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900`;

/** Compact toolbar chip — stays on one visual row and wraps instead of overlapping. */
export const TOOL_BTN =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300';

export const TOOL_BTN_PRIMARY =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded border border-emerald-600 bg-emerald-600 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40';

export const FIELD =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm ' +
  'text-slate-900 outline-none focus:border-emerald-500';

export const CHIP =
  'rounded px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-[0.05em]';
