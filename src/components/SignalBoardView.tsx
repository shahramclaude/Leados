import { CATEGORIES, CATEGORY_LABEL, type Category } from "../lib/types";
import { RULES } from "../lib/rules";
import type { SignalState } from "../lib/store";
import { Card, Badge } from "./Shell";
import { cn } from "../utils/cn";

const SEV_TONE: Record<number, "slate" | "amber" | "rose" | "emerald" | "indigo"> = {
  1: "slate",
  2: "indigo",
  3: "amber",
  4: "amber",
  5: "rose",
};

export function SignalBoardView({
  state,
  onChange,
  onReset,
  onClear,
}: {
  state: SignalState;
  onChange: (s: SignalState) => void;
  onReset: () => void;
  onClear: () => void;
}) {
  const activeCount = Object.values(state.active).filter(Boolean).length;

  const toggle = (rule: string) => {
    onChange({ ...state, active: { ...state.active, [rule]: !state.active[rule] } });
  };
  const setSev = (rule: string, sev: 1 | 2 | 3 | 4 | 5) => {
    onChange({ ...state, sev: { ...state.sev, [rule]: sev } });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Signal Board</h1>
          <p className="text-sm text-slate-400">
            {activeCount} of {RULES.length} synthetic rules active. Toggle findings on/off and
            adjust severity — the Attention Optimizer reads this live.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onReset} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
            Load busy-week preset
          </button>
          <button onClick={onClear} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800">
            Clear all
          </button>
        </div>
      </div>

      <Card title="Runway" subtitle="Drives urgency pull-forward for finance findings below 6 months (disclosed heuristic).">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={24}
            value={state.runwayMonths}
            onChange={(e) => onChange({ ...state, runwayMonths: Number(e.target.value) })}
            className="w-64 accent-indigo-500"
          />
          <span className="text-sm font-medium text-slate-200">{state.runwayMonths} months</span>
          {state.runwayMonths < 6 && <Badge tone="rose">Urgent: runway &lt; 6mo</Badge>}
        </div>
      </Card>

      {CATEGORIES.map((cat) => (
        <CategoryBlock key={cat} category={cat} state={state} onToggle={toggle} onSev={setSev} />
      ))}
    </div>
  );
}

function CategoryBlock({
  category,
  state,
  onToggle,
  onSev,
}: {
  category: Category;
  state: SignalState;
  onToggle: (rule: string) => void;
  onSev: (rule: string, sev: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const rules = RULES.filter((r) => r.category === category);
  return (
    <Card title={CATEGORY_LABEL[category]} subtitle={`${rules.filter((r) => state.active[r.rule]).length} active`}>
      <div className="grid gap-2 sm:grid-cols-2">
        {rules.map((r) => {
          const on = !!state.active[r.rule];
          const sev = state.sev[r.rule] ?? r.baseSev;
          return (
            <div
              key={r.rule}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border px-3 py-2 transition",
                on ? "border-indigo-500/40 bg-indigo-500/5" : "border-slate-800 bg-slate-900/40"
              )}
            >
              <button onClick={() => onToggle(r.rule)} className="flex flex-1 items-start gap-2 text-left">
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 flex-shrink-0 rounded border",
                    on ? "border-indigo-400 bg-indigo-500" : "border-slate-600 bg-transparent"
                  )}
                />
                <span>
                  <span className="block text-xs font-medium text-slate-200">
                    {r.rule} · {r.title}
                  </span>
                  {state.person[r.rule] && <span className="text-[11px] text-slate-500">linked: {state.person[r.rule]}</span>}
                </span>
              </button>
              <div className="flex items-center gap-1">
                <Badge tone={SEV_TONE[sev]}>sev {sev}</Badge>
                {on && (
                  <select
                    value={sev}
                    onChange={(e) => onSev(r.rule, Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[10px] text-slate-200"
                  >
                    {[1, 2, 3, 4, 5].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
