// LEADOS — Part 37: repository layer.
//
// Every read of entity-scoped or jurisdiction-tagged data goes through this module. Residency
// enforcement lives here (not in page components) so there is exactly one place that can leak a
// cross-border read, and it is the place that is tested (see
// `src/lib/global-ops/__tests__/residency.test.ts`).

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  entities as entitiesTable,
  entityGroups as entityGroupsTable,
  financialFigures as financialFiguresTable,
  fxRates as fxRatesTable,
  intercompanyEliminations as eliminationsTable,
  obligations as obligationsTable,
  obligationInstances as obligationInstancesTable,
  dataResidencyPolicies as residencyPoliciesTable,
  boardPackEntityNotes as boardPackNotesTable,
  units as unitsTable,
} from "@/db/schema";
import type {
  ConsolidationMethod,
  EliminationEntry,
  EntityGroupRecord,
  EntityRecord,
  FiscalCalendarConfig,
  FiscalCalendarType,
  FinancialLine,
  FxRateRecord,
  StatementType,
  UnitRecord,
} from "./types";
import type { ApplicabilityRule, ObligationDefinition } from "./obligations";
import type { ResidencyPolicy } from "./residency";
import { filterByResidency } from "./residency";

function toEntityRecord(row: typeof entitiesTable.$inferSelect): EntityRecord {
  return {
    id: row.id,
    groupId: row.groupId,
    parentEntityId: row.parentEntityId,
    code: row.code,
    legalName: row.legalName,
    jurisdictionCode: row.jurisdictionCode,
    region: row.region,
    functionalCurrency: row.functionalCurrency,
    ownershipPct: row.ownershipPct,
    consolidationMethod: row.consolidationMethod as ConsolidationMethod,
    fiscalCalendarType: row.fiscalCalendarType as FiscalCalendarType,
    fiscalCalendarConfig: (row.fiscalCalendarConfig ?? {}) as FiscalCalendarConfig,
    timezone: row.timezone,
    localeTag: row.localeTag,
    isActive: row.isActive,
  };
}

export async function listEntityGroups(): Promise<EntityGroupRecord[]> {
  const rows = await db.select().from(entityGroupsTable).orderBy(asc(entityGroupsTable.id));
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, groupCurrency: r.groupCurrency }));
}

export async function getEntityGroup(groupId: number): Promise<EntityGroupRecord | undefined> {
  const rows = await db.select().from(entityGroupsTable).where(eq(entityGroupsTable.id, groupId));
  const r = rows[0];
  return r ? { id: r.id, code: r.code, name: r.name, groupCurrency: r.groupCurrency } : undefined;
}

export async function listEntitiesForGroup(groupId: number): Promise<EntityRecord[]> {
  const rows = await db.select().from(entitiesTable).where(eq(entitiesTable.groupId, groupId)).orderBy(asc(entitiesTable.id));
  return rows.map(toEntityRecord);
}

export async function listAllEntities(): Promise<EntityRecord[]> {
  const rows = await db.select().from(entitiesTable).orderBy(asc(entitiesTable.id));
  return rows.map(toEntityRecord);
}

export async function listUnitsForEntity(entityId: number): Promise<UnitRecord[]> {
  const rows = await db.select().from(unitsTable).where(eq(unitsTable.entityId, entityId)).orderBy(asc(unitsTable.id));
  return rows.map((r) => ({ id: r.id, entityId: r.entityId, code: r.code, name: r.name }));
}

export async function listFxRates(): Promise<FxRateRecord[]> {
  const rows = await db.select().from(fxRatesTable);
  return rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rateDate: r.rateDate,
    rate: r.rate,
    method: r.method as FxRateRecord["method"],
    rateSource: r.rateSource,
    fiscalYear: r.fiscalYear,
    fiscalPeriod: r.fiscalPeriod,
  }));
}

