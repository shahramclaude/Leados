// Versioned registry of every event type the system accepts. Adding a new
// event type/version means adding an entry here AND a matching zod schema in
// `eventSchema.ts` — the two are checked together by `getEventDefinition`.

export interface EventDefinition {
  type: string;
  version: number;
  description: string;
}

export const EVENT_CATALOG: readonly EventDefinition[] = [
  { type: "system.ping", version: 1, description: "Liveness/smoke event." },
  {
    type: "onboarding.completed",
    version: 1,
    description: "An organization finished onboarding.",
  },
  {
    type: "signal.captured",
    version: 1,
    description: "A raw observation/signal was captured for triage.",
  },
  {
    type: "finding.created",
    version: 1,
    description: "A scored finding was created from one or more signals.",
  },
  {
    type: "decision.belief_updated",
    version: 1,
    description: "A decision's Bayesian belief was updated with new evidence.",
  },
  {
    type: "automation.run_completed",
    version: 1,
    description: "An automation run (e.g. a Monte Carlo forecast) completed.",
  },
  {
    type: "boardpack.generated",
    version: 1,
    description: "A board pack export was generated.",
  },
] as const;

export function findEventDefinition(type: string, version: number): EventDefinition | undefined {
  return EVENT_CATALOG.find((e) => e.type === type && e.version === version);
}
