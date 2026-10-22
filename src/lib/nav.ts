import type { DomainScope, MembershipRole } from "@/db/schema";

export type NavItem = {
  key: string; // i18n key for the label
  href: string;
  icon: string; // emoji, avoids an icon-font dependency and scales with text
  domain?: DomainScope;
  minRoleHint?: MembershipRole[]; // UI hint only — the API routes are the real gate
  section: "primary" | "secondary";
};

// Progressive disclosure: only "Now" + the three core domain views ship in
// the primary nav on first login. Admin/Settings are one tap away but not
// competing for thumb-zone space on a 360px screen.
export const NAV_ITEMS: NavItem[] = [
  { key: "nav.now", href: "/", icon: "🏠", section: "primary" },
  { key: "nav.people", href: "/people", icon: "🧑‍🤝‍🧑", domain: "people", section: "primary" },
  { key: "nav.finance", href: "/finance", icon: "💰", domain: "finance", section: "primary" },
  { key: "nav.strategy", href: "/strategy", icon: "🧭", domain: "strategy", section: "primary" },
  { key: "nav.settings", href: "/settings", icon: "⚙️", section: "secondary" },
  {
    key: "nav.admin",
    href: "/admin/permissions",
    icon: "🛡️",
    section: "secondary",
    minRoleHint: ["Admin"],
  },
  {
    key: "admin.flags.title",
    href: "/admin/flags",
    icon: "🚩",
    section: "secondary",
    minRoleHint: ["Admin"],
  },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => item.section === "primary");
export const SECONDARY_NAV = NAV_ITEMS.filter((item) => item.section === "secondary");
