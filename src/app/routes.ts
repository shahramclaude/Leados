// Route registry / manifest.
//
// IMPORTANT: Next.js App Router performs the ACTUAL routing via
// file-based conventions under `src/app/**/page.tsx` (this project
// does not use a client-side router library). This file is a small
// manifest consumed by the NavBar and CommandPalette so navigation
// links and the command palette's fuzzy search stay in sync with the
// routes that actually exist on disk.
export type RouteDescriptor = {
  path: string;
  label: string;
  description: string;
};

export const ROUTES: RouteDescriptor[] = [
  { path: "/", label: "Cockpit", description: "Command center overview" },
  { path: "/people", label: "People", description: "People intelligence, flight risk, nine-box" },
  { path: "/strategic", label: "Strategic", description: "War room, scenarios, critical path" },
  { path: "/financial", label: "Financial", description: "Runway, fundraising readiness" },
  { path: "/execution", label: "Execution", description: "Projects, delivery confidence" },
  { path: "/signals", label: "Signals", description: "Findings & playbook instances" },
  { path: "/metrics", label: "Metrics", description: "Forecasts, anomalies, correlations" },
  { path: "/knowledge", label: "Knowledge", description: "Root causes & knowledge graph" },
  { path: "/hypotheses", label: "Hypotheses", description: "Open bets and their resolution" },
  { path: "/about", label: "About", description: "System health & self-tests" },
];
