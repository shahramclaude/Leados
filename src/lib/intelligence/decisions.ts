/**
 * decisions.ts — seeded pending-decision fixtures used to exercise and
 * sanity-check the decision engine (EV / regret / VOI) end to end.
 *
 * HONESTY NOTE: these are hand-authored, internally-consistent fixtures for
 * demonstration and property testing — NOT live organizational decisions.
 * `stateConfidenceClass: "assumed"` reflects that the state probabilities
 * are declared, not fit from observed data. Replace with
 * belief-derived probabilities once a real decision backlog is wired in.
 */

import { PendingDecision } from "./decisionEngine";

export const SEEDED_DECISIONS: PendingDecision[] = [
  {
    id: "dec-outbound-segment-b",
    title: "Expand outbound campaign to Segment B?",
    description:
      "Segment B has not been targeted before. Committing the full campaign budget now locks in spend before we know whether the segment responds.",
    actions: [
      { id: "invest", label: "Launch full campaign" },
      { id: "hold", label: "Hold / do not launch" },
    ],
    states: [
      { id: "responds", label: "Segment responds", probability: 0.4 },
      { id: "noResponse", label: "Segment does not respond", probability: 0.6 },
    ],
    utilities: {
      invest: { responds: 120000, noResponse: -30000 },
      hold: { responds: 0, noResponse: 0 },
    },
    informationSources: [
      {
        id: "pilot-batch",
        label: "Run a small $5k pilot batch first",
        cost: 5000,
        signals: [
          {
            id: "pilot-positive",
            label: "Pilot shows positive response",
            probability: 0.5,
            statePosteriors: { responds: 0.6, noResponse: 0.4 },
          },
          {
            id: "pilot-negative",
            label: "Pilot shows weak response",
            probability: 0.5,
            statePosteriors: { responds: 0.2, noResponse: 0.8 },
          },
        ],
      },
    ],
    stateConfidenceClass: "assumed",
  },
  {
    id: "dec-oncall-staffing",
    title: "Increase on-call staffing ahead of next month?",
    description:
      "Adding staff now avoids incident-response overload if volume spikes, but costs money every month volume stays normal.",
    actions: [
      { id: "addStaff", label: "Add on-call staff" },
      { id: "keepStaff", label: "Keep current staffing" },
    ],
    states: [
      { id: "high", label: "High-incident month", probability: 0.3 },
      { id: "normal", label: "Normal month", probability: 0.7 },
    ],
    utilities: {
      addStaff: { high: 50000, normal: -20000 },
      keepStaff: { high: -80000, normal: 0 },
    },
    informationSources: [
      {
        id: "error-rate-trend",
        label: "Check leading-indicator error-rate trend before deciding",
        cost: 2000,
        signals: [
          {
            id: "trend-elevated",
            label: "Error rate trending up",
            probability: 0.35,
            statePosteriors: { high: 0.6, normal: 0.4 },
          },
          {
            id: "trend-normal",
            label: "Error rate normal",
            probability: 0.65,
            statePosteriors: { high: 0.1385, normal: 0.8615 },
          },
        ],
      },
    ],
    stateConfidenceClass: "assumed",
  },
  {
    id: "dec-billing-migration",
    title: "Migrate billing system to new vendor?",
    description:
      "Migrating unlocks lower fees and better reporting if it goes smoothly, but a rocky migration risks billing errors and churn.",
    actions: [
      { id: "migrate", label: "Migrate now" },
      { id: "stay", label: "Stay on current vendor" },
    ],
    states: [
      { id: "smooth", label: "Migration goes smoothly", probability: 0.55 },
      { id: "rocky", label: "Migration is rocky", probability: 0.45 },
    ],
    utilities: {
      migrate: { smooth: 200000, rocky: -150000 },
      stay: { smooth: 0, rocky: 0 },
    },
    informationSources: [
      {
        id: "vendor-sandbox-trial",
        label: "Run a 30-day vendor sandbox trial",
        cost: 15000,
        signals: [
          {
            id: "trial-good",
            label: "Sandbox trial goes well",
            probability: 0.5,
            statePosteriors: { smooth: 0.8, rocky: 0.2 },
          },
          {
            id: "trial-bad",
            label: "Sandbox trial surfaces issues",
            probability: 0.5,
            statePosteriors: { smooth: 0.3, rocky: 0.7 },
          },
        ],
      },
    ],
    stateConfidenceClass: "assumed",
  },
];
