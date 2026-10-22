// ---------------------------------------------------------------------------
// src/lib/esgData.ts
//
// Data-access layer: loads rows from Postgres via Drizzle and maps them into
// the plain types consumed by the pure functions in sustainability.ts,
// emissionFactors.ts, costModel.ts, macc.ts and obligationTracker.ts.
// ---------------------------------------------------------------------------
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  emissionFactors,
  activities,
  financeLedgerEntries,
  environmentalMetrics,
  peopleAggregates,
  governanceDecisions,
  targets,
  abatementInitiatives,
  disclosurePacks,
  obligations,
} from "@/db/schema";
import { ActivityRecord, EnvironmentalMetricRecord, GovernanceDecisionRecord, PeopleAggregateRecord, TargetRecord } from "./sustainability";
import { EmissionFactorRow } from "./emissionFactors";
import { SpendActivity, FinanceLedgerEntry } from "./costModel";
import { AbatementInitiativeInput } from "./macc";
import { ObligationRecord } from "./obligationTracker";
import { EvidenceClass, Method } from "./evidence";

export async function loadFactors(): Promise<EmissionFactorRow[]> {
  const rows = await db.select().from(emissionFactors);
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    supersedes: r.supersedes,
    scope: r.scope,
    category: r.category,
    region: r.region,
    unit: r.unit,
    gridMethod: r.gridMethod as "location-based" | "market-based" | null,
    factorValue: Number(r.factorValue),
    method: r.method as Method,
    evidenceClass: r.evidenceClass as EvidenceClass,
    uncertaintyPct: Number(r.uncertaintyPct),
    source: r.source,
    sourceUrl: r.sourceUrl,
    validFrom: r.validFrom,
    validTo: r.validTo,
  }));
}

export async function loadActivities(): Promise<ActivityRecord[]> {
  const rows = await db.select().from(activities);
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    category: r.category,
    region: r.region,
    period: r.period,
    quantity: Number(r.quantity),
    unit: r.unit,
    method: r.method as Method,
    spendAmountUsd: r.spendAmountUsd !== null ? Number(r.spendAmountUsd) : null,
    financeLedgerRef: r.financeLedgerRef,
    factorId: r.factorId,
    gridMethod: r.gridMethod as "location-based" | "market-based" | null,
    sourceDescription: r.sourceDescription,
  }));
}

export async function loadFinanceLedger(): Promise<FinanceLedgerEntry[]> {
  const rows = await db.select().from(financeLedgerEntries);
  return rows.map((r) => ({ id: r.id, period: r.period, category: r.category, amountUsd: Number(r.amountUsd) }));
}

export async function loadSpendActivities(): Promise<SpendActivity[]> {
  const acts = await loadActivities();
  return acts
    .filter((a) => a.method === "spend-based" && a.spendAmountUsd !== null)
    .map((a) => ({ id: a.id, period: a.period, category: a.category, spendAmountUsd: a.spendAmountUsd!, financeLedgerRef: a.financeLedgerRef }));
}

export async function loadEnvironmentalMetrics(): Promise<EnvironmentalMetricRecord[]> {
  const rows = await db.select().from(environmentalMetrics);
  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    metric: r.metric,
    value: Number(r.value),
    unit: r.unit,
    method: r.method as Method,
    evidenceClass: r.evidenceClass as EvidenceClass,
    source: r.source,
  }));
}

export async function loadPeopleAggregates(): Promise<PeopleAggregateRecord[]> {
  const rows = await db.select().from(peopleAggregates);
  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    metric: r.metric,
    cohort: r.cohort,
    cohortSize: r.cohortSize,
    value: Number(r.value),
    unit: r.unit,
    evidenceClass: r.evidenceClass as EvidenceClass,
    kAnonymityThreshold: r.kAnonymityThreshold,
  }));
}

export async function loadGovernanceDecisions(): Promise<GovernanceDecisionRecord[]> {
  const rows = await db.select().from(governanceDecisions);
  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    decisionTitle: r.decisionTitle,
    reviewedByBoard: r.reviewedByBoard,
    hasDocumentedRationale: r.hasDocumentedRationale,
    withinSlaDays: r.withinSlaDays,
    cadenceDays: r.cadenceDays,
  }));
}

export async function loadTargets(): Promise<TargetRecord[]> {
  const rows = await db.select().from(targets);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope,
    category: r.category,
    baselineYear: r.baselineYear,
    baselineValueTco2e: Number(r.baselineValueTco2e),
    targetYear: r.targetYear,
    targetValueTco2e: Number(r.targetValueTco2e),
    pathway: r.pathway as "linear" | "geometric",
    okrRef: r.okrRef,
  }));
}

export async function loadAbatementInitiatives(): Promise<AbatementInitiativeInput[]> {
  const rows = await db.select().from(abatementInitiatives);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope,
    category: r.category,
    annualAbatementTco2e: Number(r.annualAbatementTco2e),
    annualNetCostUsd: Number(r.annualNetCostUsd),
    implementationStatus: r.implementationStatus,
    portfolioRef: r.portfolioRef,
    evidenceClass: r.evidenceClass,
  }));
}

export async function loadObligations(): Promise<ObligationRecord[]> {
  const rows = await db.select().from(obligations);
  return rows.map((r) => ({ id: r.id, name: r.name, standard: r.standard, dueDate: r.dueDate, linkedPackId: r.linkedPackId }));
}

export async function loadDisclosurePackSummaries() {
  const rows = await db.select().from(disclosurePacks);
  return rows.map((r) => ({ id: r.id, period: r.period, standard: r.standard, generatedAt: r.generatedAt.toISOString(), gaps: r.gaps as unknown[] }));
}

export async function loadDisclosurePackById(id: string) {
  const rows = await db.select().from(disclosurePacks).where(eq(disclosurePacks.id, id));
  return rows[0] ?? null;
}
