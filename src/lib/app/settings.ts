// src/lib/app/settings.ts — org settings + feature-flag use-cases.

import { requirePermission } from "@/lib/platform/authz";
import { getOrganizationById, updateOrganization } from "@/lib/platform/db/orgsRepository";
import { listFlags, setFlag } from "@/lib/platform/db/featureFlagsRepository";
import type { Organization } from "@/db/schema";
import type { FeatureFlagKey, SessionContext } from "@/lib/domain/types";
import { isValidIanaTimezone } from "@/lib/time";
import { isSupportedLocale } from "@/i18n/locales";

export interface OrgSettingsView {
  org: Organization;
  flags: Record<FeatureFlagKey, boolean>;
}

export async function getOrgSettings(session: SessionContext): Promise<OrgSettingsView> {
  requirePermission(session, "settings:view");
  const org = await getOrganizationById(session.orgId);
  if (!org) throw new Error("Organization not found.");
  const flags = await listFlags(session.orgId);
  return { org, flags };
}

export interface SettingsPatch {
  logoUrl?: string;
  accentColor?: string;
  terminology?: Record<string, string>;
  defaultLocale?: string;
  timezone?: string;
  currency?: string;
}

export async function updateOrgSettings(
  session: SessionContext,
  patch: SettingsPatch,
): Promise<Organization | undefined> {
  requirePermission(session, "settings:edit");
  if (patch.timezone && !isValidIanaTimezone(patch.timezone)) {
    throw new Error(`"${patch.timezone}" is not a recognized timezone.`);
  }
  if (patch.defaultLocale && !isSupportedLocale(patch.defaultLocale)) {
    throw new Error(`"${patch.defaultLocale}" is not a supported locale.`);
  }
  return updateOrganization(session.orgId, patch);
}

export async function setFeatureFlag(
  session: SessionContext,
  key: FeatureFlagKey,
  enabled: boolean,
): Promise<void> {
  requirePermission(session, "featureFlags:edit");
  await setFlag(session.orgId, key, enabled);
}
