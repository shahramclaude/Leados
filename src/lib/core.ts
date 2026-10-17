// src/lib/core.ts
// Core event-log + projection layer for this rebuild of LeadOS.
//
// PROVENANCE NOTE: DOMAINS, DECAY, CORRELATION_WINDOW_DAYS, DECISION_MAX_OPEN_DAYS
// and the localStorage key name below were copied from values independently
// confirmed, in this session, by downloading the real file
// raw.githubusercontent.com/wbweve/Leados/main/index.html with curl and
// grepping it directly (not from the repo's own README prose, and not from
// a user-supplied summary). Everything else in this file — the TypeScript
// types, the event shapes, the exact projection math — is a fresh
// implementation for this React/Vite/Tailwind sandbox, not a port of the
// original vanilla-JS file's internals (which this session did not fully
// read line-by-line). See AI-SESSION-LOG.md for the full verification ledger.

export const DOMAINS = ["people", "finance", "ops", "strategy", "legal", "product"] as const;
export type DomainKey = (typeof DOMAINS)[number];

export const DECAY = 0.85; // verified constant, see provenance note above
export const CORRELATION_WINDOW_DAYS = 90; // verified constant
export const DECISION_MAX_OPEN_DAYS = 21; // verified constant
export const STORAGE_KEY = "leados-pt-j:data"; // verified constant (localStorage)
export const FAMILIARITY_KEY = "leados-pt-j:familiarity"; // verified constant (sessionStorage)
export const FAMILIARITY_NOTIFIED_KEY = "leados-pt-j:familiarity-notified"; // verified constant (sessionStorage)

export type Severity = "low" | "medium" | "high" | "critical";

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
};

export interface FindingEvent {
  id: string;
  type: "finding.created" | "finding.resolved";
  ts: number;
  domain: DomainKey;
  findingId: string;
  title?: string;
  detail?: string;
  severity?: Severity;
}

export interface DecisionEvent {
  id: string;
  type: "decision.logged";
  ts: number;
  domain: DomainKey;
  decisionId: string;
  title: string;
  impact: number; // 1..5, fabricated-but-disclosed scale
  reversibility: number; // 1..5
}

export interface SynthesisEvent {
  id: string;
  type: "synthesis.generated";
  ts: number;
  text: string;
  eventCountAtGeneration: number;
}

export type AnyEvent = FindingEvent | DecisionEvent | SynthesisEvent;

export interface Meta {
  idSeq: number;
  createdAt: number;
  densityMode: "COMPACT" | "STANDARD" | "COMFORTABLE" | "READING";
}

export interface StoreState {
  events: AnyEvent[];
  meta: Meta;
}

function emptyState(): StoreState {
  return {
    events: [],
    meta: { idSeq: 1, createdAt: Date.now(), densityMode: "STANDARD" },
  };
}

export function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events) || !parsed.meta) return emptyState();
    // additive-field defaulting, same policy the source repo documents for meta.densityMode
    if (!parsed.meta.densityMode) parsed.meta.densityMode = "STANDARD";
    return parsed as StoreState;
  } catch {
    return emptyState();
  }
}

