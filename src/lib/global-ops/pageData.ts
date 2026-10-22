// LEADOS — Part 37: shared server-side data loader for the global-ops surfaces.

import { consolidateGroup, type ConsolidationResult } from "./consolidation";
import {
  getEntityGroup,
  listEliminations,
  listEntitiesForGroup,
  listFinancialLines,
  listFxRates,
} from "./repository";
import type { EntityGroupRecord, EntityRecord, FxRateRecord } from "./types";

export interface GroupPageData {
  group: EntityGroupRecord;
  entities: EntityRecord[];
  rates: FxRateRecord[];
  result: ConsolidationResult;
  fiscalYear: number;
  fiscalPeriod: number;
}

export async function loadGroupPageData(groupId: number, fiscalYear: number, fiscalPeriod: number): Promise<GroupPageData> {
  const group = await getEntityGroup(groupId);
  if (!group) {
    throw new Error(`Entity group ${groupId} not found`);
  }
  const [entities, lines, eliminations, rates] = await Promise.all([
    listEntitiesForGroup(groupId),
    listFinancialLines(groupId, fiscalYear, fiscalPeriod),
    listEliminations(groupId, fiscalYear, fiscalPeriod),
    listFxRates(),
  ]);

  const result = consolidateGroup({
    group: { id: group.id, groupCurrency: group.groupCurrency },
    entities,
    lines,
    eliminations,
    rates,
    fiscalYear,
    fiscalPeriod,
  });

  return { group, entities, rates, result, fiscalYear, fiscalPeriod };
}
