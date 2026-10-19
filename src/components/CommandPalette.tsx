"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import { severityColor } from "@/lib/domains";
import type { CommandPaletteItem, SidePanelType } from "@/lib/types";

const TYPE_ICON: Record<CommandPaletteItem["type"], string> = {
  route: "→",
  person: "PP",
  decision: "DC",
  blocker: "BL",
  finding: "FN",
  hypothesis: "HY",
};

const TYPE_GROUP_LABEL: Record<CommandPaletteItem["type"], string> = {
  finding: "FINDINGS",
  decision: "DECISIONS",
  blocker: "BLOCKERS",
  hypothesis: "HYPOTHESES",
  person: "PEOPLE",
  route: "GO TO",
};

const TYPE_TO_PANEL: Partial<Record<CommandPaletteItem["type"], Exclude<SidePanelType, null>>> = {
  finding: "finding",
  decision: "decision",
  hypothesis: "hypothesis",
  person: "person",
};

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, commandPaletteData, openSidePanel } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === "Escape" && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commandPaletteOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return commandPaletteData;
    return commandPaletteData.filter(
      (item) => fuzzyMatch(query, item.label) || fuzzyMatch(query, item.sublabel),
    );
  }, [commandPaletteData, query]);

  useEffect(() => setActiveIndex(0), [query]);

  function selectItem(item: CommandPaletteItem) {
    setCommandPaletteOpen(false);
    router.push(item.route);
    const panelType = TYPE_TO_PANEL[item.type];
    if (panelType) openSidePanel(panelType, item.id);
  }

  if (!commandPaletteOpen) return null;

  const grouped = new Map<CommandPaletteItem["type"], CommandPaletteItem[]>();
  for (const item of results) {
    const list = grouped.get(item.type) ?? [];
    list.push(item);
    grouped.set(item.type, list);
  }
  const flatOrder = results;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 pt-16 sm:pt-24"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="flex h-[90vh] w-full flex-col rounded-lg border border-slate-700 bg-[#10131a]/95 shadow-2xl backdrop-blur-md sm:h-auto sm:max-h-[60vh] sm:w-[500px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-700 p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, flatOrder.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const item = flatOrder[activeIndex];
                if (item) selectItem(item);
              } else if (e.key === "Escape") {
                setCommandPaletteOpen(false);
              }
            }}
            placeholder="Search routes, people, decisions, findings…"
            className="w-full bg-transparent font-mono text-sm text-slate-100 caret-indigo-400 outline-none placeholder:text-slate-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {flatOrder.length === 0 ? (
            <div className="px-3 py-8 text-center font-mono text-xs text-slate-500">
              NO RESULTS — {query}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([type, items]) => (
              <div key={type} className="mb-2">
                <div className="px-2 py-1 font-mono text-[9px] tracking-widest text-slate-500">
                  {TYPE_GROUP_LABEL[type]}
                </div>
                {items.map((item) => {
                  const globalIndex = flatOrder.indexOf(item);
                  const active = globalIndex === activeIndex;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      onClick={() => selectItem(item)}
                      className={`flex w-full min-h-11 items-center gap-3 rounded px-2 py-2 text-left ${
                        active ? "bg-indigo-500/15" : "hover:bg-slate-800/50"
                      }`}
                    >
                      <span className="w-6 shrink-0 font-mono text-[10px] text-indigo-400">
                        {TYPE_ICON[item.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-100">{item.label}</span>
                        <span className="block truncate text-xs text-slate-500">{item.sublabel}</span>
                      </span>
                      {item.severity != null && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-black"
                          style={{ backgroundColor: severityColor(item.severity) }}
                        >
                          SEV {item.severity}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