export function saveState(state: StoreState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function nextId(state: StoreState, prefix: string): string {
  const id = `${prefix}_${state.meta.idSeq}`;
  state.meta.idSeq += 1;
  return id;
}

/** Append-only: never mutates or removes existing events. */
export function appendEvent(state: StoreState, event: AnyEvent): StoreState {
  const next: StoreState = { ...state, events: [...state.events, event] };
  saveState(next);
  return next;
}

export function seedIfEmpty(state: StoreState): StoreState {
  if (state.events.length > 0) return state;
  const now = Date.now();
  const day = 86400000;
  const seeds: Array<Omit<FindingEvent, "id" | "type" | "ts"> & { ageDays: number; severity: Severity }> = [
    { domain: "people", findingId: "f1", title: "1:1 cadence slipping with Ana", detail: "3 of last 4 scheduled 1:1s moved or skipped.", severity: "high", ageDays: 1 },
    { domain: "finance", findingId: "f2", title: "Q3 vendor spend 18% over forecast", detail: "Driven by one contract renewal.", severity: "critical", ageDays: 2 },
    { domain: "ops", findingId: "f3", title: "Deploy frequency down 40% this sprint", detail: "Correlates with on-call rotation change.", severity: "medium", ageDays: 5 },
    { domain: "strategy", findingId: "f4", title: "Roadmap bet #2 has no owner", detail: "Flagged in last planning doc, unassigned since.", severity: "medium", ageDays: 9 },
    { domain: "legal", findingId: "f5", title: "DPA renewal due in 12 days", detail: "Counterpart has not responded in 6 days.", severity: "low", ageDays: 3 },
    { domain: "product", findingId: "f6", title: "Churn ticked up in SMB segment", detail: "+0.6pp MoM, concentrated in one cohort.", severity: "high", ageDays: 0 },
  ];
  let st = state;
  for (const s of seeds) {
    const id = nextId(st, "ev");
    st = {
      ...st,
      events: [
        ...st.events,
        {
          id,
          type: "finding.created",
          ts: now - s.ageDays * day,
          domain: s.domain,
          findingId: s.findingId,
          title: s.title,
          detail: s.detail,
          severity: s.severity,
        },
      ],
    };
  }
  saveState(st);
  return st;
}

export interface ProjectedFinding {
  findingId: string;
  domain: DomainKey;
  title: string;
  detail: string;
  severity: Severity;
  createdAt: number;
  resolved: boolean;
  resolvedAt?: number;
  ageDays: number;
}

export interface ProjectedDomainScore {
  domain: DomainKey;
  score: number; // sum of severityWeight * DECAY^ageDays over unresolved findings
  openFindings: number;
}

export interface ProjectedDecision {
  decisionId: string;
  domain: DomainKey;
  title: string;
  impact: number;
  reversibility: number;
  createdAt: number;
  openDays: number;
  stale: boolean; // openDays > DECISION_MAX_OPEN_DAYS
  quadrant: "fast-call" | "escalate" | "delegate" | "deliberate"; // fabricated, disclosed rule
}

export interface Projection {
  findings: ProjectedFinding[];
  domainScores: ProjectedDomainScore[];
  decisions: ProjectedDecision[];
  synthesisCount: number;
}

/** Recomputed from the raw event array on every call. Nothing derived is stored. */
export function project(state: StoreState): Projection {
  const now = Date.now();
  const day = 86400000;
  const findingsById = new Map<string, ProjectedFinding>();

  for (const ev of state.events) {
    if (ev.type === "finding.created") {
      findingsById.set(ev.findingId, {
        findingId: ev.findingId,
        domain: ev.domain,
        title: ev.title || "(untitled finding)",
        detail: ev.detail || "",
        severity: ev.severity || "low",
        createdAt: ev.ts,
        resolved: false,
        ageDays: (now - ev.ts) / day,
      });
    } else if (ev.type === "finding.resolved") {
      const f = findingsById.get(ev.findingId);
      if (f) {
        f.resolved = true;
        f.resolvedAt = ev.ts;
      }
    }
  }

  const findings = Array.from(findingsById.values()).sort((a, b) => b.createdAt - a.createdAt);

  const domainScores: ProjectedDomainScore[] = DOMAINS.map((domain) => {
    const open = findings.filter((f) => f.domain === domain && !f.resolved);
    const score = open.reduce((sum, f) => {
      const weight = SEVERITY_WEIGHT[f.severity] * Math.pow(DECAY, f.ageDays);
      return sum + weight;
    }, 0);
    return { domain, score: Math.round(score * 100) / 100, openFindings: open.length };
  });

  const decisions: ProjectedDecision[] = state.events
    .filter((ev): ev is DecisionEvent => ev.type === "decision.logged")
    .map((ev) => {
      const openDays = (now - ev.ts) / day;
      // Fabricated-and-disclosed quadrant rule: impact x reversibility (inverse).
      const highImpact = ev.impact >= 3;
      const lowReversibility = ev.reversibility <= 2;
      let quadrant: ProjectedDecision["quadrant"] = "delegate";
      if (highImpact && lowReversibility) quadrant = "deliberate";
      else if (highImpact && !lowReversibility) quadrant = "fast-call";
      else if (!highImpact && lowReversibility) quadrant = "escalate";
      return {
        decisionId: ev.decisionId,
        domain: ev.domain,
        title: ev.title,
        impact: ev.impact,
        reversibility: ev.reversibility,
        createdAt: ev.ts,
        openDays: Math.round(openDays * 10) / 10,
        stale: openDays > DECISION_MAX_OPEN_DAYS,
        quadrant,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const synthesisCount = state.events.filter((e) => e.type === "synthesis.generated").length;

  return { findings, domainScores, decisions, synthesisCount };
}
