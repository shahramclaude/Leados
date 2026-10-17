import type { ReactNode } from "react";
import { cn } from "../utils/cn";

const NAV = [
  { route: "/today", label: "Today" },
  { route: "/landscape", label: "Landscape" },
  { route: "/wargame", label: "Wargame" },
  { route: "/registers", label: "Registers" },
  { route: "/log", label: "Log intel" },
  { route: "/events", label: "Event log" },
  { route: "/about", label: "About / Provenance" },
];

export function Shell({
  route,
  navigate,
  children,
}: {
  route: string;
  navigate: (r: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-bold">
              pt-O
            </div>
            <div>
              <div className="text-sm font-semibold leading-none text-zinc-100">LeadOS pt-O</div>
              <div className="text-xs leading-none text-zinc-500">Organizational Wargaming Engine</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  route === n.route ? "bg-violet-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-zinc-600 sm:px-6">
        Zero external data. All figures on this page are computed from the event log shown in{" "}
        <button className="underline" onClick={() => navigate("/events")}>
          Event log
        </button>{" "}
        plus manually logged intelligence. See{" "}
        <button className="underline" onClick={() => navigate("/about")}>
          About / Provenance
        </button>{" "}
        for what is verified vs. unverified in this build.
      </footer>
    </div>
  );
}
