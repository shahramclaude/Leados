import { useMemo, useState } from "react";
import type { DomainKey, Projection } from "../lib/types";
import { DOMAINS, DOMAIN_COLORS, DOMAIN_LABELS } from "../lib/types";
import { measureVelocity, domainMath } from "../lib/velocity";
import {
  computeChangePhysics,
  computeLeadershipEnergyBudget,
  computeResonancePairs,
  measureOrgEntropy,
  measureResonance,
  RESONANCE_WATCHLIST,
} from "../lib/orgPhysics";
import { Badge, Card, ConfidencePill, SectionTitle, Stat, scoreBandLabel } from "./ui";
import { Sparkline } from "./Sparkline";
import { EntropyArc } from "./EntropyArc";
import { EnergyGauge } from "./EnergyGauge";
import { engine } from "../lib/engine";

function dirGlyph(v: number) {
  if (v > 0.02) return { glyph: "↑↑", color: "var(--bad)" };
  if (v >= 0.01) return { glyph: "↑", color: "var(--warn)" };
  if (v > -0.01) return { glyph: "→", color: "var(--text-muted)" };
  if (v >= -0.02) return { glyph: "↓", color: "var(--ok)" };
  return { glyph: "↓↓", color: "var(--ok)" };
}

function velocityColor(v: number) {
  if (v > 0.05) return "#f87171"; // text-red-400
  if (v < -0.05) return "#34d399"; // text-emerald-400
  return "var(--text-muted)";
}

function bandColorToText(c: "red" | "amber" | "green" | "slate" | "indigo") {
  return c === "red" ? "var(--bad)" : c === "amber" ? "var(--warn)" : c === "green" ? "var(--ok)" : "var(--text-muted)";
}

function domainHistorySeries(domain: DomainKey, P: Projection, today: Date, days = 30): number[] {
  const out: number[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const asOf = new Date(today.getTime() - d * 86400000);
    out.push(domainMath(domain, P, asOf).score);
  }
  return out;
}

export function IntelligenceView({ P, today }: { P: Projection; today: Date }) {
  const velocities = useMemo(() => DOMAINS.map((d) => measureVelocity(d, P, today, 30)), [P, today]);
  const alarm = useMemo(() => [...velocities].sort((a, b) => b.velocity - a.velocity)[0], [velocities]);
  const alarmFiring = !!alarm && alarm.velocity > 0.03;

  const entropy = useMemo(() => measureOrgEntropy(P, today), [P, today]);
  const energy = useMemo(() => computeLeadershipEnergyBudget(P, today), [P, today]);
  const pairs = useMemo(() => computeResonancePairs(P, today), [P, today]);

  const topDomainByScore = useMemo(() => [...velocities].sort((a, b) => b.current - a.current)[0], [velocities]);
  const problemDomainCount = useMemo(() => velocities.filter((v) => v.current >= 5).length, [velocities]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-14 px-5 py-10">
      <ViewIntro />
      <VelocitySection P={P} today={today} velocities={velocities} alarm={alarm} alarmFiring={alarmFiring} />
      <EntropySection entropy={entropy} />
      <EnergySection energy={energy} />
      <ResonanceSection P={P} today={today} pairs={pairs} />
      <InertiaSection P={P} today={today} />
      <SynthesisSection
        entropy={entropy}
        energy={energy}
        alarm={alarm}
        alarmFiring={alarmFiring}
        topDomain={topDomainByScore}
        problemDomainCount={problemDomainCount}
      />
    </div>
  );
}

function ViewIntro() {
  return (
    <div>
      <div className="font-mono-ui text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--text-dim)" }}>
        LEADOS · #/intelligence
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
        Organizational Physics
      </h1>
      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>
        Six heuristic lenses on the same event log — velocity, entropy, energy, resonance, inertia, and a plain-language
        synthesis. Every number below is a labeled estimate, not a measurement. Confidence is shown, never hidden.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// SECTION 1 — TEMPORAL VELOCITY
