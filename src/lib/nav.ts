import type { Permission } from "@/lib/permissions";

/**
 * Single source of truth for navigation (Section E: consistent navigation
 * is a cognitive-accessibility requirement, and Section D: the same list
 * renders as a sidebar ≥768px and a bottom tab bar on 360–430px screens).
 *
 * `coreForNewUsers` marks the "Now + 3 core views" progressive-disclosure
 * set (Section E). Everything else unlocks after `unlockAfterUses` recorded
 * uses of `unlockSignalKey` (tracked client-side in localStorage — see
 * `useProgressiveNav`).
 */
export type NavItem = {
  href: string;
  labelKey: string;
  icon: string; // decorative emoji glyph kept out of generate_image budget
  permission: Permission | null;
  coreForNewUsers: boolean;
  unlockSignalKey?: string;
  unlockAfterUses?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/now", labelKey: "nav.now", icon: "🏠", permission: null, coreForNewUsers: true },
  { href: "/subjects", labelKey: "nav.subjects", icon: "👥", permission: "subjects.read", coreForNewUsers: true },
  { href: "/briefings", labelKey: "nav.briefings", icon: "📋", permission: "briefings.read", coreForNewUsers: true },
  {
    href: "/findings",
    labelKey: "nav.findings",
    icon: "🔎",
    permission: "findings.read",
    coreForNewUsers: false,
    unlockSignalKey: "briefings",
    unlockAfterUses: 3,
  },
  {
    href: "/playbooks",
    labelKey: "nav.playbooks",
    icon: "🧭",
    permission: "playbooks.read",
    coreForNewUsers: false,
    unlockSignalKey: "briefings",
    unlockAfterUses: 3,
  },
  { href: "/admin", labelKey: "nav.admin", icon: "⚙️", permission: "permissions.manage", coreForNewUsers: false },
  { href: "/settings", labelKey: "nav.settings", icon: "🛠️", permission: null, coreForNewUsers: false },
];

/** Bottom-nav gets the four highest-priority, always-available items (thumb reach). */
export const BOTTOM_NAV_HREFS = ["/now", "/subjects", "/briefings", "/settings"];
