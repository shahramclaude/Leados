/**
 * LEADOS information architecture — three tiers, decision-first:
 *  - Now: today's decisions, pending approvals, what changed.
 *  - Understand: people, metrics, signals, knowledge, hypotheses.
 *  - Act: execution, strategic, financial, playbooks, decisions.
 *
 * This file is the single source of truth for navigation (NavBar) and
 * search (command palette, /api/search route indexing). There are no
 * "coming soon" entries here — every route below renders a real view.
 */
export type Tier = "Now" | "Understand" | "Act";

export interface RouteItem {
  label: string;
  href: string;
  description: string;
  icon: string; // glyph, kept token-free (not a color)
}

export interface RouteGroup {
  tier: Tier;
  items: RouteItem[];
}

export const ROUTES: RouteGroup[] = [
  {
    tier: "Now",
    items: [
      {
        label: "Cockpit",
        href: "/leados/now/cockpit",
        description: "Today's decisions, pending approvals, and what changed since yesterday.",
        icon: "◎",
      },
    ],
  },
  {
    tier: "Understand",
    items: [
      {
        label: "People",
        href: "/leados/understand/people",
        description: "Headcount, teams, and attrition-risk severity across the org.",
        icon: "◈",
      },
      {
        label: "Metrics",
        href: "/leados/understand/metrics",
        description: "ARR, NRR, and headcount trends with forecast uncertainty bands.",
        icon: "▤",
      },
    ],
  },
  {
    tier: "Act",
    items: [
      {
        label: "Decisions",
        href: "/leados/act/decisions",
        description: "Every open, approved, and rejected decision with owners and due dates.",
        icon: "✓",
      },
      {
        label: "Financial",
        href: "/leados/act/financial",
        description: "Revenue, COGS, opex, and headcount cost — actuals vs. forecast band.",
        icon: "$",
      },
    ],
  },
];

export const FLAT_ROUTES: RouteItem[] = ROUTES.flatMap((g) => g.items);

export function findRouteByHref(href: string): RouteItem | undefined {
  return FLAT_ROUTES.find((r) => r.href === href);
}
