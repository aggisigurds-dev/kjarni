"use client";

import { Eye, EyeOff } from "lucide-react";
import { isCleanWall, isSourcePlan } from "../../lib/board/simplify-plan";
import { useBoardStore } from "../../lib/board/store";

/** Two-layer toggle: original scan vs traced walls. */
export function PlanLayerToggle() {
  const objects = useBoardStore((s) => s.objects);
  const plans = objects.filter(isSourcePlan);
  const walls = objects.filter(isCleanWall);
  if (!plans.length || !walls.length) return null;

  const teikningHidden = plans.every((o) => o.hidden);
  const veggirHidden = walls.every((o) => o.hidden);

  const toggle = (kind: "teikning" | "veggir") => {
    const ids =
      kind === "teikning" ? plans.map((o) => o.id) : walls.map((o) => o.id);
    const hide = kind === "teikning" ? !teikningHidden : !veggirHidden;
    useBoardStore.getState().updateObjects(ids, (o) => ({ ...o, hidden: hide }));
  };

  const chip = (active: boolean) =>
    `flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] ${
      active
        ? "bg-white/15 text-white"
        : "text-stone-400 hover:bg-white/8 hover:text-stone-200"
    }`;

  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#1a1d2e]/95 px-1 py-1 shadow-xl">
      <button
        type="button"
        className={chip(!teikningHidden)}
        title="Sýna eða fela frumteikninguna"
        onClick={() => toggle("teikning")}
      >
        {teikningHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        Teikning
      </button>
      <button
        type="button"
        className={chip(!veggirHidden)}
        title="Sýna eða fela hreina veggi"
        onClick={() => toggle("veggir")}
      >
        {veggirHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        Veggir
      </button>
    </div>
  );
}
