/**
 * Mission Control: one operating model, five genuinely different jobs.
 * ADR-0080. This registry adds no second workflow engine: interventions use
 * Action Bundles, responsibility uses the Command Chain, and disclosure uses
 * the Operating Seat. All limits and rank windows are explicit.
 */
export const MISSION_VERSION = 'mission-control-2026.11-v1';
export const MISSION_LIMITS = Object.freeze({ briefs: 60, queue: 40, cells: 100, floor: 5 });
export const MISSION_EVENTS = Object.freeze({ SCAN: 'mission.scan', FROZEN: 'mission.brief_frozen' });
export const MISSION_RULES = Object.freeze({ ROLLUP: 'RULE-MIS-01' });
export const MISSION_PANELS = Object.freeze(['now', 'hierarchy', 'interventions', 'brief']);
export const MISSION_PROFILES = Object.freeze({
  1: Object.freeze({ title: 'Make this week work', horizon: 'This week', focus: 'Clarity, coaching and follow-through', question: 'What must I unblock before the next shift?', commands: Object.freeze(['decision', 'delegation', 'coaching']), reviewDays: 7 }),
  2: Object.freeze({ title: 'Coordinate the teams', horizon: 'This month', focus: 'Cross-team dependencies and accountable ownership', question: 'Where does work cross a boundary, and who owns the handoff?', commands: Object.freeze(['decision', 'delegation', 'premise']), reviewDays: 14 }),
  3: Object.freeze({ title: 'Align the system', horizon: 'This quarter', focus: 'Strategy alignment, talent pipelines and shared risk', question: 'Which recurring constraint needs a structural response?', commands: Object.freeze(['decision', 'delegation', 'premise', 'comms']), reviewDays: 30 }),
  4: Object.freeze({ title: 'Choose the portfolio', horizon: 'This half-year', focus: 'Investment choices, enterprise risk and leadership capacity', question: 'Which commitment deserves scarce capital and leadership attention?', commands: Object.freeze(['decision', 'delegation', 'premise', 'budget', 'comms']), reviewDays: 90 }),
  5: Object.freeze({ title: 'Steward the enterprise', horizon: 'This year', focus: 'Enterprise resilience, leadership bench and board accountability', question: 'What must the enterprise decide now, and what evidence supports it?', commands: Object.freeze(['decision', 'delegation', 'premise', 'budget', 'comms']), reviewDays: 90 }),
});
export const MISSION_DISCLOSURE = Object.freeze({
  local: 'Local workflow boundary, not authenticated multi-user security. Anyone controlling this browser or a full backup can access the workspace.',
  aggregate: 'Individual notes, conflict records and pulse responses are excluded. Senior views use span-level aggregates; small cells and their complements are withheld.',
  simulation: 'A rehearsal executes the actual commands in a disposable workspace. Its diff is a software effect, not a causal prediction or a guarantee of business outcomes.',
  brief: 'A frozen brief is a dated, identity-free reading of recorded work, not an audit opinion. Interval totals are intentional: publishing an exact parent total could reveal a suppressed child.',
});
export function missionProfile(rank) { return MISSION_PROFILES[rank] || MISSION_PROFILES[1]; }
