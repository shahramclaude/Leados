"use client";
import { useState, useEffect, useRef } from "react";

const INTENTS: Array<{ pattern: RegExp; name: string; action: (m: string[]) => string }> = [
  { pattern: /^1[:\-]?1 with (.+)/i, name: "LOG_1ON1", action: (m) => `Log 1:1 with ${m[1]}` },
  { pattern: /feedback for (.+)/i, name: "GIVE_FEEDBACK", action: (m) => `Log feedback for ${m[1]}` },
  { pattern: /how is (.+) doing/i, name: "ASSESS_PERSON", action: (m) => `Assess ${m[1]}` },
  { pattern: /what if (.+)/i, name: "SIMULATE", action: (m) => `Simulate: ${m[1]}` },
  { pattern: /decided (.+)/i, name: "LOG_DECISION", action: (m) => `Log decision: ${m[1]}` },
  { pattern: /playbook for (.+)/i, name: "FIND_PLAYBOOK", action: (m) => `Find playbook: ${m[1]}` },
  { pattern: /explain (.+)/i, name: "EXPLAIN", action: (m) => `Explain: ${m[1]}` },
  { pattern: /^g t$/i, name: "NAV_TODAY", action: () => "Go to Today" },
  { pattern: /^g r$/i, name: "NAV_ROSTER", action: () => "Go to Roster" },
  { pattern: /^g i$/i, name: "NAV_INTEL", action: () => "Go to Intelligence" },
  { pattern: /^g s$/i, name: "NAV_SIMULATE", action: () => "Go to Simulate" },
];

interface Props {
  data: any;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export function CommandPalette({ data, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<{ intent: string; action: string; confidence: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const resolve = (q: string) => {
    for (const intent of INTENTS) {
      const m = q.match(intent.pattern);
      if (m) {
        setResolved({
          intent: intent.name,
          action: intent.action(Array.from(m) as string[]),
          confidence: m[0].length / q.length,
        });
        return;
      }
    }
    setResolved(null);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Enter") {
      if (resolved?.intent.startsWith("NAV_")) {
        const routes: Record<string, string> = {
          NAV_TODAY: "today",
          NAV_ROSTER: "roster",
          NAV_INTEL: "intelligence",
          NAV_SIMULATE: "simulation",
        };
        onNavigate(routes[resolved.intent] ?? "today");
      }
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-28"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[560px] max-w-[90vw] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            resolve(e.target.value);
          }}
          onKeyDown={handleKey}
          placeholder="1:1 with Ana · feedback for Bruno · what if churn doubles · g t"
          className="w-full bg-transparent px-4 py-3 outline-none border-b border-slate-800 placeholder:text-slate-600 text-sm text-slate-100"
        />
        <div className="p-3 min-h-[60px]">
          {resolved ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-indigo-400 font-medium text-sm">{resolved.intent}</span>
                <span className="text-[10px] font-mono text-slate-500">{Math.round(resolved.confidence * 100)}% match</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{resolved.action}</div>
              <div className="text-[10px] text-slate-600 mt-2">↵ to execute</div>
            </div>
          ) : query ? (
            <div className="text-xs text-slate-500">
              No intent matched — {data?.findings?.length ?? 0} findings, {data?.peopleCount ?? 0} people indexed
            </div>
          ) : (
            <div className="text-xs text-slate-600">Type a command, name, rule ID, or natural language</div>
          )}
        </div>

        <div className="border-t border-slate-800 px-3 py-2 flex gap-2 flex-wrap">
          {[
            ["g t", "Today"],
            ["g r", "Roster"],
            ["g i", "Intel"],
            ["g s", "Simulate"],
          ].map(([k, l]) => (
            <span key={k} className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
              {k} → {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
