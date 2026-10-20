// src/lib/playbooks.ts
//
// Playbooks are executable checklists: trigger conditions, ordered steps
// with owners, versioned with a changelog. This module owns basic CRUD +
// versioning; execution lives in playbooksEngine.ts, mining of new
// candidates from retrospectives lives in playbooksIntelligence.ts.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { playbooks } from "@/db/schema";
import { indexDocument } from "@/lib/search";

export interface PlaybookStep {
  order: number;
  title: string;
  description?: string;
  owner?: string;
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
  await indexPlaybook(row);
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
  const changelog = [
    ...(existing.changelog as ChangelogEntry[]),
    { version: newVersion, date: new Date().toISOString().slice(0, 10), note: input.changeNote },
  ];
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
  await indexPlaybook(row);
  return row;
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

async function indexPlaybook(row: typeof playbooks.$inferSelect) {
  const steps = (row.steps as PlaybookStep[]) ?? [];
  await indexDocument({
    sourceType: "playbook",
    sourceId: row.id,
    title: row.title,
    body: `${row.description ?? ""}\n${steps.map((s) => `${s.order}. ${s.title} ${s.description ?? ""}`).join("\n")}`,
    tags: [row.status],
    recencyAt: row.updatedAt,
  });
}
