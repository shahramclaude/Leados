import type { Domain, LeadosEvent, Person } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// eventBrain.project() — pure function: LeadosEvent[] -> BrainProjection
// No side effects, no randomness, no Date.now() reads inside (caller
// supplies `now`). This purity is asserted by self-test T05_PROJECTION_PURE.
// ─────────────────────────────────────────────────────────────────────────

export interface GoalKeyResultState {
  id: string;
  title: string;
  target: number;
  unit: string;
  current: number;
  history: { ts: string; value: number }[];
}

export interface GoalState {
  id: string;
  title: string;
  owner: string;
  quarterStart: string;
  quarterLengthDays: number;
  keyResults: GoalKeyResultState[];
  closed: boolean;
  linkedDecisions: string[];
}

export interface DecisionState {
  id: string;
  title: string;
  domain: Domain;
  openedAt: string;
  outcome: string | null;
  closedAt: string | null;
}

export interface ScenarioState {
  id: string;
  title: string;
  metricKey: string;
  probability: number;
  history: { ts: string; probability: number }[];
}

export interface CompetitorState {
  id: string;
  name: string;
  signals: { ts: string; signal: string; strength: number }[];
}

export interface FinanceSnapshotState {
  ts: string;
  cash: number;
  monthlyBurn: number;
  mrr: number;
  newArr: number;
  churnedArr: number;
  customers: number;
  newCustomers: number;
  cac: number;
  grossMarginPct: number;
  headcount: number;
  rdHeadcountCost: number;
  totalPayroll: number;
  salesSpend: number;
}

export interface ProjectMilestoneState {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  overdue: boolean;
}

export interface BlockerState {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  resolved: boolean;
  raisedAt: string;
  resolvedAt: string | null;
}

export interface ProjectState {
  id: string;
  title: string;
  domain: Domain;
  owner: string;
  status: "backlog" | "in_progress" | "blocked" | "done";
  confidence: number;
  dependsOn: string[];
  durationDays: number;
  createdAt: string;
  milestones: ProjectMilestoneState[];
  blockers: BlockerState[];
}

export interface HypothesisState {
  id: string;
  ruleId: string;
  entityId: string | null;
  createdAt: string;
  confidence: number;
  resolveBy: string;
  statement: string;
  status: "open" | "confirmed" | "refuted";
  resolvedAt: string | null;
}

export interface BrainProjection {
  events: LeadosEvent[];
  people: Person[];
  goals: GoalState[];
  decisions: DecisionState[];
  scenarios: ScenarioState[];
  competitors: CompetitorState[];
  financeSnapshots: FinanceSnapshotState[];
  metrics: Record<string, { ts: string; value: number }[]>;
  projects: ProjectState[];
  hypotheses: HypothesisState[];
  boardNotes: { ts: string; text: string; author: string }[];
  rootCauses: { findingId: string; rootCause: string; ts: string }[];
}

const EXIT_KEYWORDS = [
  "recruiter",
  "counter-offer",
  "counter offer",
  "offer letter",
  "resign",
  "leaving",
  "another company",
  "headhunter",
  "exploring options",
  "job search",
];

export function hasExitSignal(text: string): boolean {
  const t = text.toLowerCase();
  return EXIT_KEYWORDS.some((k) => t.includes(k));
}

