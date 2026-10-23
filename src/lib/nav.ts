export type NavItem = {
  href: string;
  label: string;
  icon: string;
  part: string;
  blurb: string;
};

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Cockpit",
    items: [
      { href: "/", label: "Dashboard", icon: "🛰️", part: "00", blurb: "Executive cockpit" },
    ],
  },
  {
    title: "Decide & Sense",
    items: [
      { href: "/decisions", label: "Decisions", icon: "🧭", part: "01·23", blurb: "Event-sourced decision governance" },
      { href: "/signals", label: "Signals", icon: "📡", part: "13", blurb: "Sensing & early warning" },
    ],
  },
  {
    title: "Govern & Protect",
    items: [
      { href: "/risks", label: "Risk Register", icon: "🛡️", part: "29", blurb: "GRC operating system" },
      { href: "/board-packs", label: "Board Packs", icon: "📘", part: "55", blurb: "Board & governance automation" },
    ],
  },
  {
    title: "Operate",
    items: [
      { href: "/cadence", label: "Cadence", icon: "🔁", part: "25", blurb: "Operating cadence & rituals" },
      { href: "/interventions", label: "Interventions", icon: "🧪", part: "51", blurb: "Action recommender marketplace" },
    ],
  },
  {
    title: "Autonomy",
    items: [
      { href: "/agents", label: "Agent Kernel", icon: "🤖", part: "58", blurb: "Autonomous executive agents" },
    ],
  },
  {
    title: "People & Org",
    items: [
      { href: "/leader-state", label: "Leader State", icon: "🧠", part: "52", blurb: "Decision-load science" },
      { href: "/fitness", label: "Org Fitness", icon: "📈", part: "39·57", blurb: "Self-evolving organization" },
      { href: "/esg", label: "ESG", icon: "🌱", part: "36", blurb: "Sustainability intelligence" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
