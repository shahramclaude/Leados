// ─────────────────────────────────────────────────────────────────────────
// Probabilistic-ish rule engine ("Part 1" intelligence engine).
//
// Reads the append-only event log + roster and produces a list of Finding
// objects. This module is pure and deterministic for a given (events,
// roster, today) triple — it never mutates its inputs and performs no I/O.
// ─────────────────────────────────────────────────────────────────────────
import type { AppState, Domain, Finding, LeadosEvent, Person, Severity } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

function latestByType(events: LeadosEvent[], type: string, personId?: string): LeadosEvent | undefined {
  return events
    .filter((e) => e.type === type && (personId === undefined || e.personId === personId))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Run the full inference pass over current state, producing active findings. */
export function runInference(state: AppState, today: Date = new Date()): Finding[] {
  const findings: Finding[] = [];
  const { events, roster } = state;

  findings.push(...peopleFindings(events, roster, today));
  findings.push(...financeFindings(events, today));
  findings.push(...salesFindings(events, today));
  findings.push(...opsFindings(events, today));
  findings.push(...strategyFindings(events, today));

  return findings.sort((a, b) => b.sev - a.sev);
}

function sev(n: number): Severity {
  return Math.max(1, Math.min(5, Math.round(n))) as Severity;
}

// ───────────────────────── people ─────────────────────────
function peopleFindings(events: LeadosEvent[], roster: Person[], today: Date): Finding[] {
  const out: Finding[] = [];

  for (const person of roster) {
    const flag = latestByType(events, "hr.flightrisk.flag", person.id);
    if (flag && daysBetween(today, flag.occurredAt) <= 45) {
      out.push({
        key: `flight_risk:${person.id}`,
        rule: "flight_risk",
        domain: "people",
        sev: 5,
        personId: person.id,
        personName: person.name,
        title: `Flight risk flagged: ${person.name}`,
        detail: `${person.name} (${person.role}) was flagged as a flight risk ${Math.round(
          daysBetween(today, flag.occurredAt),
        )} day(s) ago.`,
        suggestedAction: "Schedule a retention 1:1 within 3 business days.",
        probability: 0.82,
      });
    }

    const decline = events
      .filter((e) => e.type === "engagement.decline" && e.personId === person.id)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    if (decline && daysBetween(today, decline.occurredAt) <= 30) {
      out.push({
        key: `engagement_decline:${person.id}`,
        rule: "engagement_decline",
        domain: "people",
        sev: 3,
        personId: person.id,
        personName: person.name,
        title: `Engagement decline: ${person.name}`,
        detail: `Pulse/engagement signals for ${person.name} have trended down in the last 30 days.`,
        suggestedAction: "Check in during next 1:1 and review workload.",
        probability: 0.6,
      });
    }

    const lastOneOnOne = latestByType(events, "people.oneonone.logged", person.id);
    const sinceLast = lastOneOnOne ? daysBetween(today, lastOneOnOne.occurredAt) : daysBetween(today, person.tenureStartAt);
    if (sinceLast >= 21) {
      out.push({
        key: `cadence_slip:${person.id}`,
        rule: "cadence_slip",
        domain: "people",
        sev: sinceLast >= 35 ? 4 : 2,
        personId: person.id,
        personName: person.name,
        title: `Overdue 1:1: ${person.name}`,
        detail: `${Math.round(sinceLast)} day(s) since the last logged 1:1 with ${person.name}.`,
        suggestedAction: "Book a 1:1 this week.",
        probability: 0.5,
      });
    }
  }

  const attritions = events.filter((e) => e.type === "hr.attrition" && daysBetween(today, e.occurredAt) <= 60);
  if (attritions.length >= 2) {
    out.push({
      key: "attrition_cluster",
      rule: "attrition_cluster",
      domain: "people",
      sev: 4,
      title: "Attrition cluster detected",
      detail: `${attritions.length} departures logged in the last 60 days.`,
      suggestedAction: "Review team-level retention drivers with HRBP.",
      probability: 0.7,
    });
  }

  return out;
}

// ───────────────────────── finance ─────────────────────────
function financeFindings(events: LeadosEvent[], today: Date): Finding[] {
  const out: Finding[] = [];
  const snap = latestByType(events, "fin.runway.snapshot");
  if (snap) {
    const months = num(snap.data.months, 999);
    if (months <= 9) {
      out.push({
        key: "runway_low",
        rule: "runway_low",
        domain: "finance",
        sev: months <= 4 ? 5 : months <= 6 ? 4 : 3,
        title: `Runway at ${months.toFixed(1)} months`,
        detail: `Latest cash runway snapshot shows ${months.toFixed(1)} months remaining.`,
        suggestedAction: "Revisit burn rate and financing timeline with finance lead.",
        probability: 0.75,
      });
    }
  }
  const drop = latestByType(events, "fin.runway.drop");
  if (drop && daysBetween(today, drop.occurredAt) <= 30) {
    out.push({
      key: "runway_drop",
      rule: "runway_drop",
      domain: "finance",
      sev: 4,
      title: "Sudden runway drop",
      detail: `A material drop in runway was logged ${Math.round(daysBetween(today, drop.occurredAt))} day(s) ago.`,
      suggestedAction: "Audit recent spend for one-off or recurring increases.",
      probability: 0.65,
    });
  }
  return out;
}

// ───────────────────────── sales ─────────────────────────
function salesFindings(events: LeadosEvent[], today: Date): Finding[] {
  const out: Finding[] = [];
  const snap = latestByType(events, "sales.pipeline.snapshot");
  if (snap) {
    const coverage = num(snap.data.coverage, 999);
    if (coverage < 3) {
      out.push({
        key: "pipeline_thin",
        rule: "pipeline_thin",
        domain: "sales",
        sev: coverage < 1.5 ? 5 : coverage < 2.2 ? 4 : 3,
        title: `Pipeline coverage at ${coverage.toFixed(1)}x`,
        detail: `Pipeline coverage ratio of ${coverage.toFixed(1)}x is below the 3x healthy threshold.`,
        suggestedAction: "Prioritize top-of-funnel generation this cycle.",
        probability: 0.68,
      });
    }
  }
  return out;
}

// ───────────────────────── ops ─────────────────────────
function opsFindings(events: LeadosEvent[], today: Date): Finding[] {
  const out: Finding[] = [];
  const recentIncidents = events.filter((e) => e.type === "ops.incident" && daysBetween(today, e.occurredAt) <= 7);
  if (recentIncidents.length >= 2) {
    out.push({
      key: "incident_cluster",
      rule: "incident_cluster",
      domain: "ops",
      sev: sev(2 + recentIncidents.length),
      title: `${recentIncidents.length} ops incidents in 7 days`,
      detail: `Incident frequency is elevated: ${recentIncidents.length} incident(s) logged in the trailing week.`,
      suggestedAction: "Run a blameless post-mortem and check on-call load.",
      probability: 0.7,
    });
  }
  return out;
}

// ───────────────────────── strategy ─────────────────────────
function strategyFindings(events: LeadosEvent[], today: Date): Finding[] {
  const out: Finding[] = [];
  const escalations = new Map<string, LeadosEvent>();
  for (const e of events) {
    if (e.type === "decision.escalate") escalations.set(String(e.data.decisionId ?? e.id), e);
  }
  for (const e of events) {
    if (e.type === "decision.resolved") escalations.delete(String(e.data.decisionId ?? e.id));
  }
  for (const [decisionId, e] of escalations) {
    const age = daysBetween(today, e.occurredAt);
    if (age >= 5) {
      out.push({
        key: `stale_escalation:${decisionId}`,
        rule: "stale_escalation",
        domain: "strategy",
        sev: age >= 10 ? 5 : 3,
        title: "Escalated decision unresolved",
        detail: `Decision escalated ${Math.round(age)} day(s) ago is still open.`,
        suggestedAction: "Bring to next leadership sync for a ruling.",
        probability: 0.72,
      });
    }
  }
  return out;
}

export function findingDomain(f: Finding): Domain {
  return f.domain;
}
