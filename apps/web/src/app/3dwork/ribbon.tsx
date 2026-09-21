'use client';

/**
 * The 3D-Builder-style ribbon: tab strip (Insert · Object · Edit · View · Paint)
 * over a scrolling row of tool groups, each an icon-over-label button. Replaces
 * the old menu bar + toolbar. Data-driven — the workbench builds the tabs and
 * wires every button to its handler. Dark gold chrome, cream text, gold only on
 * the active tab and primary / toggled-on buttons (the Boss theme).
 */

import type { ElementType, ReactNode } from 'react';

export interface RibbonButton {
  icon: ElementType;
  label: string;
  onClick?: () => void;
  /** Toggled on (gold highlight). */
  on?: boolean;
  disabled?: boolean;
  /** primary = gold icon; danger = red on hover. */
  tone?: 'primary' | 'danger';
  big?: boolean;
  title?: string;
}

export interface RibbonGroup {
  cap: string;
  tools: RibbonButton[];
}

export interface RibbonTabDef {
  id: string;
  label: string;
  groups: RibbonGroup[];
}

const BTN =
  'flex shrink-0 flex-col items-center justify-start gap-0.5 rounded border border-transparent px-1.5 py-1 ' +
  'text-[0.56rem] font-medium leading-tight tracking-wide text-[var(--wb-tool-ink)] ' +
  'hover:border-[var(--wb-tool-border)] hover:bg-[var(--wb-tool-hover)] ' +
  'disabled:cursor-not-allowed disabled:opacity-35';

export function Ribbon({
  tabs,
  active,
  onActive,
  right,
}: {
  tabs: RibbonTabDef[];
  active: string;
  onActive: (id: string) => void;
  /** Right-aligned slot in the tab row (the workspace switch). */
  right?: ReactNode;
}) {
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <div className="bench-chrome flex flex-col border-t border-[var(--wb-panel-border)]">
      {/* tab strip */}
      <div className="flex items-center gap-0.5 px-2 pt-1">
        {tabs.map((tab) => {
          const isOn = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActive(tab.id)}
              className={`shrink-0 border-b-2 px-3 pb-1.5 pt-1 text-[0.72rem] font-extrabold uppercase tracking-[0.09em] transition-colors ${
                isOn
                  ? 'border-[var(--wb-accent)] text-[var(--wb-ink)]'
                  : 'border-transparent text-[var(--wb-tool-ink)] hover:text-[var(--wb-ink)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
        {right && <div className="ml-auto flex items-center pb-1">{right}</div>}
      </div>

      {/* tool groups for the active tab */}
      <div className="flex items-stretch gap-0 overflow-x-auto border-t border-[var(--wb-panel-border)] px-1 py-1">
        {current.groups.map((group, gi) => (
          <div key={`${current.id}-${gi}`} className="flex items-stretch">
            {gi > 0 && <div className="mx-1 my-1 w-px shrink-0 self-stretch bg-[var(--wb-panel-border)]" />}
            <div className="flex flex-col">
              <div className="flex items-start gap-0.5">
                {group.tools.map((btn, bi) => (
                  <button
                    key={`${group.cap}-${bi}`}
                    type="button"
                    onClick={btn.onClick}
                    disabled={btn.disabled}
                    title={btn.title ?? btn.label}
                    className={`${BTN} ${btn.big ? 'min-w-[3.4rem]' : 'min-w-[2.9rem]'} ${
                      btn.on ? 'border-[var(--wb-accent)] bg-[var(--wb-tool-hover)]' : ''
                    } ${btn.tone === 'danger' ? 'hover:!border-red-500/60' : ''}`}
                  >
                    <btn.icon
                      className={`${btn.big ? 'h-6 w-6' : 'h-5 w-5'} ${
                        btn.on
                          ? 'text-[var(--wb-accent)]'
                          : btn.tone === 'primary'
                            ? 'text-[var(--wb-accent)]'
                            : btn.tone === 'danger'
                              ? 'text-[#d98b6a]'
                              : 'text-[var(--wb-tool-ink)]'
                      }`}
                    />
                    <span className="max-w-[4.5rem] truncate whitespace-nowrap">{btn.label}</span>
                  </button>
                ))}
              </div>
              <div className="px-1 pt-0.5 text-center text-[0.5rem] font-bold uppercase tracking-wider text-[var(--wb-ink-mute)]">
                {group.cap}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
