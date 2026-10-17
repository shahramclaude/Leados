// src/lib/rules.ts
// A small, focused "Signal Board" catalog — original to this delivery.
// Sized deliberately to the 5 inference patterns in the pasted pt-M "Part 1"
// brief (INF-001..INF-005), not a reconstruction of any larger rule catalog
// claimed elsewhere (e.g. the real repo's root index.html, or a prior
// sandbox session's 50-rule board — neither was copied from).
import type { Rule } from "./types";

export const RULES: Rule[] = [
  // --- People ---
  {
    id: "R1",
    name: "Missed 1:1 cadence",
    category: "People",
    severity: 3,
    description: "A scheduled 1:1 was skipped or moved with no reschedule logged.",
    counter: true,
    counterLabel: "Missed 1:1s logged",
  },
  {
    id: "R7",
    name: "Burnout signal",
    category: "People",
    severity: 3,
    description: "Self-reported or observed burnout indicator (e.g. after-hours load, sentiment dip).",
  },
  {
    id: "R10",
    name: "Growth plan missed",
    category: "People",
    severity: 2,
    description: "A logged growth/development plan passed its checkpoint with no progress note.",
  },
  {
    id: "R19",
    name: "Attrition event",
    category: "People",
    severity: 4,
    description: "A team member departure was logged. Use 'Log departure' below to add to history.",
  },
  {
    id: "R20",
    name: "Engagement low",
    category: "People",
    severity: 2,
    description: "Engagement pulse or proxy signal below the team's own baseline.",
  },

  // --- Revenue ---
  {
    id: "R104",
    name: "LTV:CAC below 3",
    category: "Revenue",
    severity: 4,
    description: "Lifetime value to customer acquisition cost ratio has fallen under the 3x floor.",
  },
  {
    id: "R109",
    name: "Cohort retention declining",
    category: "Revenue",
    severity: 4,
    description: "Retention curves for recent cohorts sit below older cohorts at the same age.",
  },
  {
    id: "R87",
    name: "Win/loss pattern concentration",
    category: "Revenue",
    severity: 3,
    description: "Losses are concentrating around a single recurring reason in win/loss notes.",
  },

  // --- Crisis ---
  {
    id: "R133",
    name: "Recurring crisis root cause",
    category: "Crisis",
    severity: 4,
    description: "The root cause identified in a postmortem matches a prior incident's root cause.",
  },
  {
    id: "R128",
    name: "Postmortem action ghosted",
    category: "Crisis",
    severity: 3,
    description: "A postmortem action item was logged but never closed out.",
  },

  // --- Engineering ---
  {
    id: "R73",
    name: "Velocity declining",
    category: "Engineering",
    severity: 3,
    description: "Sprint velocity trend is down over the last 3+ sprints.",
  },
  {
    id: "R81",
    name: "Capacity shock",
    category: "Engineering",
    severity: 4,
    description: "Team capacity dropped sharply (leave, reassignment, incident response).",
  },
  {
    id: "R38",
    name: "Tech debt accumulation",
    category: "Engineering",
    severity: 2,
    description: "A growing share of effort is going to debt service rather than roadmap work.",
  },
  {
    id: "R79",
    name: "No retrospective cadence",
    category: "Engineering",
    severity: 2,
    description: "The team has not held a retro in the expected cadence window.",
  },
  {
    id: "R74",
    name: "Low sprint goal hit rate",
    category: "Engineering",
    severity: 3,
    description: "Sprint goals are being missed more often than hit over recent sprints.",
  },

  // --- Strategy ---
  {
    id: "R3",
    name: "Ownerless goal",
    category: "Strategy",
    severity: 3,
    description: "A committed goal has no named owner.",
  },
  {
    id: "R68",
    name: "Initiative backlog growing",
    category: "Strategy",
    severity: 2,
    description: "The initiative backlog is growing faster than the team is closing initiatives.",
  },
];

export const RULES_BY_ID: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.id, r]));

export const CATEGORIES: Category[] = ["People", "Revenue", "Engineering", "Crisis", "Strategy"];

type Category = Rule["category"];
