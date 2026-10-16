import { useEffect, useMemo, useRef, useState } from "react";
import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { RULES } from "../data/catalog";
import { buildIndex, parseQuery, runSearch } from "../lib/search";
import type { SearchItem } from "../types";
import { runCommand } from "../lib/commands";
import {
  buildDomainLink,
  buildExplainLink,
  buildFindingLink,
  buildPersonLink,
  buildPlaybookLink,
  buildTraceLink,
  navigate,
} from "../lib/router";
import * as store from "../lib/store";
import { Badge, SevBadge } from "./primitives";
import { cn } from "../utils/cn";

const PLACEHOLDER =
  "Search everything… try R103, @ana, #finance, sev:4, play:, event:, conf:low, or > command";

export function CommandPalette({
  open,
  onClose,
  P,
  storeState,
  sessionAccessed,
  currentDomain,
  onNotify,
  onToggleFocus,
}: {
  open: boolean;
  onClose: () => void;
  P: Projected;
  storeState: Store;
  sessionAccessed: Set<string>;
  currentDomain?: string;
  onNotify: (msg: string) => void;
  onToggleFocus: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRaw("");
      setDebounced("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw), 80);
    return () => clearTimeout(t);
  }, [raw]);

  const personIndex = useMemo(() => new Map(storeState.people.map((p) => [p.id, p])), [storeState.people]);
  const index = useMemo(() => buildIndex(P, storeState, RULES, P.today), [P, storeState]);
  const query = useMemo(() => parseQuery(debounced), [debounced]);
  const results = useMemo(
    () => runSearch(query, index, { personIndex, sessionAccessed, currentDomain }),
    [query, index, personIndex, sessionAccessed, currentDomain]
  );

  function select(item: SearchItem) {
    sessionAccessed.add(idOf(item));
    if (item.type === "finding") navigate(buildFindingLink(item.rule));
    if (item.type === "person") navigate(buildPersonLink(item.id));
    if (item.type === "playbook") navigate(buildPlaybookLink(item.id));
    if (item.type === "rule") navigate(buildExplainLink(item.id));
    if (item.type === "event") navigate(buildTraceLink(item.id));
    if (item.type === "domain") navigate(buildDomainLink(item.name));
    onClose();
  }

  function runEnter() {
    if (query.isCommand) {
      runCommand(query.commandText, {
        navigate,
        setTheme: store.setTheme,
        undoLast: store.undoLast,
        exportNow: () => downloadExport(P),
        muteRule: store.muteRule,
        unmuteRule: store.unmuteRule,
        updateSetting: store.updateSetting,
        resetAndReseed: store.resetAndReseed,
        toggleFocus: onToggleFocus,
        notify: onNotify,
      });
      onClose();
      return;
    }
    if (results[active]) select(results[active]);
    else if (raw.trim()) navigate(`#/search/${encodeURIComponent(raw.trim())}`), onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="text-slate-400">⌘K</span>
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runEnter();
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder={PLACEHOLDER}
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {query.isCommand && <Badge tone="violet">command</Badge>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.isCommand ? (
            <div className="px-3 py-4 text-sm text-slate-500">
              Press <span className="font-mono">Enter</span> to run <span className="font-mono text-violet-700">&gt;{query.commandText || "…"}</span>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400">{raw ? "No matches." : "Start typing to search findings, people, events, playbooks, rules & domains."}</div>
          ) : (
            groupedEntries(results).map(([type, items]) => (
              <div key={type} className="mb-2">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{type}</div>
                {items.map((item) => {
                  const globalIndex = results.indexOf(item);
                  return (
                    <button
                      key={idOf(item) + item.type}
                      onClick={() => select(item)}
                      onMouseEnter={() => setActive(globalIndex)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm",
                        globalIndex === active ? "bg-violet-50 text-violet-900" : "hover:bg-slate-50"
                      )}
                    >
                      <ResultLine item={item} />
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">{item.score.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <span>80ms debounce · in-memory, no index library</span>
        </div>
      </div>
    </div>
  );
}

function groupedEntries(results: SearchItem[]): [string, SearchItem[]][] {
  const order = ["finding", "person", "rule", "playbook", "domain", "event"];
  const map = new Map<string, SearchItem[]>();
  results.forEach((r) => {
    const arr = map.get(r.type) || [];
    arr.push(r);
    map.set(r.type, arr);
  });
  return order.filter((o) => map.has(o)).map((o) => [o, map.get(o)!]);
}

function idOf(it: SearchItem): string {
  switch (it.type) {
    case "finding":
      return it.key;
    case "person":
      return it.id;
    case "event":
      return it.id;
    case "playbook":
      return it.id;
    case "rule":
      return it.id;
    case "domain":
      return it.name;
  }
}

function ResultLine({ item }: { item: SearchItem }) {
  if (item.type === "finding")
    return (
      <span className="flex items-center gap-2 truncate">
        <SevBadge sev={item.sev} /> <span className="truncate">{item.title}</span>
      </span>
    );
  if (item.type === "person") return <span>{item.name} <span className="text-slate-400">· {item.role}</span></span>;
  if (item.type === "event") return <span className="font-mono text-xs">{item.id} · {item.eventType}</span>;
  if (item.type === "playbook") return <span>{item.title}</span>;
  if (item.type === "rule") return <span className="font-mono">{item.id}</span>;
  return <span>#{item.name} <span className="text-slate-400">({item.findingCount} findings, top sev {item.topSev})</span></span>;
}

function downloadExport(P: Projected) {
  const json = store.exportStore({ findings: P.findings });
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leados-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

export { downloadExport };