export async function listFinancialLines(groupId: number, fiscalYear: number, fiscalPeriod: number): Promise<FinancialLine[]> {
  const entities = await listEntitiesForGroup(groupId);
  const entityIds = new Set(entities.map((e) => e.id));
  const rows = await db.select().from(financialFiguresTable);
  return rows
    .filter((r) => entityIds.has(r.entityId) && r.fiscalYear === fiscalYear && r.fiscalPeriod === fiscalPeriod)
    .map((r) => ({
      entityId: r.entityId,
      fiscalYear: r.fiscalYear,
      fiscalPeriod: r.fiscalPeriod,
      statement: r.statement as StatementType,
      accountCode: r.accountCode,
      accountLabel: r.accountLabel,
      amountValue: r.amountValue,
      amountCurrency: r.amountCurrency,
      isIntercompany: r.isIntercompany,
      counterpartyEntityId: r.counterpartyEntityId,
    }));
}

export async function listEliminations(groupId: number, fiscalYear: number, fiscalPeriod: number): Promise<EliminationEntry[]> {
  const rows = await db.select().from(eliminationsTable).where(eq(eliminationsTable.groupId, groupId));
  return rows
    .filter((r) => r.fiscalYear === fiscalYear && r.fiscalPeriod === fiscalPeriod)
    .map((r) => ({
      fromEntityId: r.fromEntityId,
      toEntityId: r.toEntityId,
      accountCode: r.accountCode,
      amountValue: r.amountValue,
      amountCurrency: r.amountCurrency,
      reason: r.reason,
    }));
}

export async function listResidencyPolicies(): Promise<ResidencyPolicy[]> {
  const rows = await db.select().from(residencyPoliciesTable);
  return rows.map((r) => ({
    dataClass: r.dataClass,
    description: r.description,
    allowedRegions: (r.allowedRegions ?? []) as string[],
  }));
}

export async function listObligationDefinitions(): Promise<ObligationDefinition[]> {
  const rows = await db.select().from(obligationsTable);
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    description: r.description,
    jurisdictionCode: r.jurisdictionCode,
    applicabilityRule: (r.applicabilityRule ?? {}) as ApplicabilityRule,
    frequency: r.frequency as ObligationDefinition["frequency"],
    dataClass: r.dataClass,
  }));
}

export interface ObligationInstanceRow {
  id: number;
  obligationCode: string;
  obligationTitle: string;
  dataClass: string;
  entityId: number;
  periodLabel: string;
  dueDate: string;
  status: string;
}

/** Reads obligation instances for a group, enforcing data residency at this repository layer:
 * rows whose obligation data class is not permitted to be read from `requestingRegion` are
 * excluded from `allowed` and surfaced in `blocked` instead of being silently dropped. This is
 * the function exercised by the cross-border attempt tests. */
export async function listObligationInstancesForGroupWithResidency(
  groupId: number,
  requestingRegion: string,
): Promise<{ allowed: ObligationInstanceRow[]; blocked: { row: ObligationInstanceRow; dataClass: string; reason: string }[] }> {
  const entities = await listEntitiesForGroup(groupId);
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const [instanceRows, obligationRows, policies] = await Promise.all([
    db.select().from(obligationInstancesTable),
    db.select().from(obligationsTable),
    listResidencyPolicies(),
  ]);
  const obligationById = new Map(obligationRows.map((o) => [o.id, o]));
  const policiesByClass = new Map(policies.map((p) => [p.dataClass, p]));

  const rows: ObligationInstanceRow[] = instanceRows
    .filter((i) => entityById.has(i.entityId))
    .map((i) => {
      const o = obligationById.get(i.obligationId);
      return {
        id: i.id,
        obligationCode: o?.code ?? "UNKNOWN",
        obligationTitle: o?.title ?? "Unknown obligation",
        dataClass: o?.dataClass ?? "regulatory",
        entityId: i.entityId,
        periodLabel: i.periodLabel,
        dueDate: i.dueDate,
        status: i.status,
      };
    });

  return filterByResidency(rows, (r) => r.dataClass, policiesByClass, requestingRegion);
}

export async function listBoardPackNotes(groupId: number, fiscalYear: number, fiscalPeriod: number) {
  const rows = await db.select().from(boardPackNotesTable).where(eq(boardPackNotesTable.groupId, groupId));
  return rows.filter((r) => r.fiscalYear === fiscalYear && r.fiscalPeriod === fiscalPeriod);
}
