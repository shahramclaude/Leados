/**
 * STAND-IN for Part 12's playbook library + memory.
 *
 * This repository snapshot does not contain Part 12's module
 * (`src/lib/playbooks*` did not exist prior to this change — confirmed by
 * `grep_files`/`list_files` before writing). Part 51 depends on a playbook
 * catalog to build interventions from, so this file ships a minimal, clearly
 * labelled bridge with the shape Part 12 is expected to expose:
 *
 *   getPlaybook(id): Playbook | undefined
 *   listPlaybooks(): Playbook[]
 *
 * When Part 12 lands for real, delete this file's seed data and re-point
 * `src/lib/recommender/registry.ts`'s import at the real module — the rest of
 * Part 51 only depends on the `Playbook` shape below, not on this file.
 */

export type PlaybookCategory =
  | "communication"
  | "delegation"
  | "feedback"
  | "planning"
  | "culture"
  | "structure";

export interface Playbook {
  id: string;
  title: string;
  category: PlaybookCategory;
  description: string;
  /** Partial context matchers this play is generally aimed at. */
  applicableContexts: Record<string, string[]>[];
  /** Hard preconditions — if violated, the play should not be offered. */
  preconditions: Array<{ key: string; in?: string[]; notIn?: string[] }>;
  costUnit: "hours" | "dollars" | "effort_points";
  costAmount: number;
  reversibility: "easy" | "moderate" | "hard";
  effort: "low" | "medium" | "high";
  /** Evidence class before any org-specific measurement exists. */
  priorEvidenceClass: "anecdotal" | "correlational" | "experimental" | "causal_replicated";
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "weekly-1on1-cadence",
    title: "Install a weekly 1:1 cadence",
    category: "communication",
    description:
      "Managers hold a fixed, rarely-cancelled 30-minute 1:1 with each direct report every week, agenda owned by the report.",
    applicableContexts: [{ managementStyleCurrent: ["directive", "hands-off"] }],
    preconditions: [{ key: "teamSize", notIn: ["solo"] }],
    costUnit: "hours",
    costAmount: 2,
    reversibility: "easy",
    effort: "low",
    priorEvidenceClass: "correlational",
  },
  {
    id: "async-standup",
    title: "Switch standup to async written format",
    category: "communication",
    description: "Replace a live daily standup with an async written update in a shared channel.",
    applicableContexts: [{ workMode: ["remote", "hybrid"] }],
    preconditions: [{ key: "workMode", notIn: ["colocated"] }],
    costUnit: "hours",
    costAmount: 1,
    reversibility: "easy",
    effort: "low",
    priorEvidenceClass: "correlational",
  },
  {
    id: "okr-checkin",
    title: "Bi-weekly OKR check-in ritual",
    category: "planning",
    description: "A recurring 20-minute ritual reviewing objective progress against key results with the team.",
    applicableContexts: [{ stage: ["growth", "scale"] }],
    preconditions: [],
    costUnit: "hours",
    costAmount: 1.5,
    reversibility: "easy",
    effort: "low",
    priorEvidenceClass: "correlational",
  },
  {
    id: "psych-safety-retro",
    title: "Blameless retro focused on psychological safety",
    category: "culture",
    description: "A recurring retrospective explicitly structured to surface failures without attributing blame.",
    applicableContexts: [{ incidentRateRecent: ["elevated", "high"] }],
    preconditions: [],
    costUnit: "hours",
    costAmount: 1,
    reversibility: "easy",
    effort: "medium",
    priorEvidenceClass: "experimental",
  },
  {
    id: "delegation-matrix",
    title: "Publish a delegation (RACI-style) matrix",
    category: "delegation",
    description: "Make explicit who decides, who is consulted, and who is informed for recurring decision types.",
    applicableContexts: [{ managementStyleCurrent: ["directive"] }],
    preconditions: [{ key: "teamSize", notIn: ["solo"] }],
    costUnit: "hours",
    costAmount: 4,
    reversibility: "moderate",
    effort: "medium",
    priorEvidenceClass: "correlational",
  },
  {
    id: "skip-level-listening",
    title: "Monthly skip-level listening session",
    category: "feedback",
    description: "A senior leader holds an informal listening-only session with ICs two levels down.",
    applicableContexts: [{ orgLayers: ["3+"] }],
    preconditions: [{ key: "orgLayers", in: ["3+"] }],
    costUnit: "hours",
    costAmount: 1,
    reversibility: "easy",
    effort: "low",
    priorEvidenceClass: "anecdotal",
  },
  {
    id: "peer-coaching-circle",
    title: "Start a peer manager coaching circle",
    category: "culture",
    description: "Managers meet biweekly in small peer groups to workshop real management problems.",
    applicableContexts: [{ managerCount: ["multiple"] }],
    preconditions: [{ key: "managerCount", notIn: ["single"] }],
    costUnit: "hours",
    costAmount: 1.5,
    reversibility: "easy",
    effort: "medium",
    priorEvidenceClass: "experimental",
  },
  {
    id: "decision-log",
    title: "Maintain a public decision log",
    category: "structure",
    description: "Every non-trivial decision is logged with context, options considered, and the call made.",
    applicableContexts: [{ stage: ["growth", "scale"] }],
    preconditions: [],
    costUnit: "hours",
    costAmount: 2,
    reversibility: "easy",
    effort: "medium",
    priorEvidenceClass: "correlational",
  },
  {
    id: "blameless-postmortem",
    title: "Formal blameless postmortem process",
    category: "culture",
    description: "A written, templated postmortem process for incidents and major misses, explicitly blameless.",
    applicableContexts: [{ incidentRateRecent: ["elevated", "high"] }],
    preconditions: [],
    costUnit: "hours",
    costAmount: 3,
    reversibility: "moderate",
    effort: "medium",
    priorEvidenceClass: "experimental",
  },
  {
    id: "manager-shadowing",
    title: "New-manager shadowing program",
    category: "structure",
    description: "First-time managers shadow an experienced manager's 1:1s and decisions for one cycle.",
    applicableContexts: [{ managerTenure: ["new"] }],
    preconditions: [{ key: "managerCount", notIn: ["single"] }],
    costUnit: "hours",
    costAmount: 6,
    reversibility: "hard",
    effort: "high",
    priorEvidenceClass: "anecdotal",
  },
];

export function listPlaybooks(): Playbook[] {
  return PLAYBOOKS;
}

export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.id === id);
}
