export type RouteDef = {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: string;
};

export type RouteSection = {
  key: "now" | "understand" | "act";
  label: string;
  description: string;
  routes: RouteDef[];
};

/**
 * The entire information architecture in one place: three tiers (Now /
 * Understand / Act), each a real, data-backed view — nothing here points at
 * a ComingSoon stub. NavBar, the command palette and breadcrumbs all read
 * from this single source so IA changes never drift out of sync.
 */
export const ROUTE_SECTIONS: RouteSection[] = [
  {
    key: "now",
    label: "Now",
    description: "Today's decisions and attention",
    routes: [
      {
        key: "now",
        label: "Today",
        href: "/now",
        description: "The highest-severity decisions, signals and blockers that need you today.",
        icon: "☀️",
      },
    ],
  },
  {
    key: "understand",
    label: "Understand",
    description: "People, metrics, signals, knowledge, hypotheses",
    routes: [
      { key: "people", label: "People", href: "/understand/people", description: "Sentiment, engagement and flight risk across the org.", icon: "🧑‍🤝‍🧑" },
      { key: "metrics", label: "Metrics", href: "/understand/metrics", description: "Core leading and lagging indicators with forecasts.", icon: "📊" },
      { key: "signals", label: "Signals", href: "/understand/signals", description: "Anomalies and emerging risks detected across sources.", icon: "📡" },
      { key: "knowledge", label: "Knowledge", href: "/understand/knowledge", description: "The collaboration network and how work really flows.", icon: "🧠" },
      { key: "hypotheses", label: "Hypotheses", href: "/understand/hypotheses", description: "Standing beliefs about the business and their evidence.", icon: "🔬" },
    ],
  },
  {
    key: "act",
    label: "Act",
    description: "Execution, strategy, financials, playbooks, decisions",
    routes: [
      { key: "execution", label: "Execution", href: "/act/execution", description: "Cross-team delivery status and blockers.", icon: "🚀" },
      { key: "strategic", label: "Strategic", href: "/act/strategic", description: "Portfolio health against strategic bets.", icon: "🧭" },
      { key: "financial", label: "Financial", href: "/act/financial", description: "Revenue bridge, budget and burn.", icon: "💰" },
      { key: "playbooks", label: "Playbooks", href: "/act/playbooks", description: "Automated responses to recurring situations.", icon: "📘" },
      { key: "decisions", label: "Decisions", href: "/act/decisions", description: "Open decisions awaiting a leadership call.", icon: "✅" },
    ],
  },
];

export const ALL_ROUTES: RouteDef[] = ROUTE_SECTIONS.flatMap((s) => s.routes);

export function findRouteByHref(href: string): RouteDef | undefined {
  return ALL_ROUTES.find((r) => href === r.href || href.startsWith(`${r.href}/`));
}

export function breadcrumbsFor(href: string): { label: string; href?: string }[] {
  const route = findRouteByHref(href);
  if (!route) return [{ label: "LEADOS" }];
  const section = ROUTE_SECTIONS.find((s) => s.routes.some((r) => r.key === route.key));
  return [
    { label: "LEADOS", href: "/now" },
    ...(section ? [{ label: section.label }] : []),
    { label: route.label, href: route.href },
  ];
}