// ───────────────────────────────────────────────────────────

function VelocitySection({
  P,
  today,
  velocities,
  alarm,
  alarmFiring,
}: {
  P: Projection;
  today: Date;
  velocities: ReturnType<typeof measureVelocity>[];
  alarm: ReturnType<typeof measureVelocity> | undefined;
  alarmFiring: boolean;
}) {
  return (
    <section>
      <SectionTitle
        eyebrow="Law 1 of 5 · measureVelocity()"
        title="TEMPORAL VELOCITY"
        glyph="⟶"
        spin
        desc="Rate and direction of organizational change, per domain. A score tells you where things stand; velocity tells you where they're headed — and how fast."
      />

      {alarmFiring && alarm && (
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ borderColor: "rgba(251,191,36,.45)", background: "linear-gradient(180deg, rgba(120,80,8,.22), rgba(40,28,4,.4))" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="amber">⚠ VELOCITY ALARM</Badge>
            <ConfidencePill level={alarm.dataConfidence} />
          </div>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            Domain: <strong>{DOMAIN_LABELS[alarm.domain]}</strong>. Score: <strong className="font-mono-ui">{alarm.current.toFixed(1)}</strong>.
            Velocity: <strong className="font-mono-ui">+{alarm.velocity.toFixed(3)}/d</strong>. Projected +30d:{" "}
            <strong className="font-mono-ui">{alarm.projectedIn30d.toFixed(1)}</strong>. This is the <em>RATE</em>, not the score — a rising
            score moving fast is more dangerous than a bad score that's stable.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="font-mono-ui text-[10.5px] uppercase tracking-wide" style={{ background: "var(--panel2)", color: "var(--text-muted)" }}>
            <tr>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Velocity</th>
              <th className="px-3 py-2">Dir</th>
              <th className="px-3 py-2">+14d</th>
              <th className="px-3 py-2">+30d</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Conf</th>
            </tr>
          </thead>
          <tbody>
            {velocities.map((v) => {
              const dir = dirGlyph(v.velocity);
              const b14 = scoreBandLabel(v.projectedClamped14);
              const b30 = scoreBandLabel(v.projectedClamped30);
              return (
                <tr key={v.domain} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: DOMAIN_COLORS[v.domain] }} aria-hidden />
                      <span style={{ color: "var(--text)" }}>{DOMAIN_LABELS[v.domain]}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono-ui" style={{ color: "var(--text)" }}>
                    {v.current.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 font-mono-ui font-medium" style={{ color: velocityColor(v.velocity) }}>
                    {v.velocity >= 0 ? "+" : ""}
                    {v.velocity.toFixed(3)}/d
                  </td>
                  <td className="px-3 py-2 font-mono-ui font-semibold" style={{ color: dir.color }}>
                    {dir.glyph}
                  </td>
                  <td className="px-3 py-2 font-mono-ui" style={{ color: bandColorToText(b14.color) }}>
                    {v.projectedClamped14.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 font-mono-ui" style={{ color: bandColorToText(b30.color) }}>
                    {v.projectedClamped30.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 font-mono-ui">
                    {v.eventCount90d < 5 ? <span style={{ color: "var(--bad)" }}>⚠LOW ({v.eventCount90d})</span> : <span style={{ color: "var(--text-muted)" }}>{v.eventCount90d}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge color={v.dataConfidence === "HIGH" ? "green" : v.dataConfidence === "MED" ? "amber" : "red"}>{v.dataConfidence}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DOMAINS.map((d) => {
          const v = measureVelocity(d, P, today, 30);
          const series = domainHistorySeries(d, P, today, 30);
          return (
            <div key={d} className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--panel2)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text)" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DOMAIN_COLORS[d] }} />
                  {DOMAIN_LABELS[d]}
                </div>
                <span className="font-mono-ui text-[10px]" style={{ color: dirGlyph(v.velocity).color }}>
                  {dirGlyph(v.velocity).glyph}
                </span>
              </div>
              <div className="mt-2">
                <Sparkline
                  points={series}
                  showCurrentDot
                  showAnomaly
                  width={200}
                  height={38}
                  color={v.direction === "WORSENING" ? "var(--bad)" : v.direction === "IMPROVING" ? "var(--ok)" : "var(--accent)"}
                  label={`${d} 30-day score`}
                />
              </div>
              <div className="mt-1 font-mono-ui text-[10px]" style={{ color: "var(--text-dim)" }}>
                30d of domain score history
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// SECTION 2 — ENTROPY
// ───────────────────────────────────────────────────────────

function EntropySection({ entropy }: { entropy: ReturnType<typeof measureOrgEntropy> }) {
  const color =
    entropy.compositeEntropy < 20 ? "var(--ok)" : entropy.compositeEntropy < 40 ? "var(--warn)" : entropy.compositeEntropy < 60 ? "#fb923c" : "var(--bad)";

  return (
    <section>
      <SectionTitle
        eyebrow="Law 2 of 5 · measureOrgEntropy()"
        title="ORGANIZATIONAL ENTROPY"
        glyph="⚛"
        desc="Shannon-style spread of active findings across domains — high entropy = problems distributed everywhere (harder to address); low entropy = concentration (focus is possible)."
      />
      <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
        "{entropy.label}"
      </p>

      <Card>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-center">
            <EntropyArc score={entropy.compositeEntropy} color={color} />
            <div className="mt-2 text-center font-mono-ui text-sm font-semibold" style={{ color }}>
              {entropy.interpretation}
            </div>
          </div>
          <div className="w-full flex-1">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Entropy indicators
            </div>
            <div className="space-y-2">
              {entropy.indicators.map((i) => (
                <div key={i.name} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium" style={{ color: "var(--text)" }}>
                      {i.name}
                    </span>
                    <span className="font-mono-ui" style={{ color: "var(--text)" }}>
                      {(i.value * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--panel2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, i.value * 100)}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {i.description}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                    source: {i.source}
                  </div>
                </div>
              ))}
              {entropy.indicators.length === 0 && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Not enough data to compute entropy indicators yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// SECTION 3 — ENERGY
// ───────────────────────────────────────────────────────────

function EnergySection({ energy }: { energy: ReturnType<typeof computeLeadershipEnergyBudget> }) {
  return (
    <section>
      <SectionTitle
        eyebrow="Law 3 of 5 · computeLeadershipEnergyBudget()"
        title="LEADERSHIP ENERGY"
        glyph="⚡"
        desc="Estimated cognitive and organizational capacity remaining for change initiatives."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="indigo">NO NUMERIC CONFIDENCE FIELD</Badge>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            — caveat lives in the model's own label, shown verbatim below.
          </span>
        </div>
        <p className="mt-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--text)" }}>
          "{energy.label}"
        </p>

        <div className="mt-5">
          <EnergyGauge score={energy.score} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Sources" value={`+${energy.sourceEnergy}`} sub={`${energy.wins} wins (30d) ×3, + positive culture ×1`} />
          <Stat label="Drains" value={`-${energy.drainEnergy}`} sub="sev≥4 findings ×2, overdue commits ×1.5, blocked pipelines ×1" />
          <Stat label="Balance" value={`${energy.balance >= 0 ? "+" : ""}${energy.balance}`} />
          <Stat label="Assessment" value={<span className="text-base">{energy.assessment}</span>} />
        </div>

        {energy.score < 30 && (
          <div className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: "rgba(248,113,113,.4)", background: "rgba(248,113,113,.08)", color: "var(--bad)" }}>
            <strong>LOW ENERGY DETECTED</strong> — high-mass change initiatives are strongly contraindicated. The org cannot absorb
            additional load.
          </div>
        )}
      </Card>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// SECTION 4 — RESONANCE
// ───────────────────────────────────────────────────────────

function ResonanceSection({ P, today, pairs }: { P: Projection; today: Date; pairs: ReturnType<typeof computeResonancePairs> }) {
  const nowDay = Math.floor(today.getTime() / 86400000);
  const watchlistStatus = RESONANCE_WATCHLIST.map((type) => {
    const firingRecently = P.state.events.some((e) => e.type === type && nowDay - engine._dayUTC(e.ts) <= 7 && nowDay - engine._dayUTC(e.ts) >= 0);
    const r = measureResonance(type, P);
    return { type, firingRecently, r };
  });

  return (
    <section>
      <SectionTitle
        eyebrow="Law 4 of 5 · measureResonance() + computeResonancePairs() [FALLBACK]"
        title="RESONANCE"
        glyph="∿"
        desc="Patterns of co-occurring organizational signals — pairs that fire together require coordinated, not sequential, intervention."
      />

      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        RESONANCE_WATCHLIST <strong>is exported</strong> from orgPhysics.ts — a disclosed, hand-picked list of 6 event types, not an
        exhaustive scan of the registry.
      </p>
      <div className="mb-5 flex flex-wrap gap-2">
        {watchlistStatus.map(({ type, firingRecently }) => (
          <Badge key={type} color={firingRecently ? "green" : "slate"} className="font-mono-ui">
            {firingRecently ? "● firing" : "○ quiet"} · {type}
          </Badge>
        ))}
      </div>

      {pairs.length === 0 && (
        <Card>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No pairs crossed the minimum co-occurrence threshold yet — insufficient data for resonance pairing.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pairs.map((p) => (
          <Card key={`${p.eventTypeA}-${p.eventTypeB}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono-ui text-sm" style={{ color: "var(--text)" }}>
                {p.eventTypeA} <span style={{ color: "var(--accent)" }}>∿</span> {p.eventTypeB}
              </div>
              <ConfidencePill level={p.confidence} />
            </div>
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              → {p.coactivations} co-activations in window
            </div>
            {p.bothActiveNow && (
              <div className="mt-1">
                <Badge color="amber">● Both active now</Badge>
              </div>
            )}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--panel2)" }}>
              <div className="h-full rounded-full" style={{ width: `${p.strength * 100}%`, background: "var(--violet)" }} />
            </div>
            <div className="mt-1 font-mono-ui text-[10px]" style={{ color: "var(--text-dim)" }}>
              resonance strength {p.strength.toFixed(2)}
            </div>
            <p className="mt-2 text-xs italic" style={{ color: "var(--text-muted)" }}>
              Playbook hint: address both signals in the same intervention or expect partial resolution.
            </p>
            <p className="mt-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
              {p.label}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// SECTION 5 — INERTIA
// ───────────────────────────────────────────────────────────

function InertiaSection({ P, today }: { P: Projection; today: Date }) {
  const [peopleAffected, setPeopleAffected] = useState(P.people.length);
  const [processesAffected, setProcessesAffected] = useState(3);

  const result = useMemo(() => {
    const n = Math.max(0, Math.min(P.people.length, Math.floor(peopleAffected) || 0));
    const personIds = Array.from({ length: n }, (_, i) => P.people[i % P.people.length].id).slice(0, n);
    const processIds = Array.from({ length: Math.max(0, Math.floor(processesAffected) || 0) }, (_, i) => `proc-${i}`);
    return computeChangePhysics("Hypothetical organizational change", personIds, processIds, P, today);
  }, [peopleAffected, processesAffected, P, today]);

  return (
    <section>
      <SectionTitle
        eyebrow="Law 5 of 5 · computeChangePhysics()"
        title="CHANGE INERTIA"
        glyph="◉"
        desc="Estimated resistance to change — a function of tenure, people count, and process complexity."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidencePill level={result.confidence} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            — this is a planning heuristic, not a prediction.
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              People affected
            </span>
            <input
              type="number"
              min={0}
              max={P.people.length}
              value={peopleAffected}
              onChange={(e) => setPeopleAffected(Number(e.target.value))}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono-ui outline-none"
              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--text)" }}
            />
            <span className="mt-1 block text-[11px]" style={{ color: "var(--text-dim)" }}>
              default = current team size ({P.people.length})
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Processes affected
            </span>
            <input
              type="number"
              min={0}
              max={20}
              value={processesAffected}
              onChange={(e) => setProcessesAffected(Number(e.target.value))}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono-ui outline-none"
              style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--text)" }}
            />
            <span className="mt-1 block text-[11px]" style={{ color: "var(--text-dim)" }}>
              each assumed ~4 months old (heuristic)
            </span>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 rounded-lg p-4 sm:grid-cols-3" style={{ background: "var(--panel2)" }}>
          <Stat label="Mass" value={`${result.mass} person-mo`} />
          <Stat
            label="Weeks to embed"
            value={Number.isFinite(result.weeksToEmbed) ? `${result.weeksToEmbed}w` : "∞"}
            sub={Number.isFinite(result.weeksToEmbed) ? `${result.eventsPerWeek} events/wk of leadership attention` : "Insufficient event data to estimate — log more organizational events"}
          />
          <Stat label="Mean tenure" value={`${result.meanTenureMonths} mo`} />
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          "{result.label}"
        </p>
      </Card>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// SECTION 6 — SYNTHESIS
// ───────────────────────────────────────────────────────────

type Level = "LOW" | "MEDIUM" | "HIGH";

function entropyLevel(v: number): Level {
  return v < 30 ? "LOW" : v < 55 ? "MEDIUM" : "HIGH";
}
function energyLevel(v: number): Level {
  return v < 35 ? "LOW" : v < 65 ? "MEDIUM" : "HIGH";
}

function synthesisTemplate(eLvl: Level, nLvl: Level, topDomain: string, problemDomainCount: number, entropyPct: number, energyScore: number) {
  const key = `${eLvl}_${nLvl}`;
  const templates: Record<string, { s1: string; s2: string; s4: string }> = {
    HIGH_LOW: {
      s1: `Problems are distributed across roughly ${problemDomainCount} domains with no single focus point (${entropyPct}% entropy).`,
      s2: `Leadership energy is critically low (${energyScore}/100) — capacity is spent.`,
      s4: "This is the conditions-for-burnout profile: pressure is everywhere, capacity is spent. Do not initiate new change. Clear the backlog.",
    },
    LOW_HIGH: {
      s1: `Problems are concentrated in ${topDomain} (${entropyPct}% entropy) rather than spread thin.`,
      s2: `Leadership energy is strong (${energyScore}/100), with reserves available for focused work.`,
      s4: "This is the optimal profile for targeted intervention: one domain, full capacity. Move now.",
    },
    HIGH_HIGH: {
      s1: `Problems are widely distributed (${entropyPct}% entropy) across roughly ${problemDomainCount} domains.`,
      s2: `Reserves are available (${energyScore}/100) — capacity exists, but it is not self-directing.`,
      s4: "Prioritize ruthlessly — energy can be spent on the wrong problems if entropy misdirects attention. Pick one front.",
    },
    LOW_LOW: {
      s1: `Problems are concentrated, mainly in ${topDomain} (${entropyPct}% entropy).`,
      s2: `Energy is depleted (${energyScore}/100) — there is little capacity to give it right now.`,
      s4: `The ${topDomain} domain needs attention but the org cannot absorb more load. Protect the team while addressing the concentration carefully.`,
    },
    MEDIUM_LOW: {
      s1: `Entropy is moderate (${entropyPct}%) — some domains are noisier than others, led by ${topDomain}.`,
      s2: `Energy is low (${energyScore}/100); there is limited runway for new initiatives.`,
      s4: "Stabilize before expanding scope — address the loudest domain first, and defer anything non-essential.",
    },
    MEDIUM_HIGH: {
      s1: `Entropy is moderate (${entropyPct}%), with ${topDomain} carrying the largest share.`,
      s2: `Energy is strong (${energyScore}/100) — there is real capacity to deploy.`,
      s4: `Lead with ${topDomain} while reserves are high; use the surplus to tighten the other domains before entropy climbs further.`,
    },
    HIGH_MEDIUM: {
      s1: `Entropy is high (${entropyPct}%) — pressure is spread across roughly ${problemDomainCount} domains.`,
      s2: `Energy is moderate (${energyScore}/100) — enough for one deliberate move, not several.`,
      s4: "Choose a single highest-leverage domain and commit fully; a scattered response will drain the moderate reserve fast.",
    },
    LOW_MEDIUM: {
      s1: `Entropy is low (${entropyPct}%) — problems are concentrated in ${topDomain}.`,
      s2: `Energy is moderate (${energyScore}/100) — workable, not abundant.`,
      s4: `Target ${topDomain} directly; the concentration makes this an efficient, bounded intervention.`,
    },
    MEDIUM_MEDIUM: {
      s1: `Entropy sits in the middle band (${entropyPct}%), with ${topDomain} the largest single contributor.`,
      s2: `Energy is balanced (${energyScore}/100) — sustainable, without much slack.`,
      s4: "Hold current cadence, tighten the loudest domain, and reassess before adding new initiatives.",
    },
  };
  return templates[key] ?? templates.MEDIUM_MEDIUM;
}

function SynthesisSection({
  entropy,
  energy,
  alarm,
  alarmFiring,
  topDomain,
  problemDomainCount,
}: {
  entropy: ReturnType<typeof measureOrgEntropy>;
  energy: ReturnType<typeof computeLeadershipEnergyBudget>;
  alarm: ReturnType<typeof measureVelocity> | undefined;
  alarmFiring: boolean;
  topDomain: ReturnType<typeof measureVelocity> | undefined;
  problemDomainCount: number;
}) {
  const eLvl = entropyLevel(entropy.compositeEntropy);
  const nLvl = energyLevel(energy.score);
  const topDomainName = topDomain ? DOMAIN_LABELS[topDomain.domain] : "an unclear domain";
  const tpl = synthesisTemplate(eLvl, nLvl, topDomainName, problemDomainCount, entropy.compositeEntropy, energy.score);

  const s3 = alarmFiring && alarm
    ? `Velocity alarm: ${DOMAIN_LABELS[alarm.domain]} is accelerating at +${alarm.velocity.toFixed(3)}/day, projecting to ${alarm.projectedIn30d.toFixed(1)} within 30 days if nothing changes.`
    : "No domain is currently accelerating past the velocity alarm threshold — rates of change look manageable for now.";

  return (
    <section>
      <SectionTitle eyebrow="Synthesis — generated in code, not by an LLM" title="SYNTHESIS" desc="A four-sentence read of the current physics state, built from deterministic templates keyed on entropy × energy level." />
      <Card className="border-l-4" >
        <ol className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          <li><span className="mr-2 font-mono-ui text-xs" style={{ color: "var(--text-dim)" }}>1</span>{tpl.s1}</li>
          <li><span className="mr-2 font-mono-ui text-xs" style={{ color: "var(--text-dim)" }}>2</span>{tpl.s2}</li>
          <li><span className="mr-2 font-mono-ui text-xs" style={{ color: "var(--text-dim)" }}>3</span>{s3}</li>
          <li><span className="mr-2 font-mono-ui text-xs" style={{ color: "var(--text-dim)" }}>4</span><strong>{tpl.s4}</strong></li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge color={eLvl === "HIGH" ? "red" : eLvl === "MEDIUM" ? "amber" : "green"}>ENTROPY: {eLvl}</Badge>
          <Badge color={nLvl === "LOW" ? "red" : nLvl === "MEDIUM" ? "amber" : "green"}>ENERGY: {nLvl}</Badge>
          {alarmFiring && <Badge color="red">VELOCITY ALARM</Badge>}
        </div>
      </Card>
    </section>
  );
}
