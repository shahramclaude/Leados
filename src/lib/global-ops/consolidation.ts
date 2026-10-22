// LEADOS — Part 37: multi-entity consolidation engine.
//
// Scope assumption (documented, see PHASE 5 self-review in AI-SESSION-LOG.md): entities within
// one EntityGroup share a common chart of accounts (accountCode is comparable across entities).
// Figures are booked at Entity granularity (see schema `financialFigures`); Units exist for
// organisational drill-down inside an entity but are not a separate consolidation level in this
// part.
//
// Consolidation rules applied, per entity, relative to its immediate parent
// (`entity.consolidationMethod`):
//   - "full": 100% of the entity's account lines are included in the parent rollup regardless
//     of ownership %. The portion of equity/earnings not owned by the group is then carved out
//     as Non-Controlling Interest (NCI) — a *visible* line, never netted away silently.
//   - "proportional": only `ownershipPct`% of each account line is included. No NCI line is
//     raised (the unconsolidated share is simply not in the books) — the excluded share is
//     still shown in the drill-down (`inclusionPct` < 100) so it is never mistaken for 100%
//     ownership.
//   - "equity": no line items are consolidated. A single "share of net income" pick-up
//     (ownershipPct% x the investee's own net income) is surfaced as its own disclosure, and the
//     investee's own detail remains visible via `equityPickups[].entityId` drill-through — it is
//     never silently folded into group revenue/expense.
//
// Eliminations are explicit, named ledger adjustments (`EliminationEntry`), applied against a
// specific entity + accountCode. Both the gross figure and the elimination are always retained
// in the contribution record (`grossLocalValue`, `eliminationLocal`, `netLocalValue`) — the
// group total never hides what was eliminated or why (`reason` is mandatory).
//
// "No total without its parts": every `ConsolidatedLine.consolidatedValue` is accompanied by
// `contributions`, a complete per-entity breakdown that sums exactly to the total (tested).

import type { EliminationEntry, EntityRecord, FinancialLine, FxRateRecord, StatementType, TranslationMethod } from "./types";
import { round2 } from "./types";
import { findRate, methodForStatement } from "./fx";

export interface EntityContribution {
  entityId: number;
  entityCode: string;
  statement: StatementType;
  accountCode: string;
  accountLabel: string;
  grossLocalValue: number;
  eliminationLocal: number;
  netLocalValue: number;
  localCurrency: string;
  inclusionPct: number; // cumulative effective inclusion, 0-100
  consolidationMethodApplied: "full" | "proportional";
  translatedValue: number; // netLocalValue * inclusionPct/100, converted to group currency
  method: TranslationMethod;
  rateDate: string;
  rateSource: string;
}

export interface ConsolidatedLine {
  statement: StatementType;
  accountCode: string;
  accountLabel: string;
  groupCurrency: string;
  consolidatedValue: number;
  eliminationsAppliedGroupCcy: number;
  contributions: EntityContribution[];
}

export interface MinorityInterestLine {
  entityId: number;
  entityCode: string;
  parentEntityId: number;
  ownershipPct: number;
  entityNetIncomeLocal: number;
  entityNetIncomeCurrency: string;
  nciAmountGroupCcy: number;
  parentChainInclusionPct: number;
  method: TranslationMethod;
  rateDate: string;
  rateSource: string;
}

export interface EquityPickupLine {
  entityId: number;
  entityCode: string;
  ownershipPct: number;
  investeeNetIncomeLocal: number;
  investeeNetIncomeCurrency: string;
  shareOfNetIncomeGroupCcy: number;
  method: TranslationMethod;
  rateDate: string;
  rateSource: string;
}

export interface ConsolidationResult {
  groupId: number;
  groupCurrency: string;
  fiscalYear: number;
  fiscalPeriod: number;
  lines: ConsolidatedLine[];
  minorityInterest: MinorityInterestLine[];
  equityPickups: EquityPickupLine[];
  /** Every entity actually present in the group tree, with its own standalone (un-netted) net
   * income — used so a failing entity is always visible, even when it rolls up into a healthy
   * group total (see PHASE 5 attack #1). */
  entitySummaries: EntityStandaloneSummary[];
}

export interface EntityStandaloneSummary {
  entityId: number;
  entityCode: string;
  legalName: string;
  functionalCurrency: string;
  consolidationMethod: "full" | "proportional" | "equity";
  ownershipPct: number;
  standaloneNetIncomeLocal: number;
  standaloneNetIncomeGroupCcy: number;
  inclusionPct: number;
}

function accountSign(accountCode: string): 1 | -1 {
  // Revenue (REV*) and asset/debit-style balances add; expense (EXP*) balances are subtracted
  // when computing net income. This is a simplified, documented chart-of-accounts convention
  // for this part, not a full GL sign-convention engine.
  return accountCode.startsWith("EXP") ? -1 : 1;
}

