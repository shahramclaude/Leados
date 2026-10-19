// src/lib/playbooksEngine.ts
//
// Persistence + activation logic for playbooks. agentCore.ts (STEP 5) is
// the primary caller for autonomous triggering; a future UI can call the
// read helpers to render active/triggered playbook instances.

import { and, eq, inArray } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { playbookInstances, playbooks, settings } from "@/db/schema";
import type { Finding, TriggeredPlaybook } from "./types";
import { getPlaybookForRuleKey, PLAYBOOK_CATALOG } from "./playbooks";

type Database = typeof defaultDb;

const ACTIVE_STATUSES = ["active", "pending", "triggered"];

export async function ensurePlaybooksSeeded(db: Database): Promise<void> {
  for (const def of PLAYBOOK_CATALOG) {
    await db
      .insert(playbooks)
      .values({ key: def.key, name: def.name, domain: def.domain, ruleKey: def.ruleKey, steps: def.steps })
      .onConflictDoNothing({ target: playbooks.key });
  }
}

export async function getPlaybookRowByKey(db: Database, key: string) {
  const [row] = await db.select().from(playbooks).where(eq(playbooks.key, key)).limit(1);
  return row ?? null;
}

/** Returns true if an instance of `playbookId` is already active/pending. */
export async function hasActiveInstance(db: Database, playbookId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(playbookInstances)
    .where(and(eq(playbookInstances.playbookId, playbookId), inArray(playbookInstances.status, ACTIVE_STATUSES)));
  return rows.length > 0;
}

export async function getDomainOwner(db: Database, domain: string): Promise<number | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, `domain_owner.${domain}`))
    .limit(1);
  if (!row) return null;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Finds a matching playbook for `finding.ruleKey`/`finding.domain` and, if
 * none is already active, inserts a triggered playbook_instances row and
 * returns a TriggeredPlaybook. Returns null if no playbook is defined for
 * this rule, or if one is already active (caller decides what notification
 * to emit in either case).
 */
export async function triggerPlaybookForFinding(
  db: Database,
  finding: Finding,
): Promise<{ triggered: TriggeredPlaybook | null; matched: boolean; alreadyActive: boolean }> {
  await ensurePlaybooksSeeded(db);
  const def = getPlaybookForRuleKey(finding.ruleKey);
  if (!def) {
    return { triggered: null, matched: false, alreadyActive: false };
  }

  const row = await getPlaybookRowByKey(db, def.key);
  if (!row) {
    return { triggered: null, matched: false, alreadyActive: false };
  }

  const alreadyActive = await hasActiveInstance(db, row.id);
  if (alreadyActive) {
    return { triggered: null, matched: true, alreadyActive: true };
  }

  const assignedTo = await getDomainOwner(db, String(finding.domain));

  const [inserted] = await db
    .insert(playbookInstances)
    .values({
      playbookId: row.id,
      status: "triggered",
      source: "autonomous_agent",
      triggerFindingId: finding.id,
      assignedTo: assignedTo ?? null,
    })
    .returning();

  return {
    matched: true,
    alreadyActive: false,
    triggered: {
      instanceId: inserted.id,
      playbookKey: row.key,
      playbookName: row.name,
      domain: row.domain,
      triggerFindingId: finding.id,
      assignedTo: assignedTo ?? null,
      status: inserted.status,
    },
  };
}

/** Count of playbook instances triggered since `since` (used by the
 * morning briefing's `playbooksActive` metric). */
export async function countPlaybooksTriggeredSince(db: Database, since: Date): Promise<number> {
  const rows = await db.select().from(playbookInstances);
  return rows.filter((r) => r.triggeredAt && new Date(r.triggeredAt) >= since).length;
}
