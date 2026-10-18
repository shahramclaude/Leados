"use client";

import { useMemo, useState } from "react";
import type { IntelligenceData } from "@/lib/intelligence";
import type { ViewKey } from "@/components/leados/Shell";
import { QuickCapture, type EventType } from "@/components/leados/QuickCapture";

interface Props {
  data: IntelligenceData;
  navigate: (v: ViewKey, personId?: number) => void;
  onClose: () => void;
  refetch: () => Promise<void>;
}

type Intent =
  | { kind: "LOG_1ON1"; personName: string; personId?: number }
  | { kind: "LOG_PULSE"; personName: string; personId?: number }
  | { kind: "LOG_FEEDBACK"; personName: string; personId?: number }
  | { kind: "ASSESS"; personName: string; personId?: number }
  | { kind: "SIMULATE"; query: string }
  | { kind: "LOG_DECISION"; title: string }
  | { kind: "LOG_HYPOTHESIS"; statement: string }
  | { kind: "NAV"; view: ViewKey }
  | { kind: "LOOKUP_RULE"; rule: string }
  | { kind: "LOOKUP_PERSON"; personName: string; personId?: number }
  | null;

function resolvePerson(name: string, people: { id: number; name: string }[]) {
  const lower = name.trim().toLowerCase();
  const match = people.find((p) => p.name.toLowerCase().startsWith(lower)) ?? people.find((p) => p.name.toLowerCase().includes(lower));
  return match;
}

function resolveIntent(query: string, people: { id: number; name: string }[]): Intent {
  const q = query.trim();
  if (!q) return null;

  let m = q.match(/^1[:\-]?1 with (.+)/i);
  if (m) {
    const p = resolvePerson(m[1], people);
    return { kind: "LOG_1ON1", personName: p?.name ?? m[1], personId: p?.id };
  }
  m = q.match(/^pulse for (.+)/i);
  if (m) {
    const p = resolvePerson(m[1], people);
    return { kind: "LOG_PULSE", personName: p?.name ?? m[1], personId: p?.id };
  }
  m = q.match(/^feedback for (.+)/i);
  if (m) {
    const p = resolvePerson(m[1], people);
    return { kind: "LOG_FEEDBACK", personName: p?.name ?? m[1], personId: p?.id };
  }
  m = q.match(/^how is (.+) doing/i);
  if (m) {
    const p = resolvePerson(m[1], people);
    return { kind: "ASSESS", personName: p?.name ?? m[1], personId: p?.id };
  }
  m = q.match(/^what if (.+)/i);
  if (m) return { kind: "SIMULATE", query: m[1] };
  m = q.match(/^decided (.+)/i);
  if (m) return { kind: "LOG_DECISION", title: m[1] };
  m = q.match(/^hypothes(?:is|e) (.+)/i);
  if (m) return { kind: "LOG_HYPOTHESIS", statement: m[2] ?? m[1] };

  if (/^g t$/i.test(q)) return { kind: "NAV", view: "today" };
  if (/^g r$/i.test(q)) return { kind: "NAV", view: "roster" };
  if (/^g i$/i.test(q)) return { kind: "NAV", view: "intelligence" };
  if (/^g s$/i.test(q)) return { kind: "NAV", view: "simulation" };
  if (/^g a$/i.test(q)) return { kind: "NAV", view: "attention" };

  m = q.match(/R\d+/);
  if (m) return { kind: "LOOKUP_RULE", rule: m[0] };

  m = q.match(/@(\w+)/);
  if (m) {
    const p = resolvePerson(m[1], people);
    return { kind: "LOOKUP_PERSON", personName: p?.name ?? m[1], personId: p?.id };
  }

  return null;
}

