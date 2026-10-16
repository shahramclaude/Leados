import type { ReactNode } from "react";
import type { Store } from "../types";
import { Badge, KeyCap } from "./primitives";
import { navigate } from "../lib/router";
import { cn } from "../utils/cn";

const NAV: { label: string; hash: string; path: string }[] = [
  { label: "Today", hash: "#/today", path: "today" },
  { label: "Roster", hash: "#/roster", path: "roster" },
  { label: "Playbooks", hash: "#/playbooks", path: "playbooks" },
  { label: "Finance", hash: "#/finance", path: "finance" },
  { label: "Intelligence", hash: "#/intelligence", path: "intelligence" },
  { label: "Self", hash: "#/self", path: "self" },
  { label: "Health", hash: "#/health", path: "health" },
  { label: "Data", hash: "#/data", path: "data" },
];

export function Shell({
  currentPath,
  onOpenSearch,
  storeState,
  children,
  focusMode,
}: {
  currentPath: string;
  onOpenSearch: () => void;
  storeState: Store;
  children: ReactNode;
  focusMode: boolean;
}) {
  const mutedCount = storeState.meta.mutedRules.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-bold text-white">L</div>
            <span className="font-semibold text-slate-900">LeadOS <span className="text-violet-600">pt-E</span></span>
          </div>
          {!focusMode && (
            <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
              {NAV.map((n) => (
                <button
                  key={n.hash}
                  onClick={() => navigate(n.hash)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap",
                    currentPath === n.path ? "bg-violet-100 text-violet-800" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {n.label}
                </button>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {mutedCount > 0 && (
              <Badge tone="amber">{mutedCount} rule{mutedCount > 1 ? "s" : ""} globally muted</Badge>
            )}
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500 hover:border-violet-300"
            >
              Search
              <KeyCap>⌘K</KeyCap>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-400">
        <p>
          URLs are local navigation only — they do not expose your data. Deep links (#/today, #/roster/[id], #/trace/[eventId]…)
          only resolve in this browser, on this device: all state lives in <code>localStorage</code>.
        </p>
        <p className="mt-1">
          This is a fabricated demo built for the pt-E brief. It does not read or write a real LeadOS install. See AI-SESSION-LOG.md and README.md for verified vs. fabricated claims.
        </p>
      </footer>
    </div>
  );
}
