// Event Templates (bundles) — pt-D brief §"Event Templates".
// Each TEMPLATE describes a one-form, multi-event bundle. `build()` turns a
// filled form into an ordered list of event specs — specs only, the caller
// (store.ts `append`) is the single writer, mirroring the real repo's
// verified doctrine ("playbooks never write... event specs ONLY").

export interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox" | "person";
  options?: string[];
  placeholder?: string;
  optional?: boolean;
}

export interface EventSpec {
  type: string;
  payload: Record<string, unknown>;
}

export interface Template {
  id: string;
  label: string;
  command: string;
  shortcut?: string;
  description: string;
  fields: FieldSpec[];
  build: (v: Record<string, string>) => EventSpec[];
  validate?: (v: Record<string, string>) => string | null;
}

export const TEMPLATES: Template[] = [
  {
    id: "WEEKLY_1ON1_BUNDLE",
    label: "Weekly 1:1",
    command: "bundle 1:1",
    shortcut: "B",
    description: "One form → up to four events: 1:1 log, pulse, goal progress, commitment.",
    fields: [
      { name: "personId", label: "Person", type: "person" },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "load", label: "Load (1-5)", type: "number", optional: true },
      { name: "mood", label: "Mood (1-5)", type: "number", optional: true },
      { name: "goal", label: "Goal mentioned", type: "text", optional: true },
      { name: "goalPct", label: "Goal % complete", type: "number", optional: true },
      { name: "commitment", label: "Commitment made to them", type: "text", optional: true },
    ],
    build: (v) => {
      const specs: EventSpec[] = [{ type: "oneonone.logged", payload: { personId: v.personId, notes: v.notes } }];
      if (v.load || v.mood) specs.push({ type: "pulse.recorded", payload: { personId: v.personId, load: Number(v.load) || undefined, mood: Number(v.mood) || undefined } });
      if (v.goal) specs.push({ type: "goal.progress", payload: { personId: v.personId, goal: v.goal, pct: Number(v.goalPct) || 0 } });
      if (v.commitment) specs.push({ type: "commitment.made", payload: { toPersonId: v.personId, text: v.commitment, reviewByDaysOut: 14 } });
      return specs;
    },
    validate: (v) => (!v.personId ? "Select a person." : !v.notes ? "Notes are required." : null),
  },
  {
    id: "SPRINT_CLOSE_BUNDLE",
    label: "Sprint Close",
    command: "bundle sprint close",
    description: "Reviews the current sprint, captures retro actions, opens the next sprint. Cannot close a sprint never started.",
    fields: [
      { name: "team", label: "Team", type: "text" },
      { name: "currentSprintId", label: "Current sprint id", type: "text" },
      { name: "met", label: "Goals met", type: "number" },
      { name: "missed", label: "Goals missed", type: "number" },
      { name: "retroAction", label: "One retro action", type: "text" },
      { name: "nextSprintId", label: "Next sprint id", type: "text" },
      { name: "nextGoals", label: "Next sprint goal count", type: "number" },
    ],
    build: (v) => [
      { type: "sprint.review", payload: { team: v.team, sprintId: v.currentSprintId, met: Number(v.met) || 0, missed: Number(v.missed) || 0 } },
      { type: "sprint.retro.action", payload: { team: v.team, action: v.retroAction } },
      { type: "sprint.started", payload: { team: v.team, sprintId: v.nextSprintId, goals: Number(v.nextGoals) || 0 } },
    ],
    validate: (v) => (!v.currentSprintId ? "A sprint must have been started to close it (no current sprint id)." : null),
  },
  {
    id: "INCIDENT_BUNDLE",
    label: "Incident",
    command: "bundle incident",
    description: "Logs a crisis, opens a war room automatically at sev ≥ 4, drafts incident comms. Fires crisis-response prefill after submit.",
    fields: [
      { name: "crisisType", label: "Incident type", type: "text" },
      { name: "severity", label: "Severity (1-5)", type: "number" },
      { name: "team", label: "Team", type: "text" },
    ],
    build: (v) => {
      const sev = Number(v.severity) || 1;
      const specs: EventSpec[] = [{ type: "crisis.detected", payload: { type: v.crisisType, severity: sev, team: v.team } }];
      if (sev >= 4) specs.push({ type: "war.room.opened", payload: { crisisRef: v.crisisType, team: v.team } });
      specs.push({
        type: "incident.comms.sent",
        payload: { crisisRef: v.crisisType, draft: `[DRAFT] We are investigating a ${v.crisisType} incident affecting ${v.team}. Updates to follow.` },
      });
      return specs;
    },
  },
  {
    id: "OKR_QUARTERLY_BUNDLE",
    label: "OKR Quarter Setup",
    command: "bundle okrs",
    description: "Wizard: N objectives × 3 key results, plus the quarter's KPI review and financial forecast.",
    fields: [
      { name: "objectives", label: "Objectives (comma-separated, 1-5)", type: "text" },
      { name: "period", label: "Period", type: "text" },
      { name: "forecastRevenue", label: "Forecast revenue", type: "number" },
      { name: "forecastCost", label: "Forecast cost", type: "number" },
    ],
    build: (v) => {
      const objectives = v.objectives.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
      const specs: EventSpec[] = objectives.map((o) => ({ type: "strategy.okr.set", payload: { objective: o, period: v.period } }));
      specs.push({ type: "exec.kpi.reviewed", payload: { period: v.period } });
      const revenue = Number(v.forecastRevenue) || 0;
      const cost = Number(v.forecastCost) || 0;
      specs.push({
        type: "fin.forecast.logged",
        payload: { period: v.period, revenue, cost, margin: revenue ? (revenue - cost) / revenue : 0, confidence: 0.6 },
      });
      return specs;
    },
    validate: (v) => (!v.objectives ? "At least one objective is required." : null),
  },
  {
    id: "OFFBOARDING_BUNDLE",
    label: "Offboarding",
    command: "bundle offboarding",
    description: "Leaves documentation, not chaos: attrition reason, owned processes, successor commitment, knowledge-transfer plan.",
    fields: [
      { name: "personId", label: "Person leaving", type: "person" },
      { name: "reason", label: "Reason", type: "text" },
      { name: "process", label: "Process/dependency they owned", type: "text" },
      { name: "successorId", label: "Successor", type: "person", optional: true },
      { name: "lastDayDaysOut", label: "Days until last day", type: "number" },
    ],
    build: (v) => {
      const specs: EventSpec[] = [
        { type: "hr.attrition.logged", payload: { personId: v.personId, reason: v.reason } },
        { type: "key.dependency.logged", payload: { personId: v.personId, process: v.process } },
      ];
      if (v.successorId) {
        specs.push({ type: "succession.candidate", payload: { personId: v.successorId, forRole: v.process } });
        specs.push({ type: "commitment.made", payload: { toPersonId: v.successorId, text: `Transfer: ${v.process}`, reviewByDaysOut: Number(v.lastDayDaysOut) || 14 } });
      }
      specs.push({ type: "plan.created", payload: { kind: "knowledge-transfer", personId: v.personId, reviewByDaysOut: Number(v.lastDayDaysOut) || 14 } });
      return specs;
    },
    validate: (v) => (!v.personId ? "Select the person leaving." : null),
  },
  {
    id: "BOARD_PREP_BUNDLE",
    label: "Board Prep",
    command: "bundle board prep",
    description: "One week before a board meeting: narrative draft, forced KPI review, and a test of the key message.",
    fields: [
      { name: "narrativeNote", label: "Narrative focus", type: "text" },
      { name: "period", label: "Period", type: "text" },
      { name: "testWithPersonId", label: "Test message with", type: "person", optional: true },
    ],
    build: (v) => {
      const specs: EventSpec[] = [
        { type: "narrative.drafted", payload: { type: "board", focus: v.narrativeNote } },
        { type: "exec.kpi.reviewed", payload: { period: v.period } },
      ];
      if (v.testWithPersonId) specs.push({ type: "message.tested", payload: { personId: v.testWithPersonId, context: "board narrative" } });
      return specs;
    },
  },
];
