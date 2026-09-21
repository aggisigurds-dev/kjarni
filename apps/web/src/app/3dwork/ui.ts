/**
 * Shared classes for the bench.
 *
 * Brunahólf "Boss" theme (black steel · cream paper · gold metal), driven by
 * CSS variables set on `.wb-theme` in globals.css. The work area is light cream
 * paper; the top chrome opts into `.bench-chrome` to go dark gold. The bench
 * keeps its own palette rather than following the app light/dark theme so the
 * 3D viewport and drafting sheet stay consistent.
 */

export const SURFACE = 'bg-[var(--wb-ground)]';

export const PANEL = 'rounded border border-[var(--wb-panel-border)] bg-[var(--wb-panel)]';

export const LABEL =
  'text-[0.65rem] font-extrabold uppercase tracking-[0.05em] text-[var(--wb-label)]';

export const VALUE = 'font-mono text-sm text-[var(--wb-ink)]';

// No width here on purpose: grid and flex call sites stretch these themselves,
// and a baked-in w-full cannot be overridden by a later utility class.
export const ACTION =
  'rounded px-2 py-2 text-[0.7rem] font-extrabold uppercase tracking-[0.025em] ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export const ACTION_PRIMARY = `${ACTION} bg-[var(--wb-accent)] text-[var(--wb-accent-ink)] hover:brightness-110`;

export const ACTION_GHOST = `${ACTION} border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:border-[var(--wb-label)] hover:text-[var(--wb-ink)]`;

/** Compact toolbar chip — stays on one visual row and wraps instead of overlapping. */
export const TOOL_BTN =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)] disabled:cursor-not-allowed disabled:opacity-40';

export const TOOL_BTN_PRIMARY =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded border border-[var(--wb-accent)] bg-[var(--wb-accent)] px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-[var(--wb-accent-ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

export const FIELD =
  'w-full rounded border border-[var(--wb-panel-border)] bg-[var(--wb-field-bg)] px-2 py-1.5 font-mono text-sm ' +
  'text-[var(--wb-ink)] outline-none focus:border-[var(--wb-focus)]';

export const CHIP =
  'rounded px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-[0.05em]';
