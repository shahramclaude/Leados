// src/lib/domain/types.ts — the one canonical domain model file (see
// ARCHITECTURE.md's "Where modules belong" table). Pure types only, no I/O,
// no Drizzle row types leaking in from the platform layer.

export type Role = "admin" | "executive" | "hr" | "manager" | "contributor" | "viewer";

export type Permission =
  | "findings:view"
  | "findings:create"
  | "findings:resolve"
  | "settings:view"
  | "settings:edit"
  | "featureFlags:edit"
  | "permissions:view"
  | "onboarding:run"
  | "push:manage";

export interface SessionContext {
  userId: string;
  orgId: string;
  role: Role;
  locale: string;
}

export interface OrgProfile {
  slug: string;
  name: string;
  industry: string;
  defaultLocale: string;
  timezone: string;
  currency: string;
  accentColor: string;
  terminologyPreset: "default" | "startup" | "enterprise" | "nonprofit";
  sampleDataEnabled: boolean;
  adminName: string;
  adminEmail: string;
}

export interface FindingInput {
  title: string;
  domain: string;
  team: string;
  severity: number;
  summary: string;
  clientMutationId?: string;
}

export const FEATURE_FLAG_KEYS = [
  "pushNotifications",
  "plainLanguageDefault",
  "advancedNav",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  pushNotifications: false,
  plainLanguageDefault: false,
  advancedNav: false,
};
