import type { DomainKey } from "../lib/types";

// ─────────────────────────────────────────────────────────────
// routes.ts — single source of truth for navigation: the 9 main
// rail routes + settings, their glyphs, hints, and which domain
// (if any) drives their alert badge.
// ─────────────────────────────────────────────────────────────

export type RouteKey =
  | "today"
  | "intelligence"
  | "people"
  | "strategy"
  | "finance"
  | "execution"
  | "signals"
  | "knowledge"
  | "data"
  | "health"
  | "settings";

export interface RouteDef {
  key: RouteKey;
  glyph: string;
  hint: string;
  domain: DomainKey | null;
  /** Which build part will instrument this module, for ComingSoon */
  plannedPart: string;
}

export const ROUTES: RouteDef[] = [
  { key: "today", glyph: "◈", hint: "Command Center", domain: null, plannedPart: "Part 2" },
  { key: "intelligence", glyph: "⟟", hint: "Intelligence", domain: null, plannedPart: "Part 2" },
  { key: "people", glyph: "⊙", hint: "People", domain: "people", plannedPart: "Part 5" },
  { key: "strategy", glyph: "◆", hint: "Strategy", domain: "strategy", plannedPart: "Part 4" },
  { key: "finance", glyph: "⟠", hint: "Finance", domain: "finance", plannedPart: "Part 3" },
  { key: "execution", glyph: "◫", hint: "Execution", domain: "ops", plannedPart: "Part 6" },
  { key: "signals", glyph: "⊞", hint: "Signal Board", domain: null, plannedPart: "Part 7" },
  { key: "knowledge", glyph: "⍺", hint: "Knowledge", domain: null, plannedPart: "Part 9" },
  { key: "data", glyph: "≡", hint: "Data", domain: null, plannedPart: "Part 10" },
];

export const HEALTH_ROUTE: RouteDef = {
  key: "health",
  glyph: "♡",
  hint: "Org Health",
  domain: null,
  plannedPart: "Part 8",
};

export const SETTINGS_ROUTE: RouteDef = {
  key: "settings",
  glyph: "⚙",
  hint: "Settings",
  domain: null,
  plannedPart: "Part 11",
};

export const PALETTE_ROUTES: RouteDef[] = [...ROUTES, HEALTH_ROUTE, SETTINGS_ROUTE];

export const BOTTOM_TAB_ROUTES: RouteKey[] = ["today", "intelligence", "signals", "data", "health"];

export const ALL_ROUTE_KEYS: RouteKey[] = [...ROUTES.map((r) => r.key), "health", "settings"];
