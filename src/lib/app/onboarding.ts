// src/lib/app/onboarding.ts — the onboarding use-case: wires together domain
// validation, organization/user/membership creation, initial feature-flag
// rule set and optional sample-data seeding. Backs `OrgProfileWizard.tsx`.

import { createOrganization, getOrganizationBySlug } from "@/lib/platform/db/orgsRepository";
import { createUser, getUserByEmail } from "@/lib/platform/db/usersRepository";
import { createMembership } from "@/lib/platform/db/membershipsRepository";
import { setFlag } from "@/lib/platform/db/featureFlagsRepository";
import { seedSampleFindings } from "@/lib/platform/db/findingsRepository";
import { presetTerminology, type TerminologyPresetKey } from "@/lib/domain/terminology";
import type { OrgProfile } from "@/lib/domain/types";
import { isValidIanaTimezone } from "@/lib/time";
import { isSupportedLocale } from "@/i18n/locales";

export interface OnboardingResult {
  orgId: string;
  userId: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export async function runOnboarding(profile: OrgProfile): Promise<OnboardingResult> {
  if (!profile.name || profile.name.trim().length < 2) {
    throw new Error("Organization name must be at least 2 characters.");
  }
  if (!profile.adminEmail || !profile.adminEmail.includes("@")) {
    throw new Error("A valid admin email is required.");
  }
  if (!isValidIanaTimezone(profile.timezone)) {
    throw new Error(`"${profile.timezone}" is not a recognized timezone.`);
  }
  if (!isSupportedLocale(profile.defaultLocale)) {
    throw new Error(`"${profile.defaultLocale}" is not a supported locale.`);
  }

  const slug = slugify(profile.slug || profile.name);
  const existingOrg = await getOrganizationBySlug(slug);
  if (existingOrg) {
    throw new Error(`Workspace URL "${slug}" is already taken.`);
  }

  const terminology = presetTerminology(profile.terminologyPreset as TerminologyPresetKey);

  const org = await createOrganization({
    slug,
    name: profile.name,
    accentColor: profile.accentColor || "#4f46e5",
    terminology,
    defaultLocale: profile.defaultLocale,
    timezone: profile.timezone,
    currency: profile.currency || "USD",
    sampleDataEnabled: profile.sampleDataEnabled,
  });

  // Initial rule set: a conservative default feature-flag configuration
  // derived straight from the org profile, so onboarding actually
  // "configures ... the initial rule set" rather than just creating a row.
  await setFlag(org.id, "plainLanguageDefault", profile.industry === "nonprofit");
  await setFlag(org.id, "pushNotifications", false);
  await setFlag(org.id, "advancedNav", profile.terminologyPreset === "enterprise");

  let user = await getUserByEmail(profile.adminEmail);
  if (!user) {
    user = await createUser({
      email: profile.adminEmail,
      name: profile.adminName || profile.adminEmail,
      locale: profile.defaultLocale,
    });
  }

  await createMembership({ userId: user.id, orgId: org.id, role: "admin" });

  if (profile.sampleDataEnabled) {
    await seedSampleFindings(org.id, terminology.team ?? "Team");
  }

  return { orgId: org.id, userId: user.id };
}