function describeIntent(intent: Intent): string {
  if (!intent) return "No match — try “1:1 with Ana”, “g t”, “@ana”, “R5”…";
  switch (intent.kind) {
    case "LOG_1ON1":
      return `Log 1:1 with ${intent.personName}`;
    case "LOG_PULSE":
      return `Log pulse for ${intent.personName}`;
    case "LOG_FEEDBACK":
      return `Give feedback for ${intent.personName}`;
    case "ASSESS":
      return `Go to roster and expand ${intent.personName}`;
    case "SIMULATE":
      return `Open simulation for “${intent.query}”`;
    case "LOG_DECISION":
      return `Log decision: "${intent.title}"`;
    case "LOG_HYPOTHESIS":
      return `Create hypothesis: "${intent.statement}"`;
    case "NAV":
      return `Navigate to ${intent.view}`;
    case "LOOKUP_RULE":
      return `Look up rule ${intent.rule}`;
    case "LOOKUP_PERSON":
      return `Look up ${intent.personName}`;
  }
}

export function CommandPalette({ data, navigate, onClose, refetch }: Props) {
  const [query, setQuery] = useState("");
  const [quickCapture, setQuickCapture] = useState<{ type: EventType; personId?: number } | null>(null);

  const people = useMemo(() => data.flightRisk.map((f) => ({ id: f.personId, name: f.personName })), [data.flightRisk]);
  const intent = useMemo(() => resolveIntent(query, people), [query, people]);
  const confidence = query.trim().length ? Math.min(100, Math.round((Math.min(query.length, 40) / 40) * 100)) : 0;

  const rule = intent?.kind === "LOOKUP_RULE" ? data.findings.find((f) => f.rule === intent.rule) : undefined;
  const person = intent?.kind === "LOOKUP_PERSON" ? data.flightRisk.find((f) => f.personId === intent.personId) : undefined;

  function execute() {
    if (!intent) return;
    switch (intent.kind) {
      case "LOG_1ON1":
        setQuickCapture({ type: "oneonone", personId: intent.personId });
        return;
      case "LOG_PULSE":
        setQuickCapture({ type: "pulse", personId: intent.personId });
        return;
      case "LOG_FEEDBACK":
        setQuickCapture({ type: "feedback", personId: intent.personId });
        return;
      case "ASSESS":
        navigate("roster", intent.personId);
        onClose();
        return;
      case "SIMULATE":
        navigate("simulation");
        onClose();
        return;
      case "LOG_DECISION":
        navigate("decisions");
        onClose();
        return;
      case "LOG_HYPOTHESIS":
        navigate("hypotheses");
        onClose();
        return;
      case "NAV":
        navigate(intent.view);
        onClose();
        return;
      default:
        return;
    }
  }

  if (quickCapture) {
    return (
      <QuickCapture
        eventType={quickCapture.type}
        personId={quickCapture.personId}
        people={data.flightRisk}
        onClose={() => {
          setQuickCapture(null);
          onClose();
        }}
        onSuccess={refetch}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-28" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") execute();
          }}
          placeholder='Try "1:1 with Ana", "pulse for Marcus", "g r", "@priya", "R5"…'
          className="w-full rounded-t-xl border-b border-slate-800 bg-transparent px-4 py-3 text-slate-100 outline-none placeholder:text-slate-600"
        />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-600/20 px-2 py-0.5 text-xs font-medium text-teal-400">
              {intent ? intent.kind : "NO MATCH"}
            </span>
            <span className="text-sm text-slate-300">{describeIntent(intent)}</span>
          </div>

          {rule && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
              <div className="font-mono text-xs text-slate-500">{rule.rule}</div>
              <div className="text-slate-200">{rule.title}</div>
              <div className="text-slate-500">{rule.detail}</div>
            </div>
          )}
          {person && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
              <div className="text-slate-200">{person.personName} · {person.role}</div>
              <div className="text-slate-500">
                Risk {person.riskScore}% · mood {person.moodMean} · load {person.loadMean}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>confidence: {confidence}%</span>
            <span>↵ to execute</span>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3 text-xs text-slate-500">
            <span className="font-mono">g t</span> today ·<span className="font-mono">g r</span> people ·
            <span className="font-mono">g i</span> intel ·<span className="font-mono">g s</span> simulate ·
            <span className="font-mono">g a</span> plan
          </div>
        </div>
      </div>
    </div>
  );
}
