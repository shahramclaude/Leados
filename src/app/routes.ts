/**
 * LEADOS information architecture — three decision-first tiers.
 * Now: today's decisions, approvals, what changed.
 * Understand: people, metrics, signals, knowledge, hypotheses.
 * Act: execution, strategic, financial, playbooks, decisions.
 *
 * NavBar, CommandPalette and PageHeader breadcrumbs are all derived from
 * this single tree so the IA can't drift between surfaces.
 */
export type RouteTier = "now" | "understand" | "act";

export interface RouteNode {
  id: string;
  label: string;
  href: string;
  description: string;
  tier: RouteTier;
  /** Query param tabs available on this route, surfaced in the command palette. */
  tabs?: { value: string; label: string }[];
  keywords?: string[];
}

export const ROUTES: RouteNode[] = [
  {
    id: "now",
    label: "Cockpit",
    href: "/leados/now",
    description: "Today's decisions, pending approvals, and what changed overnight.",
    tier: "now",
    keywords: ["home", "today", "overview", "approvals"],
  },
  {
    id: "understand",
    label: "Understand",
    href: "/leados/understand",
    description: "People, metrics, signals, knowledge and hypotheses in one lens.",
    tier: "understand",
    tabs: [
      { value: "people", label: "People" },
      { value: "metrics", label: "Metrics" },
      { value: "signals", label: "Signals" },
      { value: "knowledge", label: "Knowledge" },
      { value: "hypotheses", label: "Hypotheses" },
    ],
    keywords: ["team", "org", "kpi", "trend", "research"],
  },
  {
    id: "act",
    label: "Act",
    href: "/leados/act",
    description: "Execution, strategic bets, financials, playbooks and decisions.",
    tier: "act",
    tabs: [
      { value: "execution", label: "Execution" },
      { value: "strategic", label: "Strategic" },
      { value: "financial", label: "Financial" },
      { value: "playbooks", label: "Playbooks" },
      { value: "decisions", label: "Decisions" },
    ],
    keywords: ["budget", "revenue", "cost", "runbook", "approve"],
  },
  {
    id: "styleguide",
    label: "Styleguide",
    href: "/styleguide",
    description: "Every primitive, chart mark and theme/density combination.",
    tier: "understand",
    keywords: ["design system", "tokens", "components", "docs"],
  },
];

export const TIER_META: Record<RouteTier, { label: string; description: string }> = {
  now: { label: "Now", description: "What needs a decision today" },
  understand: { label: "Understand", description: "Context before you act" },
  act: { label: "Act", description: "Where decisions execute" },
};

export function findRouteByPath(pathname: string): RouteNode | undefined {
  return ROUTES.find((route) => pathname === route.href || pathname.startsWith(`${route.href}/`));
}
