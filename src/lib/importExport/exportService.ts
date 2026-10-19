// src/lib/importExport/exportService.ts
//
// Full-fidelity export: every event (verbatim, including redacted ones —
// redaction is part of the truth, not something to hide from an export)
// plus every projection table and settings, so `import` can reconstruct
// an equivalent database (`rebuildProjections()` regenerates the
// projections from the imported events; we also ship the projection
// snapshot purely for convenience/diffing, never as the source of truth).

import { asc } from "drizzle-orm";
import { db } from "@/db";
import {
  blockersProjection,
  decisionsProjection,
  events,
  financeSnapshotsProjection,
  milestonesProjection,
  okrProjection,
  orgFacts,
  peopleProjection,
  projectsProjection,
  retentionPolicies,
  settings,
} from "@/db/schema";
import { CURRENT_SCHEMA_VERSION } from "@/db/schemaVersion";
import { toCsv } from "./csv";

export const EXPORT_FORMAT_VERSION = 1;

export interface FullExport {
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  events: (typeof events.$inferSelect)[];
  projections: {
    people: (typeof peopleProjection.$inferSelect)[];
    projects: (typeof projectsProjection.$inferSelect)[];
    milestones: (typeof milestonesProjection.$inferSelect)[];
    blockers: (typeof blockersProjection.$inferSelect)[];
    decisions: (typeof decisionsProjection.$inferSelect)[];
    okrs: (typeof okrProjection.$inferSelect)[];
    financeSnapshots: (typeof financeSnapshotsProjection.$inferSelect)[];
    orgFacts: (typeof orgFacts.$inferSelect)[];
  };
  settings: typeof settings.$inferSelect | null;
  retentionPolicies: (typeof retentionPolicies.$inferSelect)[];
}

export async function buildFullExport(): Promise<FullExport> {
  const [
    allEvents,
    people,
    projects,
    milestones,
    blockers,
    decisions,
    okrs,
    financeSnapshots,
    orgFactRows,
    settingsRow,
    policies,
  ] = await Promise.all([
    db.select().from(events).orderBy(asc(events.seq)),
    db.select().from(peopleProjection),
    db.select().from(projectsProjection),
    db.select().from(milestonesProjection),
    db.select().from(blockersProjection),
    db.select().from(decisionsProjection),
    db.select().from(okrProjection),
    db.select().from(financeSnapshotsProjection),
    db.select().from(orgFacts),
    db.select().from(settings),
    db.select().from(retentionPolicies),
  ]);

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    events: allEvents,
    projections: {
      people,
      projects,
      milestones,
      blockers,
      decisions,
      okrs,
      financeSnapshots,
      orgFacts: orgFactRows,
    },
    settings: settingsRow[0] ?? null,
    retentionPolicies: policies,
  };
}

const CSV_TABLES = {
  events: () => db.select().from(events).orderBy(asc(events.seq)),
  people: () => db.select().from(peopleProjection),
  projects: () => db.select().from(projectsProjection),
  milestones: () => db.select().from(milestonesProjection),
  blockers: () => db.select().from(blockersProjection),
  decisions: () => db.select().from(decisionsProjection),
  okrs: () => db.select().from(okrProjection),
  financeSnapshots: () => db.select().from(financeSnapshotsProjection),
  orgFacts: () => db.select().from(orgFacts),
} as const;

export type CsvTableName = keyof typeof CSV_TABLES;

export const CSV_TABLE_NAMES = Object.keys(CSV_TABLES) as CsvTableName[];

export async function exportTableAsCsv(table: CsvTableName): Promise<string> {
  const rows = await CSV_TABLES[table]();
  return toCsv(rows as unknown as Record<string, unknown>[]);
}
