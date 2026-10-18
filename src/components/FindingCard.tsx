"use client";

import { DOMAIN_LABELS, type Finding } from "@/lib/types";

/**
 * Type contract: `Finding` from src/lib/types.ts, which mirrors
 * `OrchestratorResult.findings[number]` (see `OrchestratorResult.findings`
 * field path in src/lib/types.ts). Every finding list in the app (Cockpit
 * live feed, Signal Board) should render through this one component.
 */
export interface FindingCardProps {
  finding: Finding;
  playbookExists: boolean;
  onDismiss?: (id: string) => void;
  /** Optional human-readable description of the causal chain this finding belongs to. */
  causalChainDescription?: string | null;
  /** Adds the `leados-pulse` animation class (used for pinned sev-5 criticals). */
  pulse?: boolean;
}

const SEVERITY_STYLES: Record<Finding["severity"], { bg: string; label: string }> = {
  5: { bg: "bg-red-600", label: "SEV 5 · CRITICAL" },
  4: { bg: "bg-amber-600", label: "SEV 4 · WARNING" },
  3: { bg: "bg-yellow-500", label: "SEV 3 · WARNING" },
  2: { bg: "bg-slate-400", label: "SEV 2 · INFO" },
  1: { bg: "bg-slate-400", label: "SEV 1 · INFO" },
};

export default function FindingCard({
  finding,
  playbookExists,
  onDismiss,
  causalChainDescription,
  pulse = false,
}: FindingCardProps) {
  const severityStyle = SEVERITY_STYLES[finding.severity];
  const domainColor = `var(--domain-${finding.domain})`;

  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 ${
        pulse ? "leados-pulse border-red-700/60" : ""
      }`}
      style={{ fontFamily: "system-ui" }}
      data-rule-key={finding.ruleKey}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white ${severityStyle.bg}`}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        >
          {severityStyle.label}
        </span>

        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: domainColor }}
          title={DOMAIN_LABELS[finding.domain]}
          aria-hidden
        />
        <span className="text-xs text-slate-400">{DOMAIN_LABELS[finding.domain]}</span>

        {finding.causalChainId && (
          <span
            className="inline-flex cursor-help items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300"
            title={causalChainDescription ?? `Part of causal chain ${finding.causalChainId}`}
          >
            ⛓ chain
            {finding.amplificationFactor ? ` ×${finding.amplificationFactor.toFixed(2)}` : ""}
          </span>
        )}

        <span
          className="ml-auto shrink-0 text-[10px] text-slate-500"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        >
          {new Date(finding.createdAt).toLocaleTimeString()}
        </span>
      </div>

      <p className="text-sm font-medium leading-snug text-slate-100">{finding.title}</p>
      <p className="text-xs leading-snug text-slate-400">{finding.description}</p>

      {typeof finding.probability === "number" && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
              style={{ width: `${Math.round(finding.probability * 100)}%` }}
            />
          </div>
          <span
            className="shrink-0 text-[10px] text-slate-400"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            {Math.round(finding.probability * 100)}%
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        {playbookExists && (
          <a
            href={`/playbooks/${finding.ruleKey}`}
            className="min-h-[28px] text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            → playbook
          </a>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(finding.id)}
            className="ml-auto min-h-[28px] rounded px-2 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
