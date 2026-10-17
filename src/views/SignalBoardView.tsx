import { useMemo, useState } from "react";
import { useAppState } from "../lib/AppContext";
import { CATEGORIES, RULES } from "../lib/rules";
import { ROSTER } from "../lib/seed";
import type { Category, Severity } from "../lib/types";
import { Card, SectionTitle, SeverityBadge, Pill } from "../components/ui";
import { cn } from "../utils/cn";

export function SignalBoardView() {
  const { state, setState } = useAppState();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");

  const visibleRules = useMemo(() => {
    return RULES.filter((r) => {
      if (filter !== "all" && r.category !== filter) return false;
      if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [filter, search]);

  const toggle = (ruleId: string) => {
    setState((prev) => {
      const current = prev.signalBoard[ruleId];
      const active = !current.active;
      return {
        ...prev,
        signalBoard: {
          ...prev.signalBoard,
          [ruleId]: { ...current, active, recurrence: active ? current.recurrence + 1 : current.recurrence },
        },
      };
    });
  };

  const setSeverity = (ruleId: string, severity: Severity) => {
    setState((prev) => ({
      ...prev,
      signalBoard: { ...prev.signalBoard, [ruleId]: { ...prev.signalBoard[ruleId], severity } },
    }));
  };

  const setPerson = (ruleId: string, personId: string) => {
    setState((prev) => ({
      ...prev,
      signalBoard: { ...prev.signalBoard, [ruleId]: { ...prev.signalBoard[ruleId], personId: personId || undefined } },
    }));
  };

  const activeCount = Object.values(state.signalBoard).filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Signal Board"
        subtitle={`${RULES.length} synthetic rule IDs across ${CATEGORIES.length} categories. ${activeCount} currently active.`}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === c ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}
            >
              {c}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules..."
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
      </Card>

      <div className="grid gap-3">
        {visibleRules.map((rule) => {
          const s = state.signalBoard[rule.id];
          return (
            <Card key={rule.id} className={cn(s.active && "border-indigo-300 bg-indigo-50/40")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2">
                    <Pill>{rule.id}</Pill>
                    {rule.anchor && <Pill tone="violet">{rule.anchor}</Pill>}
                    <span className="text-xs text-slate-400">{rule.category}</span>
                  </div>
                  <div className="mt-1 font-medium text-slate-800">{rule.title}</div>
                  <p className="mt-1 text-sm text-slate-500">{rule.description}</p>
                  {s.recurrence > 1 && (
                    <p className="mt-1 text-xs text-amber-600">Recurred {s.recurrence}x this session.</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => toggle(rule.id)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium",
                      s.active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    )}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </button>
                  <select
                    value={s.severity}
                    onChange={(e) => setSeverity(rule.id, e.target.value as Severity)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                  <select
                    value={s.personId ?? ""}
                    onChange={(e) => setPerson(rule.id, e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="">No person linked</option>
                    {ROSTER.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <SeverityBadge severity={s.severity} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