/** Net income for this entity's own books, AFTER netting out any elimination entries booked
 * against this entity's own accounts (e.g. an intercompany COGS line eliminated to zero). This
 * is the figure NCI and equity pickups are computed from — a subsidiary's non-controlling
 * interest reflects its real (post-elimination) performance, not an inflated intercompany
 * gross number. */
function computeNetIncomeLocal(
  lines: FinancialLine[],
  eliminations: EliminationEntry[],
  entityId: number,
  fiscalYear: number,
  fiscalPeriod: number,
): number {
  return round2(
    lines
      .filter((l) => l.entityId === entityId && l.fiscalYear === fiscalYear && l.fiscalPeriod === fiscalPeriod && l.statement === "PL")
      .reduce((sum, l) => {
        const elim = eliminations
          .filter((e) => e.fromEntityId === entityId && e.accountCode === l.accountCode)
          .reduce((s, e) => s + e.amountValue, 0);
        return sum + accountSign(l.accountCode) * (l.amountValue - elim);
      }, 0),
  );
}

export interface ConsolidationInput {
  group: { id: number; groupCurrency: string };
  entities: EntityRecord[]; // must include every entity in the group, any depth
  lines: FinancialLine[];
  eliminations: EliminationEntry[];
  rates: FxRateRecord[];
  fiscalYear: number;
  fiscalPeriod: number;
}

/** Runs full group consolidation: rollup, intercompany elimination, FX translation,
 * minority-interest carve-out and equity-method pickups — with full entity-level drill-down
 * preserved on every total. */