function clamp(v: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function project(events: LeadosEvent[]): BrainProjection {
  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);

  const people = new Map<string, Person>();
  const goals = new Map<string, GoalState>();
  const decisions = new Map<string, DecisionState>();
  const scenarios = new Map<string, ScenarioState>();
  const competitors = new Map<string, CompetitorState>();
  const financeSnapshots: FinanceSnapshotState[] = [];
  const metrics: Record<string, { ts: string; value: number }[]> = {};
  const projects = new Map<string, ProjectState>();
  const hypotheses = new Map<string, HypothesisState>();
  const boardNotes: { ts: string; text: string; author: string }[] = [];
  const rootCauses: { findingId: string; rootCause: string; ts: string }[] = [];

  for (const e of sorted) {
    const d = e.data ?? {};
    switch (e.type) {
      case "person.added": {
        const id = str(d.id, e.entityId ?? `p${people.size}`);
        people.set(id, {
          id,
          name: str(d.name, "Unknown"),
          role: str(d.role, "Contributor"),
          domain: (str(d.domain, e.domain) as Domain) ?? e.domain,
          startDate: str(d.startDate, e.ts),
          performance: num(d.performance, 60),
          potential: num(d.potential, 60),
          flightRisk: num(d.flightRisk, 0.1),
          exitSignals: [],
        });
        break;
      }
      case "person.updated": {
        const id = str(d.id, e.entityId ?? "");
        const p = people.get(id);
        if (p) {
          if (d.performance !== undefined) p.performance = num(d.performance, p.performance);
          if (d.potential !== undefined) p.potential = num(d.potential, p.potential);
          if (d.role !== undefined) p.role = str(d.role, p.role);
        }
        break;
      }
      case "person.review": {
        const id = str(d.id, e.entityId ?? "");
        const p = people.get(id);
        if (p) {
          if (d.performance !== undefined) p.performance = num(d.performance, p.performance);
          if (d.potential !== undefined) p.potential = num(d.potential, p.potential);
        }
        break;
      }
      case "person.exit_signal": {
        const id = str(d.id, e.entityId ?? "");
        const p = people.get(id);
        if (p) {
          const text = str(d.text, "");
          p.exitSignals.push(text);
          const bump = hasExitSignal(text) ? 0.22 : 0.08;
          p.flightRisk = clamp(p.flightRisk + bump);
        }
        break;
      }
      case "goal.set": {
        const id = str(d.id, e.entityId ?? `g${goals.size}`);
        const krs = Array.isArray(d.keyResults) ? (d.keyResults as Record<string, unknown>[]) : [];
        goals.set(id, {
          id,
          title: str(d.title, "Objective"),
          owner: str(d.owner, "Unassigned"),
          quarterStart: str(d.quarterStart, e.ts),
          quarterLengthDays: num(d.quarterLengthDays, 90),
          closed: false,
          linkedDecisions: Array.isArray(d.linkedDecisions) ? (d.linkedDecisions as string[]) : [],
          keyResults: krs.map((kr, i) => ({
            id: str(kr.id, `${id}-kr${i}`),
            title: str(kr.title, `KR ${i + 1}`),
            target: num(kr.target, 100),
            unit: str(kr.unit, "unit"),
            current: num(kr.current, 0),
            history: [{ ts: e.ts, value: num(kr.current, 0) }],
          })),
        });
        break;
      }
      case "goal.progress": {
        const goalId = str(d.goalId, "");
        const g = goals.get(goalId);
        if (g) {
          const kr = g.keyResults.find((k) => k.id === str(d.keyResultId, ""));
          if (kr) {
            kr.current = num(d.current, kr.current);
            kr.history.push({ ts: e.ts, value: kr.current });
          }
        }
        break;
      }
      case "goal.closed": {
        const g = goals.get(str(d.goalId, ""));
        if (g) g.closed = true;
        break;
      }
      case "decision.logged": {
        const id = str(d.id, e.entityId ?? `d${decisions.size}`);
        decisions.set(id, {
          id,
          title: str(d.title, "Decision"),
          domain: (str(d.domain, e.domain) as Domain) ?? e.domain,
          openedAt: e.ts,
          outcome: null,
          closedAt: null,
        });
        break;
      }
      case "decision.outcome": {
        const dec = decisions.get(str(d.decisionId, ""));
        if (dec) {
          dec.outcome = str(d.outcome, "resolved");
          dec.closedAt = e.ts;
        }
        break;
      }
      case "commitment.made": {
        const id = str(d.id, e.entityId ?? `c${decisions.size}`);
        decisions.set(id, {
          id,
          title: str(d.title, "Commitment"),
          domain: (str(d.domain, e.domain) as Domain) ?? e.domain,
          openedAt: e.ts,
          outcome: null,
          closedAt: null,
        });
        break;
      }
      case "commitment.resolved": {
        const dec = decisions.get(str(d.id, ""));
        if (dec) {
          dec.outcome = str(d.outcome, "done");
          dec.closedAt = e.ts;
        }
        break;
      }
      case "scenario.created": {
        const id = str(d.id, e.entityId ?? `s${scenarios.size}`);
        scenarios.set(id, {
          id,
          title: str(d.title, "Scenario"),
          metricKey: str(d.metricKey, ""),
          probability: num(d.probability, 0.3),
          history: [{ ts: e.ts, probability: num(d.probability, 0.3) }],
        });
        break;
      }
      case "scenario.probability.updated": {
        const s = scenarios.get(str(d.scenarioId, ""));
        if (s) {
          s.probability = num(d.probability, s.probability);
          s.history.push({ ts: e.ts, probability: s.probability });
        }
        break;
      }
      case "competitor.signal": {
        const id = str(d.competitorId, str(d.name, "unknown"));
        const name = str(d.name, id);
        const c = competitors.get(id) ?? { id, name, signals: [] };
        c.signals.push({ ts: e.ts, signal: str(d.signal, ""), strength: num(d.strength, 0.5) });
        competitors.set(id, c);
        break;
      }
      case "market.move": {
        const id = str(d.mover, "market");
        const c = competitors.get(id) ?? { id, name: id, signals: [] };
        c.signals.push({ ts: e.ts, signal: str(d.move, ""), strength: num(d.strength, 0.6) });
        competitors.set(id, c);
        break;
      }
      case "strategy.board.note": {
        boardNotes.push({ ts: e.ts, text: str(d.text, ""), author: str(d.author, "Board") });
        break;
      }
      case "finance.snapshot": {
        financeSnapshots.push({
          ts: e.ts,
          cash: num(d.cash),
          monthlyBurn: num(d.monthlyBurn),
          mrr: num(d.mrr),
          newArr: num(d.newArr),
          churnedArr: num(d.churnedArr),
          customers: num(d.customers),
          newCustomers: num(d.newCustomers),
          cac: num(d.cac),
          grossMarginPct: num(d.grossMarginPct, 0.7),
          headcount: num(d.headcount),
          rdHeadcountCost: num(d.rdHeadcountCost),
          totalPayroll: num(d.totalPayroll),
          salesSpend: num(d.salesSpend),
        });
        break;
      }
      case "metric.recorded": {
        const key = str(d.key, "");
        if (!key) break;
        (metrics[key] ??= []).push({ ts: e.ts, value: num(d.value) });
        break;
      }
      case "project.created": {
        const id = str(d.id, e.entityId ?? `pr${projects.size}`);
        projects.set(id, {
          id,
          title: str(d.title, "Project"),
          domain: (str(d.domain, e.domain) as Domain) ?? e.domain,
          owner: str(d.owner, "Unassigned"),
          status: "backlog",
          confidence: num(d.confidence, 0.7),
          dependsOn: Array.isArray(d.dependsOn) ? (d.dependsOn as string[]) : [],
          durationDays: num(d.durationDays, 14),
          createdAt: e.ts,
          milestones: [],
          blockers: [],
        });
        break;
      }
      case "project.updated": {
        const p = projects.get(str(d.id, e.entityId ?? ""));
        if (p) {
          if (d.status) p.status = str(d.status, p.status) as ProjectState["status"];
          if (d.confidence !== undefined) p.confidence = num(d.confidence, p.confidence);
        }
        break;
      }
      case "project.snapshot": {
        const p = projects.get(str(d.id, e.entityId ?? ""));
        if (p && d.confidence !== undefined) p.confidence = num(d.confidence, p.confidence);
        break;
      }
      case "project.completed": {
        const p = projects.get(str(d.id, e.entityId ?? ""));
        if (p) p.status = "done";
        break;
      }
      case "milestone.created": {
        const p = projects.get(str(d.projectId, ""));
        if (p) {
          p.milestones.push({
            id: str(d.id, `${p.id}-m${p.milestones.length}`),
            title: str(d.title, "Milestone"),
            dueDate: str(d.dueDate, e.ts),
            completed: false,
            overdue: false,
          });
        }
        break;
      }
      case "milestone.completed": {
        for (const p of projects.values()) {
          const m = p.milestones.find((mm) => mm.id === str(d.id, ""));
          if (m) {
            m.completed = true;
            (m as ProjectMilestoneState & { completedAt?: string }).completedAt = e.ts;
          }
        }
        break;
      }
      case "milestone.overdue": {
        for (const p of projects.values()) {
          const m = p.milestones.find((mm) => mm.id === str(d.id, ""));
          if (m) m.overdue = true;
        }
        break;
      }
      case "blocker.raised": {
        const p = projects.get(str(d.projectId, ""));
        if (p) {
          p.blockers.push({
            id: str(d.id, `${p.id}-b${p.blockers.length}`),
            severity: (str(d.severity, "medium") as BlockerState["severity"]),
            description: str(d.description, ""),
            resolved: false,
            raisedAt: e.ts,
            resolvedAt: null,
          });
          if (p.status !== "done") p.status = "blocked";
        }
        break;
      }
      case "blocker.resolved": {
        for (const p of projects.values()) {
          const b = p.blockers.find((bb) => bb.id === str(d.id, ""));
          if (b) {
            b.resolved = true;
            b.resolvedAt = e.ts;
            if (p.blockers.every((bb) => bb.resolved) && p.status === "blocked") {
              p.status = "in_progress";
            }
          }
        }
        break;
      }
      case "hypothesis.created": {
        const id = str(d.id, e.entityId ?? `h${hypotheses.size}`);
        hypotheses.set(id, {
          id,
          ruleId: str(d.ruleId, ""),
          entityId: d.entityId ? str(d.entityId) : null,
          createdAt: e.ts,
          confidence: num(d.confidence, 0.5),
          resolveBy: str(d.resolveBy, e.ts),
          statement: str(d.statement, ""),
          status: "open",
          resolvedAt: null,
        });
        break;
      }
      case "hypothesis.resolved": {
        const h = hypotheses.get(str(d.id, ""));
        if (h) {
          h.status = d.outcome === "confirmed" ? "confirmed" : "refuted";
          h.resolvedAt = e.ts;
        }
        break;
      }
      case "root_cause.logged": {
        rootCauses.push({ findingId: str(d.findingId, ""), rootCause: str(d.rootCause, ""), ts: e.ts });
        break;
      }
      default:
        break;
    }
  }

  return {
    events: sorted,
    people: [...people.values()],
    goals: [...goals.values()],
    decisions: [...decisions.values()],
    scenarios: [...scenarios.values()],
    competitors: [...competitors.values()],
    financeSnapshots,
    metrics,
    projects: [...projects.values()],
    hypotheses: [...hypotheses.values()],
    boardNotes,
    rootCauses,
  };
}

export function latestFinance(p: BrainProjection): FinanceSnapshotState | null {
  if (p.financeSnapshots.length === 0) return null;
  return p.financeSnapshots[p.financeSnapshots.length - 1];
}
