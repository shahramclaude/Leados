// Shared types for the LEADOS federated-scenario / living-strategy build.
// ORIGINAL to this session. Not copied from github.com/wbweve/Leados (verified
// that repo has no equivalent bayesian/wargame/finIntel/scenario/livingDocs
// modules — see README "Provenance" section).

export type EventType =
  | 'hr.attrition.logged'
  | 'pulse.mood.logged'
  | 'oneonone.logged'
  | 'fin.kpi.logged'
  | 'sales.deal.won'
  | 'sales.deal.lost'
  | 'strategy.doc';

export interface LeadosEvent {
  id: string;
  type: EventType;
  ts: string; // ISO date
  data: Record<string, any>;
  simulated?: boolean;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  managerId?: string | null;
  archived?: boolean;
}

export interface AppState {
  people: Person[];
  events: LeadosEvent[];
}

// The "projected" view the whole engine operates on (LEADOS.events.project)
export interface Projection {
  state: AppState;
  people: Person[]; // active (non-archived) people
}

export interface Assumption {
  id: string;
  statement: string;
  metric: string;
  threshold: number;
  operator: 'gte' | 'lte' | 'eq';
  critical?: boolean;
}

export interface StrategyDocData {
  title: string;
  version: number;
  assumptions: Assumption[];
  objectives: string[];
  validUntil: string;
  ownerId?: string;
}

export interface Finding {
  id: string;
  title: string;
  sev: 1 | 2 | 3 | 4 | 5;
  category: string;
}
