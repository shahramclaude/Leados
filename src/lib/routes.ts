import type { Domain } from "@/lib/types";

// Single registry for every route in the app. The nav rail, the mobile
// bottom tab bar, and the command palette all read from this list so a
// route only ever needs to be declared once.
export interface AppRoute {
  path: string;
  label: string;
  icon: string; // unicode glyph, rendered in ui-monospace, no icon library
  domain: Domain | null; // domain used to compute alert badges, if any
  mobilePrimary: boolean; // shown in the 5-item bottom tab bar
}

export const APP_ROUTES: AppRoute[] = [
  { path: "/", label: "Cockpit", icon: "◈", domain: null, mobilePrimary: true },
  { path: "/people", label: "People", icon: "⊙", domain: "people", mobilePrimary: true },
  { path: "/strategic", label: "Strategic", icon: "◆", domain: "strategic", mobilePrimary: true },
  { path: "/financial", label: "Financial", icon: "⟠", domain: "financial", mobilePrimary: true },
  { path: "/execution", label: "Execution", icon: "◫", domain: "execution", mobilePrimary: false },
  { path: "/signals", label: "Signals", icon: "⊞", domain: "signals", mobilePrimary: false },
  { path: "/hypotheses", label: "Hypotheses", icon: "⍺", domain: null, mobilePrimary: true },
  { path: "/about", label: "About", icon: "ⓘ", domain: null, mobilePrimary: false },
];
