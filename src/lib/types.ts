// src/lib/types.ts
//
// Data model for this delivery's event log + org roster.
// ORIGINAL to this sandbox session (pt-L). Not copied from, or a port of,
// anything found in github.com/wbweve/Leados — see AI-SESSION-LOG.md.

export type Level = "self" | "direct" | "skip";

export interface Person {
  id: string;
  name: string;
  role: string;
  team: string;
  level: Level;
}

export interface OrgEvent {
  id: string;
  type: string;
  ts: string; // ISO date string, e.g. "2026-01-15"
  data: Record<string, any>;
}

export interface ProjectionState {
  events: OrgEvent[];
}

export interface Projection {
  self: Person;
  directs: Person[];
  skips: Person[];
  state: ProjectionState;
}

export interface Finding {
  key: string;
  rule: string;
  domain: string;
  sev: number; // 1 (low) .. 4 (critical)
  ts: string;
  title: string;
  detail: string;
  sources: string[]; // event ids this finding was derived from
}

export interface EngineResult {
  findings: Finding[];
}
