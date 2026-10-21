import { CATEGORICAL_ORDER, DOMAIN_META } from "@/design/tokens";

/**
 * Primary navigation model. Hick–Hyman law: choice reaction time grows with
 * log2(n) over the number of options, so the PRIMARY set is capped at 7
 * (Overview + the 6 domains). Everything else (settings, admin, help,
 * search) lives in `secondaryNav` or behind the CommandPalette —
 * progressive disclosure rather than a wider top-level menu.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  shortcut?: string;
  domain?: (typeof CATEGORICAL_ORDER)[number];
  description: string;
}

export const primaryNav: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/",
    shortcut: "g o",
    description: "Cross-domain summary, chunked 3±1 per Miller's law.",
  },
  ...CATEGORICAL_ORDER.map((id, index) => ({
    id,
    label: DOMAIN_META[id].label,
    href: `/${id}`,
    shortcut: `g ${index + 1}`,
    domain: id,
    description: DOMAIN_META[id].description,
  })),
];

export const secondaryNav: NavItem[] = [
  { id: "styleguide", label: "Styleguide", href: "/styleguide", description: "Living design-system specification." },
  { id: "settings", label: "Settings", href: "/settings", description: "Workspace, theme, density, notifications." },
  { id: "help", label: "Help & shortcuts", href: "/help", description: "Keyboard shortcuts and documentation." },
];

export const allNavItems: NavItem[] = [...primaryNav, ...secondaryNav];

export const PRIMARY_NAV_LIMIT = 7;
