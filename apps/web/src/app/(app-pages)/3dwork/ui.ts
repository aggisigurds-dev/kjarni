/**
 * Shared classes for the bench.
 *
 * The workbench keeps its own dark shop palette rather than following the app
 * theme: a 3D viewport needs a dark surround to read at all, and the panels
 * have to sit against it without flipping to a light card in light mode.
 */

export const PANEL = 'rounded border border-slate-700/60 bg-slate-900/70';

export const LABEL =
  'text-[0.65rem] font-extrabold uppercase tracking-[0.05em] text-slate-400';

export const VALUE = 'font-mono text-sm text-slate-100';

// No width here on purpose: grid and flex call sites stretch these themselves,
// and a baked-in w-full cannot be overridden by a later utility class.
export const ACTION =
  'rounded px-2 py-2 text-[0.7rem] font-extrabold uppercase tracking-[0.025em] ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export const ACTION_PRIMARY = `${ACTION} bg-emerald-500 text-slate-950 hover:bg-emerald-400`;

export const ACTION_GHOST = `${ACTION} border border-slate-700 bg-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200`;

export const FIELD =
  'w-full rounded border border-slate-700 bg-slate-950/80 px-2 py-1.5 font-mono text-sm ' +
  'text-slate-100 outline-none focus:border-emerald-500';

export const CHIP =
  'rounded px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-[0.05em]';
