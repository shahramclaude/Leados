import { useMemo, useState } from "react";
import type { OrgDataset } from "../lib/types";
import { computeCascadeRisk, detectCascades } from "../lib/causalInference";
import {
  computeEnergy,
  computeInertia,
  computeResonance,
  measureOrgEntropy,
  projectScore,
} from "../lib/orgPhysics";
import { buildPhysicsSummary, computeOrgHealthScore, computeRiskProfile } from "../lib/brain";
import { domainName, riskProfileColor, timeAgo } from "../lib/shared";
import { DomainRadar } from "../components/DomainRadar";
import { FindingCard } from "../components/FindingCard";
import { PhysicsLawCard } from "../components/PhysicsMeter";
import { Dot, LiveDot, Meter, SectionLabel } from "../components/primitives";
import { cn } from "../utils/cn";

// ─────────────────────────────────────────────────────────────
// TodayView — the command center. Must answer "what is happening
// right now" in under 3 seconds: situational assessment first,
// then the live finding feed, then the health radar + velocity
// table, then (optionally) active cascades. Physics breakdown is
// collapsed by default since it's supporting detail, not urgency.
// ─────────────────────────────────────────────────────────────
export function TodayView({ dataset }: { dataset: OrgDataset }) {
  const { domains, findings, causalLinks } = dataset;
  const [showAll, setShowAll] = useState(false);
  const [physicsOpen, setPhysicsOpen] = useState(false);

  const orgHealthScore = useMemo(() => computeOrgHealthScore(domains), [domains]);
  const { riskPct: cascadeRiskPct } = useMemo(() => computeCascadeRisk(causalLinks, findings), [causalLinks, findings]);
  const riskProfile = useMemo(() => computeRiskProfile(orgHealthScore, cascadeRiskPct), [orgHealthScore, cascadeRiskPct]);
  const physicsSummary = useMemo(() => buildPhysicsSummary(domains, findings, causalLinks), [domains, findings, causalLinks]);

  const entropy = useMemo(() => measureOrgEntropy(domains, findings), [domains, findings]);
  const energy = useMemo(() => computeEnergy(findings), [findings]);
  const inertia = useMemo(() => computeInertia(domains), [domains]);
  const resonance = useMemo(() => computeResonance(domains), [domains]);
  const cascades = useMemo(() => detectCascades(findings, causalLinks), [findings, causalLinks]);

  const sortedFindings = useMemo(
    () =>
      [...findings].sort((a, b) => b.sev - a.sev || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [findings]
  );
  const visibleFindings = showAll ? sortedFindings : sortedFindings.slice(0, 12);

  return (
    <div className="p-4">
      {/* SECTION A — Situational assessment */}
      <div
        className="rounded-lg border border-[color:var(--border-default)] bg-[color:var(--bg-card)] p-4"
        style={{ borderLeft: `3px solid ${riskProfileColor(riskProfile)}` }}
      >
        <SectionLabel>Situational Assessment</SectionLabel>
        <p className="mt-1.5 text-base leading-snug text-[color:var(--text-primary)]">{physicsSummary}</p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: riskProfileColor(riskProfile),
              borderColor: `color-mix(in srgb, ${riskProfileColor(riskProfile)} 40%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${riskProfileColor(riskProfile)} 10%, transparent)`,
            }}
          >
            {riskProfile} profile
          </span>
          <span className="font-mono text-xs text-[color:var(--text-muted)]">
            ORG HEALTH <span className="text-[color:var(--text-code)]">{orgHealthScore}</span>/100
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        {/* LEFT COLUMN — live finding feed */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <SectionLabel>Active Findings</SectionLabel>
            <span className="rounded-full bg-[color:var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--text-secondary)]">
              {findings.length}
            </span>
            <LiveDot />
          </div>
          <div className="space-y-2">
            {visibleFindings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
          {sortedFindings.length > 12 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 font-mono text-xs text-[color:var(--text-accent)] hover:underline"
            >
              {showAll ? "show less" : `show ${sortedFindings.length - 12} more`}
            </button>
          )}
        </div>

        {/* CENTER COLUMN — radar + velocity table + cascades */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
            <SectionLabel className="mb-2">Org Health Radar — vs 7 days ago</SectionLabel>
            <div className="flex justify-center">
              <DomainRadar domains={domains} orgHealthScore={orgHealthScore} size={240} />
            </div>
          </section>

          <section className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
            <SectionLabel className="mb-2">Domain Velocity</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse font-mono text-xs">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-wider text-[color:var(--text-muted)]">
                    <th className="pb-1.5 pr-2 font-normal">Domain</th>
                    <th className="pb-1.5 pr-2 font-normal">Score</th>
                    <th className="pb-1.5 pr-2 font-normal">Velocity</th>
                    <th className="pb-1.5 pr-2 font-normal">+14d</th>
                    <th className="pb-1.5 font-normal">Data Density</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d) => {
                    const density =
                      d.dataDensity90d >= 20
                        ? { label: "HIGH", color: "var(--health-green)" }
                        : d.dataDensity90d >= 5
                        ? { label: "MED", color: "var(--health-amber)" }
                        : { label: "LOW", color: "var(--health-critical)" };
                    return (
                      <tr key={d.key} className="border-t border-[color:var(--border-subtle)]">
                        <td className="py-1.5 pr-2">
                          <span className="flex items-center gap-1.5 text-[color:var(--text-secondary)]">
                            <Dot colorVar={d.colorVar} size={7} />
                            {d.name}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-[color:var(--text-primary)]">{d.score.toFixed(1)}</td>
                        <td
                          className="py-1.5 pr-2"
                          style={{ color: d.velocity >= 0 ? "var(--health-green)" : "var(--health-critical)" }}
                        >
                          {d.velocity >= 0 ? "+" : ""}
                          {d.velocity.toFixed(1)}
                        </td>
                        <td className="py-1.5 pr-2 text-[color:var(--text-secondary)]">{projectScore(d, 14).toFixed(1)}</td>
                        <td className="py-1.5">
                          <span style={{ color: density.color }}>
                            {density.label}
                            {density.label === "LOW" && " ⚠ low confidence"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {cascades.length > 0 && (
            <section className="rounded-lg border border-[color:var(--sev-4-border)] bg-[color:var(--sev-4-bg)] p-3">
              <SectionLabel className="mb-2">Active Cascades</SectionLabel>
              <div className="space-y-2.5">
                {cascades.map((c) => (
                  <div key={`${c.fromRuleId}-${c.toRuleId}`}>
                    <div className="font-mono text-xs text-[color:var(--health-amber)]">
                      {c.fromRuleLabel} ──{c.lagDays}d──&gt; {c.toRuleLabel}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[color:var(--text-secondary)]">
                      Effect amplified by {c.amplificationFactor}× · Confidence: {Math.round(c.confidence * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* BOTTOM — physics breakdown, collapsed by default */}
      <div className="mt-4">
        <button
          onClick={() => setPhysicsOpen((v) => !v)}
          className="flex items-center gap-2 font-mono text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
        >
          <span className={cn("transition-transform", physicsOpen && "rotate-90")}>▸</span>
          PHYSICS BREAKDOWN
        </button>
        {physicsOpen && (
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PhysicsLawCard glyph="⟲" name="Inertia" color="var(--text-accent)">
              <div className="font-mono text-2xl font-bold text-[color:var(--text-code)]">{inertia.inertiaIndex}</div>
              <Meter value={inertia.inertiaIndex} color="var(--text-accent)" />
              <p className="text-[10px] text-[color:var(--text-secondary)]">
                Resistance to change, inverse of average domain velocity magnitude.
              </p>
            </PhysicsLawCard>
            <PhysicsLawCard glyph="⚛" name="Entropy" color="var(--sev-4)">
              <div className="font-mono text-2xl font-bold text-[color:var(--text-code)]">{entropy.compositeEntropy}</div>
              <Meter value={entropy.compositeEntropy} color="var(--sev-4)" />
              <p className="text-[10px] text-[color:var(--text-secondary)]">
                Disorder from domain score variance + active finding pressure.
              </p>
            </PhysicsLawCard>
            <PhysicsLawCard glyph="◉" name="Energy" color="var(--dc-strategy)">
              <div className="font-mono text-2xl font-bold text-[color:var(--text-code)]">{energy.totalEnergy}</div>
              <Meter value={energy.level} color="var(--dc-strategy)" />
              <p className="text-[10px] text-[color:var(--text-secondary)]">
                Total severity × confidence across all active findings.
              </p>
            </PhysicsLawCard>
            <PhysicsLawCard glyph="∿" name="Resonance" color="var(--dc-cs)">
              <div className="font-mono text-2xl font-bold text-[color:var(--text-code)]">{resonance.pairs.length}</div>
              <p className="text-[10px] text-[color:var(--text-secondary)]">
                {resonance.pairs.length
                  ? resonance.pairs
                      .slice(0, 2)
                      .map((p) => `${domainName(p.a.key)} ∿ ${domainName(p.b.key)}`)
                      .join(", ")
                  : "No coupled domain pairs detected this cycle."}
              </p>
            </PhysicsLawCard>
          </div>
        )}
      </div>

      <div className="mt-6 text-right font-mono text-[9px] text-[color:var(--text-muted)]">
        dataset last computed {timeAgo(dataset.lastRunAt)}
      </div>
    </div>
  );
}
