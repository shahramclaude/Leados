// ═══════════════════════════════════════════════════════════════
// Leados — Core Types
// Event-sourced architecture: the event log in localStorage is the
// single source of truth. Nothing here is backed by a database.
// ═══════════════════════════════════════════════════════════════

export type ISODate = string;

/** Quoted exactly — the canonical Person record shape. */
export interface Person {
  id: string;
  name: string;
  title: string;
  reportsTo: string | null;
}

export interface Goal {
  id: string;
  personId: string;
  text: string;
  targetDate?: ISODate;
}

export interface Commitment {
  id: string;
  personId: string;
  text: string;
  byDate: ISODate;
}

// ─── Extended person-domain records (folded from events) ─────────

export interface OneOneRecord {
  id: string;
  personId: string;
  date: ISODate;
  notes: string;
  sentiment: -1 | 0 | 1;
  topics: string[];
  actionItems: string[];
  actionItemsResolved: boolean;
}

export interface PulseRecord {
  id: string;
  personId: string;
  date: ISODate;
  mood: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export interface CommitmentRecord {
  id: string;
  personId: string;
  text: string;
  madeDate: ISODate;
  byDate: ISODate;
  resolved: boolean;
  resolvedDate?: ISODate;
}

export interface GoalRecord {
  id: string;
  personId: string;
  text: string;
  targetDate?: ISODate;
  progress: number; // 0-100
  status: 'open' | 'achieved' | 'abandoned';
  lastUpdated: ISODate;
}

export interface PerformanceRecord {
  id: string;
  personId: string;
  period: string;
  score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  reviewer: string;
  date: ISODate;
}

export interface SuccessionNomination {
  incumbentId: string;
  nomineeId: string;
  role: string;
  nominatorId: string;
  readiness?: number;
  date: ISODate;
}

// ─── Event system ──────────────────────────────────────────────

export type LeadosEventType =
  | 'person.added'
  | 'person.updated'
  | 'person.oneone.logged'
  | 'person.pulse.logged'
  | 'person.flight.signal'
  | 'person.commitment.made'
  | 'person.commitment.resolved'
  | 'person.goal.set'
  | 'person.goal.progress'
  | 'person.goal.closed'
  | 'person.skill.added'
  | 'person.performance.logged'
  | 'person.succession.nominated'
  | 'person.ooo.logged';

export interface PersonAddedPayload {
  personId: string;
  name: string;
  title: string;
  reportsTo: string | null;
}

export interface PersonUpdatedPayload {
  personId: string;
  name?: string;
  title?: string;
  reportsTo?: string | null;
}

export interface OneOnePayload {
  personId: string;
  date: ISODate;
  notes: string;
  sentiment: -1 | 0 | 1;
  topics: string[];
  actionItems: string[];
  actionItemsResolved?: boolean;
}

export interface PulsePayload {
  personId: string;
  date: ISODate;
  mood: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export interface FlightSignalPayload {
  personId: string;
  date: ISODate;
  note?: string;
}

export interface CommitmentMadePayload {
  personId: string;
  commitmentId: string;
  text: string;
  byDate: ISODate;
}

export interface CommitmentResolvedPayload {
  personId: string;
  commitmentId: string;
  resolvedDate: ISODate;
}

export interface GoalSetPayload {
  personId: string;
  goalId: string;
  text: string;
  targetDate?: ISODate;
}

export interface GoalProgressPayload {
  personId: string;
  goalId: string;
  progress: number;
  note?: string;
  date: ISODate;
}

export interface GoalClosedPayload {
  personId: string;
  goalId: string;
  outcome: 'achieved' | 'abandoned';
  date: ISODate;
}

export interface SkillAddedPayload {
  personId: string;
  skill: string;
  date: ISODate;
}

export interface PerformancePayload {
  personId: string;
  period: string;
  score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  reviewer: string;
  date: ISODate;
}

export interface SuccessionPayload {
  incumbentId: string;
  nomineeId: string;
  role: string;
  nominatorId: string;
  readiness?: number;
  date: ISODate;
}

export interface OOOPayload {
  personId: string;
  date: ISODate;
}

export type LeadosEventPayload =
  | PersonAddedPayload
  | PersonUpdatedPayload
  | OneOnePayload
  | PulsePayload
  | FlightSignalPayload
  | CommitmentMadePayload
  | CommitmentResolvedPayload
  | GoalSetPayload
  | GoalProgressPayload
  | GoalClosedPayload
  | SkillAddedPayload
  | PerformancePayload
  | SuccessionPayload
  | OOOPayload;

export interface LeadosEvent<T extends LeadosEventPayload = LeadosEventPayload> {
  id: string;
  type: LeadosEventType;
  timestamp: ISODate;
  payload: T;
}

// ─── Projection ────────────────────────────────────────────────

export interface PersonState extends Person {
  addedAt: ISODate;
  directReports: string[];
  tenureDays: number;
  lastOneOneAt: ISODate | null;
  oneOnes: OneOneRecord[];
  pulses: PulseRecord[];
  flightSignalDates: ISODate[];
  flightSignals: number;
  commitments: CommitmentRecord[];
  goals: GoalRecord[];
  skills: string[];
  skillAddedDates: ISODate[];
  performanceHistory: PerformanceRecord[];
  successors: string[]; // ids of people nominated to succeed THIS person
  successionFor: string[]; // roles this person has been nominated for
  oooDates: ISODate[];
}

export interface BrainProjection {
  people: PersonState[];
  generatedAt: ISODate;
}
