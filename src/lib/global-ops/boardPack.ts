// LEADOS — Part 37: board pack integration (entity notes section).
//
// Part 32's board pack generator is not present in this repository snapshot. This module builds
// the "entity notes" section that part is expected to embed: one row per entity in the group,
// always showing the entity's own standalone net income (group currency AND local currency)
// next to its consolidation treatment, so a struggling entity can never be invisible behind a
// healthy consolidated number (see PHASE 5 #1).

import type { ConsolidationResult } from "./consolidation";
import type { EntityRecord } from "./types";

export interface BoardPackNoteRow {
  entityId: number;
  fiscalYear: number;
  fiscalPeriod: number;
  noteText: string;
  flagLevel: "info" | "watch" | "risk";
}

export interface EntityNotesSectionRow {
  entityId: number;
  entityCode: string;
  legalName: string;
  jurisdictionCode: string;
  consolidationMethod: string;
  ownershipPct: number;
  inclusionPct: number;
  standaloneNetIncomeLocal: number;
  localCurrency: string;
  standaloneNetIncomeGroupCcy: number;
  groupCurrency: string;
  flagLevel: "info" | "watch" | "risk";
  notes: string[];
  /** true when the entity's standalone result is loss-making even though it is immaterial to
   * (or masked by) the group total — the dangerous default-view case called out in PHASE 5. */
  isWeakAndMaterialToFlag: boolean;
}

export function buildEntityNotesSection(
  result: ConsolidationResult,
  entities: EntityRecord[],
  notes: BoardPackNoteRow[],
): EntityNotesSectionRow[] {
  const entityById = new Map(entities.map((e) => [e.id, e]));
  return result.entitySummaries.map((s) => {
    const entity = entityById.get(s.entityId);
    const entityNotes = notes.filter((n) => n.entityId === s.entityId);
    const explicitFlag = entityNotes.reduce<"info" | "watch" | "risk">((worst, n) => {
      const rank = { info: 0, watch: 1, risk: 2 } as const;
      return rank[n.flagLevel] > rank[worst] ? n.flagLevel : worst;
    }, "info");
    const isLossMaking = s.standaloneNetIncomeLocal < 0;
    const flagLevel = isLossMaking && explicitFlag === "info" ? "watch" : explicitFlag;
    return {
      entityId: s.entityId,
      entityCode: s.entityCode,
      legalName: entity?.legalName ?? s.entityCode,
      jurisdictionCode: entity?.jurisdictionCode ?? "—",
      consolidationMethod: s.consolidationMethod,
      ownershipPct: s.ownershipPct,
      inclusionPct: s.inclusionPct,
      standaloneNetIncomeLocal: s.standaloneNetIncomeLocal,
      localCurrency: s.functionalCurrency,
      standaloneNetIncomeGroupCcy: s.standaloneNetIncomeGroupCcy,
      groupCurrency: result.groupCurrency,
      flagLevel,
      notes: entityNotes.map((n) => n.noteText),
      isWeakAndMaterialToFlag: isLossMaking,
    };
  });
}
