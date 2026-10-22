// =============================================================================
// playbooks.ts — Playbook CRUD + versioning
// =============================================================================
// A playbook is an executable checklist: trigger -> steps[] (owner +
// verification per step) -> status. New versions are created by cloning the
// previous version with `parentPlaybookId` set and `version` incremented;
// old versions are never deleted so effectiveness history stays intact.
// =============================================================================

import { db } from "@/db";
import { playbooks, playbookRuns } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export interface PlaybookStep {
  order: number;
  text: string;
  owner: string;
  verification: string;
}

export interface CreatePlaybookInput {
  slug: string;
  name: string;
  trigger: Record<string, unknown>;
  steps: PlaybookStep[];
  status?: "draft" | "active" | "deprecated";
  createdFromRetrospectiveId?: string | null;
  parentPlaybookId?: string | null;
  version?: number;
}

export async function createPlaybook(input: CreatePlaybookInput) {
  const [row] = await db
    .insert(playbooks)
    .values({
      slug: input.slug,
      name: input.name,
      trigger: input.trigger,
      steps: input.steps,
      status: input.status ?? "draft",
      createdFromRetrospectiveId: input.createdFromRetrospectiveId ?? null,
      parentPlaybookId: input.parentPlaybookId ?? null,
      version: input.version ?? 1,
    })
    .returning();
  return row;
}

export async function listPlaybooks(opts?: { status?: "draft" | "active" | "deprecated" }) {
  return db
    .select()
    .from(playbooks)
    .where(opts?.status ? eq(playbooks.status, opts.status) : undefined)
    .orderBy(sql`${playbooks.createdAt} desc`);
}

export async function getPlaybook(id: string) {
  const [row] = await db.select().from(playbooks).where(eq(playbooks.id, id));
  return row ?? null;
}

/** Full version chain for a playbook family (by slug), oldest first. */
export async function getPlaybookVersionHistory(slug: string) {
  return db
    .select()
    .from(playbooks)
    .where(eq(playbooks.slug, slug))
    .orderBy(sql`${playbooks.version} asc`);
}

/** Publish a draft (human action — never automatic). */
export async function publishPlaybook(id: string) {
  const [row] = await db
    .update(playbooks)
    .set({ status: "active", publishedAt: new Date() })
    .where(eq(playbooks.id, id))
    .returning();
  return row;
}

export async function deprecatePlaybook(id: string) {
  const [row] = await db
    .update(playbooks)
    .set({ status: "deprecated" })
    .where(eq(playbooks.id, id))
    .returning();
  return row;
}

/** Create a new version of an existing playbook (clone + increment). */
export async function createNewVersion(id: string, steps: PlaybookStep[], trigger?: Record<string, unknown>) {
  const current = await getPlaybook(id);
  if (!current) throw new Error("Playbook not found");

  return createPlaybook({
    slug: current.slug,
    name: current.name,
    trigger: trigger ?? (current.trigger as Record<string, unknown>),
    steps,
    status: "draft",
    parentPlaybookId: current.id,
    version: current.version + 1,
  });
}

export async function listRunsForPlaybook(playbookId: string) {
  return db
    .select()
    .from(playbookRuns)
    .where(eq(playbookRuns.playbookId, playbookId))
    .orderBy(sql`${playbookRuns.startedAt} desc`);
}

export async function listAllActivePlaybooks() {
  return db.select().from(playbooks).where(and(eq(playbooks.status, "active")));
}
