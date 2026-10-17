import { useEffect, useRef, useState } from "react";

export type Route = "today" | "domains" | "synthesis" | "lab" | "health" | "about" | "log";

const COMMANDS: { route: Route; label: string; hint: string }[] = [
  { route: "today", label: "today", hint: "Active findings" },
  { route: "domains", label: "domains", hint: "Per-domain scorecards" },
  { route: "synthesis", label: "synthesis", hint: "Organizational Moment · Five Things · The One Question" },
  { route: "lab", label: "lab", hint: "Log / resolve findings, decisions, snoozes" },
  { route: "health", label: "health", hint: "Live non-destructive self-checks" },
  { route: "about", label: "about", hint: "Verified vs fabricated ledger" },
  { route: "log", label: "log", hint: "Raw event log, export / wipe" },
];

export function CommandPalette({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (r: Route) => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const needle = q.replace(/^>/, "").trim().toLowerCase();
  const matches = COMMANDS.filter((c) => c.label.includes(needle) || c.hint.toLowerCase().includes(needle));

  function go(r: Route) {
    onNavigate(r);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-zinc-700 px-4 py-3">
          <span className="font-mono text-emerald-400">{">"}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) go(matches[0].route);
              if (e.key === "Escape") onClose();
            }}
            placeholder="synthesis, today, lab, health, about, log…"
            className="w-full bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {matches.length === 0 && <div className="px-3 py-4 text-sm text-zinc-500">No matching route.</div>}
          {matches.map((c) => (
            <button
              key={c.route}
              onClick={() => go(c.route)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <span className="font-mono">
                <span className="text-zinc-500">#/</span>
                {c.label}
              </span>
              <span className="text-xs text-zinc-500">{c.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
