// src/lib/platform/db/orgsRepository.ts — the organization (tenant) table.
// This is the only repository allowed to read/write `organizations` rows.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, type NewOrganization, type Organization } from "@/db/schema";

export async function createOrganization(input: NewOrganization): Promise<Organization> {
  const [row] = await db.insert(organizations).values(input).returning();
  return row;
}

export async function getOrganizationById(orgId: string): Promise<Organization | undefined> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return row;
}

/** Dev-only listing for the demo login chooser — never used by tenant-data routes. */
export async function listOrganizations(): Promise<Organization[]> {
  return db.select().from(organizations).orderBy(organizations.createdAt);
}

export async function countOrganizations(): Promise<number> {
  const rows = await db.select({ id: organizations.id }).from(organizations);
  return rows.length;
}

export async function updateOrganization(
  orgId: string,
  patch: Partial<Pick<Organization, "logoUrl" | "accentColor" | "terminology" | "defaultLocale" | "timezone" | "currency" | "sampleDataEnabled" | "name">>,
): Promise<Organization | undefined> {
  const [row] = await db.update(organizations).set(patch).where(eq(organizations.id, orgId)).returning();
  return row;
}
