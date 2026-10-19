import type { DomainKey } from "./types";

export interface NavItem {
  href: string;
  label: string;
  domain: DomainKey;
  icon: string;
}

// Single source of truth for route <-> domain mapping, shared by Shell
// (left nav rail) and CommandPalette (route search results) so the two can
// never drift out of sync.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Cockpit", domain: "cockpit", icon: "\u25CE" },
  { href: "/people", label: "People", domain: "people", icon: "\u263A" },
  { href: "/strategic", label: "Strategic", domain: "strategic", icon: "\u265F" },
  { href: "/financial", label: "Financial", domain: "financial", icon: "$" },
  { href: "/execution", label: "Execution", domain: "execution", icon: "\u25A3" },
  { href: "/signals", label: "Signal Board", domain: "signals", icon: "\u25B2" },
  { href: "/hypotheses", label: "Hypotheses", domain: "hypotheses", icon: "?" },
  { href: "/about", label: "About", domain: "about", icon: "\u2139" },
];

export function domainHref(domain: DomainKey): string {
  const match = NAV_ITEMS.find((item) => item.domain === domain);
  return match ? match.href : "/";
}
