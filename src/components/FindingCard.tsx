import type { Finding } from "../lib/types";
import { domainColorVar, domainName, scoreMath, timeAgo } from "../lib/shared";
import { cn } from "../utils/cn";
import { DomainBadge, SevBadge, sevColorVar } from "./primitives";

// ─────────────────────────────────────────────────────────────
// FindingCard — the atomic unit of the entire workspace.
// Left border color = severity (var(--sev-N)).
// sev-5 cards get the sev5-pulse ring: this is the single most
// aggressive animation in the app, reserved for the single most
// urgent class of information.
// ─────────────────────────────────────────────────────────────
export function FindingCard({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  const sevVar = sevColorVar(finding.sev);
  return (
    <div
      className={cn(
        "relative rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] pl-3 pr-3 py-2.5",
        finding.sev === 5 && "sev5-pulse"
      )}
      style={{ borderLeft: `3px solid var(${sevVar})` }}
    >
      {/* Row 1: sev badge, domain, rule id, time */}
      <div className="flex flex-wrap items-center gap-2">
        <SevBadge sev={finding.sev} />
        <DomainBadge name={domainName(finding.domain)} colorVar={domainColorVar(finding.domain)} />
        <span className="font-mono text-[10px] text-[color:var(--text-muted)]">{finding.ruleId}</span>
        <span className="ml-auto font-mono text-[10px] text-[color:var(--text-muted)]">
          {timeAgo(finding.timestamp)}
        </span>
      </div>

      {/* Row 2: title */}
      <div className="mt-1.5 text-sm font-medium leading-snug text-[color:var(--text-primary)]">
        {finding.title}
      </div>

      {/* Row 3: cascade annotation, if an upstream finding is amplifying this one */}
      {finding.cascadeFromRuleId && finding.amplificationFactor && (
        <div className="mt-1 font-mono text-[10px] text-[color:var(--health-amber)]">
          ⟶ CASCADE: {finding.cascadeFromRuleId} is amplifying this finding by {finding.amplificationFactor}×
        </div>
      )}

      {!compact && (
        <>
          {/* Row 4: score math transparency */}
          <div className="mt-1.5 font-mono text-[11px] text-[color:var(--text-code)]">
            {scoreMath(finding.sev, finding.confidence)}
          </div>

          {/* Row 5: basis */}
          <div className="mt-1 truncate text-xs text-[color:var(--text-secondary)]" title={finding.basis}>
            {finding.basis}
          </div>

          {/* Row 6: playbook link */}
          {finding.suggestedPlaybook && (
            <div className="mt-1.5">
              <a
                href="#intelligence"
                className="font-mono text-[11px] text-[color:var(--text-accent)] hover:underline"
              >
                → Playbook: {finding.suggestedPlaybook}
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