export function consolidateGroup(input: ConsolidationInput): ConsolidationResult {
  const { group, entities, lines, eliminations, rates, fiscalYear, fiscalPeriod } = input;

  const byId = new Map(entities.map((e) => [e.id, e]));
  const childrenOf = new Map<number, EntityRecord[]>();
  for (const e of entities) {
    if (e.parentEntityId !== null) {
      const arr = childrenOf.get(e.parentEntityId) ?? [];
      arr.push(e);
      childrenOf.set(e.parentEntityId, arr);
    }
  }

  const roots = entities.filter((e) => e.parentEntityId === null || !byId.has(e.parentEntityId));

  const contributions: EntityContribution[] = [];
  const minorityInterest: MinorityInterestLine[] = [];
  const equityPickups: EquityPickupLine[] = [];
  const entitySummaries: EntityStandaloneSummary[] = [];

  function translateOne(localValue: number, fromCcy: string, statement: StatementType): { translated: number; method: TranslationMethod; rateDate: string; rateSource: string } {
    const method = methodForStatement(statement);
    if (fromCcy === group.groupCurrency) {
      return { translated: round2(localValue), method: "none", rateDate: "n/a", rateSource: "identity (same currency, no translation required)" };
    }
    const rateRec = findRate(rates, fromCcy, group.groupCurrency, fiscalYear, fiscalPeriod, method);
    if (!rateRec) {
      throw new Error(
        `Consolidation blocked: no FX rate on file for ${fromCcy}->${group.groupCurrency} (method=${method}) in FY${fiscalYear} P${fiscalPeriod}.`,
      );
    }
    return { translated: round2(localValue * rateRec.rate), method, rateDate: rateRec.rateDate, rateSource: rateRec.rateSource };
  }

  // Walk the tree; `parentInclusionPct` is the cumulative effective inclusion of the PARENT
  // into the ultimate group total (100 for a root entity, since it consolidates directly into
  // the group).
  function walk(entity: EntityRecord, parentInclusionPct: number) {
    const standaloneLines = lines.filter(
      (l) => l.entityId === entity.id && l.fiscalYear === fiscalYear && l.fiscalPeriod === fiscalPeriod,
    );
    const netIncomeLocal = computeNetIncomeLocal(lines, eliminations, entity.id, fiscalYear, fiscalPeriod);

    if (entity.consolidationMethod === "equity") {
      const pickupLocal = round2((entity.ownershipPct / 100) * netIncomeLocal);
      const { translated, method, rateDate, rateSource } = translateOne(pickupLocal, entity.functionalCurrency, "PL");
      const shareOfNetIncomeGroupCcy = round2(translated * (parentInclusionPct / 100));
      equityPickups.push({
        entityId: entity.id,
        entityCode: entity.code,
        ownershipPct: entity.ownershipPct,
        investeeNetIncomeLocal: netIncomeLocal,
        investeeNetIncomeCurrency: entity.functionalCurrency,
        shareOfNetIncomeGroupCcy,
        method,
        rateDate,
        rateSource,
      });
      const niTranslated = translateOne(netIncomeLocal, entity.functionalCurrency, "PL");
      entitySummaries.push({
        entityId: entity.id,
        entityCode: entity.code,
        legalName: entity.legalName,
        functionalCurrency: entity.functionalCurrency,
        consolidationMethod: "equity",
        ownershipPct: entity.ownershipPct,
        standaloneNetIncomeLocal: netIncomeLocal,
        standaloneNetIncomeGroupCcy: niTranslated.translated,
        inclusionPct: 0,
      });
      // Equity-method investees are not drilled into further: their own sub-entities (if any)
      // are inside the investee's own books, not the group's.
      return;
    }

    const inclusionFraction = entity.consolidationMethod === "full" ? 100 : entity.ownershipPct;
    const effectiveInclusionPct = round2((inclusionFraction / 100) * parentInclusionPct);

    for (const line of standaloneLines) {
      const elimForLine = eliminations
        .filter((e) => e.fromEntityId === entity.id && e.accountCode === line.accountCode)
        .reduce((sum, e) => sum + e.amountValue, 0);
      const netLocalValue = round2(line.amountValue - elimForLine);
      const { translated, method, rateDate, rateSource } = translateOne(netLocalValue, line.amountCurrency, line.statement);
      const translatedValue = round2(translated * (effectiveInclusionPct / 100));

      contributions.push({
        entityId: entity.id,
        entityCode: entity.code,
        statement: line.statement,
        accountCode: line.accountCode,
        accountLabel: line.accountLabel,
        grossLocalValue: line.amountValue,
        eliminationLocal: round2(elimForLine),
        netLocalValue,
        localCurrency: line.amountCurrency,
        inclusionPct: effectiveInclusionPct,
        consolidationMethodApplied: entity.consolidationMethod,
        translatedValue,
        method,
        rateDate,
        rateSource,
      });
    }

    if (entity.consolidationMethod === "full" && entity.ownershipPct < 100) {
      const nciShareLocal = round2(((100 - entity.ownershipPct) / 100) * netIncomeLocal);
      const { translated, method, rateDate, rateSource } = translateOne(nciShareLocal, entity.functionalCurrency, "PL");
      const nciAmountGroupCcy = round2(translated * (parentInclusionPct / 100));
      minorityInterest.push({
        entityId: entity.id,
        entityCode: entity.code,
        parentEntityId: entity.parentEntityId as number,
        ownershipPct: entity.ownershipPct,
        entityNetIncomeLocal: netIncomeLocal,
        entityNetIncomeCurrency: entity.functionalCurrency,
        nciAmountGroupCcy,
        parentChainInclusionPct: parentInclusionPct,
        method,
        rateDate,
        rateSource,
      });
    }

    const niTranslated = translateOne(netIncomeLocal, entity.functionalCurrency, "PL");
    entitySummaries.push({
      entityId: entity.id,
      entityCode: entity.code,
      legalName: entity.legalName,
      functionalCurrency: entity.functionalCurrency,
      consolidationMethod: entity.consolidationMethod,
      ownershipPct: entity.ownershipPct,
      standaloneNetIncomeLocal: netIncomeLocal,
      standaloneNetIncomeGroupCcy: niTranslated.translated,
      inclusionPct: effectiveInclusionPct,
    });

    for (const child of childrenOf.get(entity.id) ?? []) {
      walk(child, effectiveInclusionPct);
    }
  }

  for (const root of roots) {
    walk(root, 100);
  }

  // Aggregate contributions into consolidated lines, keyed by statement+accountCode.
  const lineKey = (s: StatementType, a: string) => `${s}::${a}`;
  const lineMap = new Map<string, ConsolidatedLine>();
  for (const c of contributions) {
    const key = lineKey(c.statement, c.accountCode);
    let entry = lineMap.get(key);
    if (!entry) {
      entry = {
        statement: c.statement,
        accountCode: c.accountCode,
        accountLabel: c.accountLabel,
        groupCurrency: group.groupCurrency,
        consolidatedValue: 0,
        eliminationsAppliedGroupCcy: 0,
        contributions: [],
      };
      lineMap.set(key, entry);
    }
    entry.contributions.push(c);
    entry.consolidatedValue = round2(entry.consolidatedValue + c.translatedValue);
    if (c.eliminationLocal !== 0) {
      const elimTranslated = translateOne(c.eliminationLocal, c.localCurrency, c.statement);
      entry.eliminationsAppliedGroupCcy = round2(
        entry.eliminationsAppliedGroupCcy + elimTranslated.translated * (c.inclusionPct / 100),
      );
    }
  }

  return {
    groupId: group.id,
    groupCurrency: group.groupCurrency,
    fiscalYear,
    fiscalPeriod,
    lines: Array.from(lineMap.values()).sort((a, b) => (a.statement + a.accountCode).localeCompare(b.statement + b.accountCode)),
    minorityInterest,
    equityPickups,
    entitySummaries,
  };
}

/** Group net income attributable to the owners of the parent: sum of all PL lines, minus total
 * minority interest. Exposed separately so callers never have to re-derive it by hand. */
export function netIncomeAttributableToOwners(result: ConsolidationResult): number {
  const totalPl = result.lines
    .filter((l) => l.statement === "PL")
    .reduce((sum, l) => sum + (l.accountCode.startsWith("EXP") ? -l.consolidatedValue : l.consolidatedValue), 0);
  const totalNci = result.minorityInterest.reduce((sum, m) => sum + m.nciAmountGroupCcy, 0);
  return round2(totalPl - totalNci);
}
