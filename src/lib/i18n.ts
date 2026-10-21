// Minimal i18n scaffold.
//
// Honesty note (see docs/RED-TEAM-2026.md USE-5 and docs/AUDIT-2026.md): this
// is NOT full internationalization. LEADOS ships English-only UI copy today.
// This module exists to (a) prove the pattern LEADOS would scale with — one
// dictionary, looked up by key, never a hardcoded string duplicated across
// locales — and (b) give `npm run i18n:check` something real to verify
// (key parity between locales) rather than rubber-stamping a no-op script.
// Only the top nav currently reads from this dictionary; the rest of the UI
// is still hardcoded English strings and is tracked as backlog, not hidden.

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];

type Dictionary = Record<string, string>;

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    "nav.findings": "Findings",
    "nav.agents": "Agents",
    "nav.audit": "Audit",
    "nav.permissions": "Permissions",
    "nav.budgets": "Budgets",
    "identity.placeholder": "Choose a demo identity…",
  },
  fr: {
    "nav.findings": "Constats",
    "nav.agents": "Agents",
    "nav.audit": "Journal d'audit",
    "nav.permissions": "Permissions",
    "nav.budgets": "Budgets",
    "identity.placeholder": "Choisir une identité de démonstration…",
  },
};

export function t(key: string, locale: Locale = "en"): string {
  return dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
}
