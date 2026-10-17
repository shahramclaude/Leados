// Core data model for LeadOS pt-O.
//
// PROVENANCE NOTE (read this before assuming any of this is "the real LeadOS"):
// This shape is an ORIGINAL implementation written to satisfy the behavior
// described in the task's pasted "pt-O" wargaming spec. It is not copied from
// github.com/wbweve/Leados. See AI-SESSION-LOG.md / the in-app "About" page
// for exactly what was and was not verified against that repo this session.

export interface LeadEvent {
  id: string;
  ts: string; // ISO-8601 timestamp
  type: string; // e.g. "competitor.logged", "wargame.scenario"
  data: Record<string, any>;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  archived?: boolean;
}

export interface Deal {
  id: string;
  name: string;
  value: number;
  stage: string;
}

export interface Okr {
  id: string;
  objective: string;
}

export interface Projection {
  people: Person[];
  openOkrs: Okr[];
  openDeals: Deal[];
  state: { events: LeadEvent[] };
}

export interface Finding {
  id: string;
  title: string;
  sev: 1 | 2 | 3 | 4 | 5;
  domain: string;
  detail: string;
}

export interface AppState {
  events: LeadEvent[];
  people: Person[];
  openOkrs: Okr[];
  openDeals: Deal[];
}
