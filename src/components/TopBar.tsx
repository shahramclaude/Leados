import { navItems } from "../data/mockData";
import { useAppState } from "../context/AppStateContext";
import { cn } from "../utils/cn";
import type { ModuleId } from "../types";

export function TopBar({ active }: { active: ModuleId }) {
  const { crisisMode, attentionBudget, maxAttentionBudget } = useAppState();
  const current = navItems.find((i) => i.id === active);

  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b px-6",
        crisisMode ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{current?.icon}</span>
        <h1 className="text-base font-semibold text-slate-900">{current?.label}</h1>
        {crisisMode && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            🚨 CRISIS MODE
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>Attention budget</span>
          <div className="flex gap-1">
            {Array.from({ length: maxAttentionBudget }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full",
                  i < attentionBudget ? "bg-indigo-500" : "bg-slate-200"
                )}
              />
            ))}
          </div>
        </div>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600" />
      </div>
    </header>
  );
}
