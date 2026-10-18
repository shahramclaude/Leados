// Shared types for LeadOS pt-Q.
// ORIGINAL to this build — no verified equivalent was found in github.com/wbweve/Leados
// (see AI-SESSION-LOG.md for the inspection that led to this conclusion).

export type Level = 'direct' | 'skip';

export interface Person {
  id: string;
  name: string;
  title: string;
  team: string;
  level: Level;
  cadenceDays: number;
  startDate: string; // ISO
  archived?: boolean;
}

export type EventType =
  | 'pulse.logged'
  | 'feedback.logged'
  | 'oneonone.logged'
  | 'conflict.logged'
  | 'growthplan.opened'
  | 'growthplan.closed'
  | 'hr.attrition.logged'
  | 'causal.annotation'
  | 'collab.logged'
  | 'meeting.logged';

export interface LeadEvent {
  id: string;
  type: EventType;
  ts: string; // ISO date
  data: Record<string, any>;
}

export interface AppState {
  events: LeadEvent[];
  people: Person[];
}

export interface PulseRow { ts: string; mood: number; load?: number; }
export interface FeedbackRow { ts: string; polarity: 'positive' | 'negative'; note?: string; }
export interface PlanRow { personId: string; planId: string; }

export interface Projection {
  state: AppState;
  people: Person[];
  directs: Person[];
  skips: Person[];
  peopleById: Record<string, Person>;
  pulsesByPerson: Record<string, PulseRow[]>;
  feedbackByPerson: Record<string, FeedbackRow[]>;
  oneononeLast: Record<string, { ts: string }>;
  openPlans: PlanRow[];
  openGoals: any[];
}
