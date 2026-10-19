import { useMemo, useState, type ReactNode } from "react";
import type { OrgDataset } from "../lib/types";
import { DOMAIN_META, DOMAIN_KEYS } from "../lib/mockData";
import type { DomainKey, Severity } from "../lib/types";
import { FindingCard } from "../components/FindingCard";
import { Dot, SectionLabel } from "../components/primitives";
import { cn } from "../utils/cn";

// ─────────────────────────────────────────────────────────────
// IntelligenceView — full findings ledger with domain + severity
// filters. This is the exhaustive counterpart to Today's curated
// top-12 feed: every active finding the engine has produced.
// ─────────────────────────────────────────────────────────────
export function IntelligenceView({ dataset }: { dataset: OrgDataset }) {
  const [domainFilter, setDomainFilter] = useState<DomainKey | "all">("all");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");

  const filtered = useMemo(() => {
    return dataset.findings
      .filter((f) => domainFilter === "all" || f.domain === domainFilter)
      .filter((f) => sevFilter === "all" || f.sev === sevFilter)
      .sort((a, b) => b.sev - a.sev || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [dataset.findings, domainFilter, sevFilter]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <SectionLabel>Intelligence Ledger</SectionLabel>
        <span className="rounded-full bg-[color:var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--text-secondary)]">
          {filtered.length} / {dataset.findings.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          <FilterChip active={domainFilter === "all"} onClick={() => setDomainFilter("all")}>
            all domains
          </FilterChip>
          {DOMAIN_KEYS.map((k) => (
            <FilterChip key={k} active={domainFilter === k} onClick={() => setDomainFilter(k)}>
              <Dot colorVar={DOMAIN_META[k].colorVar} size={6} />
              {DOMAIN_META[k].name}
            </FilterChip>
          ))}
        </div>
        <div className="flex gap-1 border-l border-[color:var(--border-subtle)] pl-3">
          <FilterChip active={sevFilter === "all"} onClick={() => setSevFilter("all")}>
            all sev
          </FilterChip>
          {[5, 4, 3, 2, 1].map((s) => (
            <FilterChip key={s} active={sevFilter === s} onClick={() => setSevFilter(s as Severity)}>
              {s}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {filtered.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-10 text-center font-mono text-xs text-[color:var(--text-muted)]">
            No findings match this filter combination.
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wide",
        active
          ? "border-[color:var(--border-active)] bg-[color:var(--text-accent)]/10 text-[color:var(--text-accent)]"
          : "border-[color:var(--border-default)] text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
      )}
    >
      {children}
    </button>
  );
}
