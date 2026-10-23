import { navItems } from "../data/mockData";
import { useAppState } from "../context/AppStateContext";
import { cn } from "../utils/cn";
import type { ModuleId } from "../types";

export function Sidebar({ active, onSelect }: { active: ModuleId; onSelect: (id: ModuleId) => void }) {
  const { crisisMode } = useAppState();
  const visibleItems = crisisMode ? navItems.filter((i) => i.essential) : navItems;
  const groups = Array.from(new Set(visibleItems.map((i) => i.group)));

  return (
    <aside
      className={cn(
        "flex h-screen w-64 shrink-0 flex-col border-r text-sm",
        crisisMode ? "border-rose-900 bg-rose-950 text-rose-50" : "border-slate-800 bg-slate-950 text-slate-200"
      )}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white",
            crisisMode ? "bg-rose-600" : "bg-gradient-to-br from-violet-500 to-indigo-600"
          )}
        >
          L
        </div>
        <div>
          <p className="font-semibold text-white">LEADOS</p>
          <p className={cn("text-xs", crisisMode ? "text-rose-200" : "text-slate-400")}>
            {crisisMode ? "Crisis Mode active" : "Leadership Operating System"}
          </p>
        </div>
      </div>

      {crisisMode && (
        <div className="mx-4 mb-3 rounded-lg bg-rose-900/60 px-3 py-2 text-xs text-rose-100">
          Non-essential modules are hidden. Only decision-critical surfaces remain.
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <p className={cn("px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider", crisisMode ? "text-rose-300" : "text-slate-500")}>
              {group}
            </p>
            {visibleItems
              .filter((i) => i.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    active === item.id
                      ? crisisMode
                        ? "bg-rose-800 text-white"
                        : "bg-indigo-600 text-white"
                      : crisisMode
                      ? "text-rose-100 hover:bg-rose-900"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
