// Day-1 readiness checklist engine (Part 25 cadence lineage).
// Deterministic template keyed by deal phase, offsets relative to close date.

export type ChecklistTemplateItem = { phase: "diligence" | "announce" | "integrate"; item: string; owner: string; dueOffsetDays: number };

export const DAY1_READINESS_TEMPLATE: ChecklistTemplateItem[] = [
  // Diligence
  { phase: "diligence", item: "Complete culture-distance assessment", owner: "People & Culture", dueOffsetDays: -60 },
  { phase: "diligence", item: "Systems overlap inventory (HRIS, finance, eng tooling)", owner: "IT Integration Lead", dueOffsetDays: -45 },
  { phase: "diligence", item: "Identify change-of-control obligations in key contracts", owner: "Legal", dueOffsetDays: -30 },
  { phase: "diligence", item: "Draft talent-retention risk list (critical roles)", owner: "People & Culture", dueOffsetDays: -21 },
  // Announce
  { phase: "announce", item: "Prepare employee communication sequence (self-first ledger reveal)", owner: "Comms", dueOffsetDays: -7 },
  { phase: "announce", item: "Trigger change-of-control obligation notices", owner: "Legal", dueOffsetDays: -3 },
  { phase: "announce", item: "Stand up integration management office (IMO)", owner: "Integration Lead", dueOffsetDays: -3 },
  { phase: "announce", item: "Publish Day-1 FAQ for affected employees", owner: "Comms", dueOffsetDays: -1 },
  // Integrate
  { phase: "integrate", item: "Day-1: payroll and benefits continuity confirmed", owner: "HR Ops", dueOffsetDays: 0 },
  { phase: "integrate", item: "Day-1: systems access provisioned for retained staff", owner: "IT Integration Lead", dueOffsetDays: 0 },
  { phase: "integrate", item: "Week-1: manager check-ins with all affected employees", owner: "People Managers", dueOffsetDays: 7 },
  { phase: "integrate", item: "30/60/90-day retention pulse survey scheduled", owner: "People & Culture", dueOffsetDays: 30 },
  { phase: "integrate", item: "Synergy tracking vs. Explain<T> estimates begins", owner: "Finance", dueOffsetDays: 30 },
];

export function generateReadinessChecklist(): ChecklistTemplateItem[] {
  return DAY1_READINESS_TEMPLATE;
}
