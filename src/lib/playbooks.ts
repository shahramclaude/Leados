// src/lib/playbooks.ts
//
// Playbooks are executable checklists (mission §D): trigger conditions,
// ordered steps with owners + verification, versioned with a changelog.
// This module owns CRUD + versioning; execution lives in
// playbooksEngine.ts, mining of new candidates from retrospectives lives in
// playbooksIntelligence.ts. Retrieval indexes the `playbooks` table
// directly (see retrieval/index.ts) — no separate search-index write here.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { playbooks, playbookVersions } from "@/db/schema";

export interface PlaybookStep {
  order: number;
  title: string;
  description?: string;
  owner?: string;
  verification?: string; // how a human/the kernel confirms this step was actually done
}

export interface TriggerCondition {
  field: string;
  operator: "gt" | "lt" | "eq" | "contains";
  value: string | number;
}

export interface ChangelogEntry {
  version: number;
  date: string;
  note: string;
}

export interface CreatePlaybookInput {
  key: string;
  title: string;
  description?: string;
  triggerConditions?: TriggerCondition[];
  steps: PlaybookStep[];
  originRetrospectiveId?: number;
  status?: "draft" | "active" | "deprecated";
}

export async function createPlaybook(input: CreatePlaybookInput) {
  const [row] = await db
    .insert(playbooks)
    .values({
      key: input.key,
      title: input.title,
      description: input.description ?? null,
      triggerConditions: input.triggerConditions ?? [],
      steps: input.steps,
      status: input.status ?? "draft",
      version: 1,
      changelog: [{ version: 1, date: new Date().toISOString().slice(0, 10), note: "Initial version" }],
      originRetrospectiveId: input.originRetrospectiveId ?? null,
    })
    .returning();
  await db.insert(playbookVersions).values({ playbookId: row.id, version: 1, steps: input.steps, changelogNote: "Initial version" });
  return row;
}

export interface UpdatePlaybookInput {
  title?: string;
  description?: string;
  triggerConditions?: TriggerCondition[];
  steps?: PlaybookStep[];
  status?: "draft" | "active" | "deprecated";
  changeNote: string;
}

/** Any content change bumps the version and appends a changelog entry — playbooks are never silently edited. */
export async function updatePlaybook(id: number, input: UpdatePlaybookInput) {
  const [existing] = await db.select().from(playbooks).where(eq(playbooks.id, id)).limit(1);
  if (!existing) throw new Error(`Playbook ${id} not found`);
  const newVersion = existing.version + 1;
  const changelog = [...(existing.changelog as ChangelogEntry[]), { version: newVersion, date: new Date().toISOString().slice(0, 10), note: input.changeNote }];
  const [row] = await db
    .update(playbooks)
    .set({
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      triggerConditions: input.triggerConditions ?? existing.triggerConditions,
      steps: input.steps ?? existing.steps,
      status: input.status ?? existing.status,
      version: newVersion,
      changelog,
      updatedAt: new Date(),
    })
    .where(eq(playbooks.id, id))
    .returning();
  await db.insert(playbookVersions).values({ playbookId: id, version: newVersion, steps: row.steps, changelogNote: input.changeNote });
  return row;
}

export async function listPlaybookVersions(playbookId: number) {
  return db.select().from(playbookVersions).where(eq(playbookVersions.playbookId, playbookId)).orderBy(desc(playbookVersions.version));
}

export async function listPlaybooks(status?: "draft" | "active" | "deprecated") {
  return status
    ? db.select().from(playbooks).where(eq(playbooks.status, status)).orderBy(desc(playbooks.updatedAt))
    : db.select().from(playbooks).orderBy(desc(playbooks.updatedAt));
}

export async function getPlaybook(id: number) {
  const [row] = await db.select().from(playbooks).where(eq(playbooks.id, id)).limit(1);
  return row ?? null;
}

export async function getPlaybookByKey(key: string) {
  const [row] = await db.select().from(playbooks).where(eq(playbooks.key, key)).limit(1);
  return row ?? null;
}
