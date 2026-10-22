// DB orchestration for the Part 13 sensing & forecasting surfaces. Pure
// detection/scoring/briefing math lives in the sibling modules; this file
// wires that math to Postgres via Drizzle and is intentionally the only
// place in this feature that touches `db` directly.

import { db } from "@/db";
import { eq, desc, asc, and, inArray, sql } from "drizzle-orm";
import {
  metricSeries,
  metricPoints,
  anomalyAlerts,
  signalItems,
  weakSignalThemes,
  weakSignalThemeItems,
  hypotheses,
  forecastQuestions,
  forecasts,
  forecastScores,
  riskRegister,
  leadingIndicators,
  findings,
  notifications,
  briefs,
} from "@/db/schema";
import { detectAllMethods, primaryMethodFor } from "./anomalyDetection";
import { mineThemes, type SignalItemInput } from "./weakSignalRadar";
import { brierScore, logLoss, clampProbability, crowdAggregate } from "./scoring";
import { buildLeaderboard, type ResolvedForecastRecord } from "./tournament";
import { evaluateIndicator } from "./leadingIndicators";
import { generateBrief, lintBrief, type BriefInputs } from "./briefing";
import { generateSeries } from "./seriesGenerator";
import type { SeriesMeta } from "./types";

// ---------------------------------------------------------------------------
// Seeding (idempotent demo data so the UI has something real to show)
// ---------------------------------------------------------------------------

let seedInFlight: Promise<void> | null = null;

export async function ensureSeedData(): Promise<void> {
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    const existing = await db.select({ id: metricSeries.id }).from(metricSeries).limit(1);
    if (existing.length > 0) return;
    await seedAll();
  })();
  return seedInFlight;
}

async function seedAll() {
  const seriesDefs: { meta: SeriesMeta; genSeed: number; genOpts: Parameters<typeof generateSeries>[1] }[] = [
    {
      meta: { key: "signups_daily", name: "Daily signups", unit: "signups" },
      genSeed: 101,
      genOpts: { seed: 101, length: 90, startValue: 160, noiseStd: 10, injections: ["level_shift"] },
    },
    {
      meta: { key: "checkout_latency_ms", name: "Checkout latency (p95)", unit: "ms", heavyTailed: true },
      genSeed: 202,
      genOpts: { seed: 202, length: 90, startValue: 420, noiseStd: 25, heavyTailed: true, injections: ["spike"] },
    },
    {
      meta: { key: "weekly_active_users", name: "Weekly active users", unit: "users", seasonalPeriod: 7 },
      genSeed: 303,
      genOpts: { seed: 303, length: 90, startValue: 5400, noiseStd: 60, seasonalPeriod: 7, seasonalAmplitude: 220, injections: ["seasonal_break"] },
    },
    {
      meta: { key: "support_ticket_backlog", name: "Support ticket backlog", unit: "tickets" },
      genSeed: 404,
      genOpts: { seed: 404, length: 90, startValue: 80, noiseStd: 6, dailyTrend: 0.05, injections: ["trend_change"] },
    },
  ];

  const seriesIds: Record<string, number> = {};
  for (const def of seriesDefs) {
    const [row] = await db
      .insert(metricSeries)
      .values({
        key: def.meta.key,
        name: def.meta.name,
        unit: def.meta.unit,
        seasonalPeriod: def.meta.seasonalPeriod ?? null,
        heavyTailed: def.meta.heavyTailed ?? false,
      })
      .returning({ id: metricSeries.id });
    seriesIds[def.meta.key] = row.id;

    const generated = generateSeries(def.meta, def.genOpts);
    if (generated.points.length > 0) {
      await db.insert(metricPoints).values(
        generated.points.map((p) => ({ seriesId: row.id, ts: new Date(p.ts), value: p.value })),
      );
    }
  }

  // Weak-signal radar seed text.
  const now = Date.now();
  const day = 86400000;
  const signalTexts: { text: string; source: string; daysAgo: number }[] = [];
  for (let i = 0; i < 20; i++) {
    signalTexts.push({ text: "customer mentioned refund delays in support chat", source: "support", daysAgo: Math.random() * 10 });
  }
  for (let i = 0; i < 6; i++) {
    signalTexts.push({ text: "refund delays causing churn risk per sales call notes", source: "sales", daysAgo: Math.random() * 10 });
  }
  for (let i = 0; i < 4; i++) {
    signalTexts.push({ text: "general product feedback about onboarding flow", source: "support", daysAgo: 5 + Math.random() * 20 });
  }
  for (let i = 0; i < 8; i++) {
    signalTexts.push({ text: "refund delays mentioned again this week by enterprise account", source: "support", daysAgo: Math.random() * 3 });
  }
  if (signalTexts.length > 0) {
    await db.insert(signalItems).values(
      signalTexts.map((s) => ({ text: s.text, source: s.source, ts: new Date(now - s.daysAgo * day) })),
    );
  }

  // Hypotheses (Part 12 stub) + forecast questions.
  const [h1] = await db
    .insert(hypotheses)
    .values({ question: "Checkout latency regressions are driven by the new payment provider.", description: "Hypothesis from Part 12 causal store.", status: "open" })
    .returning({ id: hypotheses.id });

  const questionDefs = [
    { hypothesisId: h1.id, question: "Will weekly signups exceed 1,200 this sprint?", resolveBy: new Date(now - 2 * day), resolved: true, outcome: true },
    { hypothesisId: null, question: "Will churn rate stay under 4% this month?", resolveBy: new Date(now - 1 * day), resolved: true, outcome: false },
    { hypothesisId: h1.id, question: "Will checkout latency breach its 1000ms threshold this week?", resolveBy: new Date(now + 3 * day), resolved: false, outcome: null as boolean | null },
    { hypothesisId: null, question: "Will the 'refund delays' weak signal persist to trend status?", resolveBy: new Date(now + 10 * day), resolved: false, outcome: null as boolean | null },
  ];

  const questionIds: number[] = [];
  for (const q of questionDefs) {
    const [row] = await db
      .insert(forecastQuestions)
      .values({
        hypothesisId: q.hypothesisId,
        question: q.question,
        resolveBy: q.resolveBy,
        status: q.resolved ? "resolved" : "open",
        resolutionValue: q.outcome,
        resolvedAt: q.resolved ? q.resolveBy : null,
      })
      .returning({ id: forecastQuestions.id });
    questionIds.push(row.id);
  }

  const forecasterSets: { forecaster: string; isModel: boolean; probs: number[] }[] = [
    { forecaster: "alice", isModel: false, probs: [0.75, 0.6, 0.4, 0.35] },
    { forecaster: "bob", isModel: false, probs: [0.55, 0.3, 0.65, 0.2] },
    { forecaster: "carol", isModel: false, probs: [0.9, 0.2, 0.55, 0.5] },
    { forecaster: "model:ewma-baseline", isModel: true, probs: [0.68, 0.45, 0.7, 0.3] },
  ];

  const forecastIdsByQuestion: number[][] = questionIds.map(() => []);
  for (const fset of forecasterSets) {
    for (let i = 0; i < questionIds.length; i++) {
      const [row] = await db
        .insert(forecasts)
        .values({ questionId: questionIds[i], forecaster: fset.forecaster, isModel: fset.isModel, probability: clampProbability(fset.probs[i]) })
        .returning({ id: forecasts.id });
      forecastIdsByQuestion[i].push(row.id);
    }
  }

  // Score the two already-resolved questions.
  for (let i = 0; i < questionDefs.length; i++) {
    const q = questionDefs[i];
    if (!q.resolved || q.outcome === null) continue;
    const forecastRows = await db
      .select()
      .from(forecasts)
      .where(eq(forecasts.questionId, questionIds[i]));
    for (const f of forecastRows) {
      await db.insert(forecastScores).values({
        forecastId: f.id,
        questionId: questionIds[i],
        forecaster: f.forecaster,
        brier: brierScore(f.probability, q.outcome),
        logLoss: logLoss(f.probability, q.outcome),
      });
    }
  }

  // Risk register + leading indicators.
  const [risk1] = await db
    .insert(riskRegister)
    .values({ title: "Checkout degradation", description: "Sustained checkout latency regression risking conversion loss.", status: "open" })
    .returning({ id: riskRegister.id });

  await db.insert(leadingIndicators).values({
    riskId: risk1.id,
    seriesId: seriesIds["checkout_latency_ms"],
    direction: "above",
    thresholdValue: 1000,
    status: "armed",
  });

  const [risk2] = await db
    .insert(riskRegister)
    .values({ title: "Support backlog overload", description: "Growing ticket backlog risking SLA breach.", status: "open" })
    .returning({ id: riskRegister.id });

  await db.insert(leadingIndicators).values({
    riskId: risk2.id,
    seriesId: seriesIds["support_ticket_backlog"],
    direction: "above",
    thresholdValue: 150,
    status: "armed",
  });

  // Run detection once so the Radar/Metric Monitor have real alerts.
  await runDetectionForAllSeries();
  await mineAndStoreThemes();
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

function metaFromRow(row: typeof metricSeries.$inferSelect): SeriesMeta {
  return {
    key: row.key,
    name: row.name,
    unit: row.unit,
    seasonalPeriod: row.seasonalPeriod,
    heavyTailed: row.heavyTailed,
  };
}

export async function runDetectionForAllSeries(): Promise<number> {
  const seriesRows = await db.select().from(metricSeries);
  let inserted = 0;
  for (const series of seriesRows) {
    inserted += await runDetectionForSeries(series.id);
  }
  return inserted;
}

export async function runDetectionForSeries(seriesId: number): Promise<number> {
  const [series] = await db.select().from(metricSeries).where(eq(metricSeries.id, seriesId));
  if (!series) return 0;
  const pointRows = await db
    .select()
    .from(metricPoints)
    .where(eq(metricPoints.seriesId, seriesId))
    .orderBy(asc(metricPoints.ts));
  if (pointRows.length === 0) return 0;

  const points = pointRows.map((p) => ({ ts: p.ts.toISOString(), value: p.value }));
  const meta = metaFromRow(series);
  const method = primaryMethodFor(meta);
  const all = detectAllMethods(points, meta);
  const alerts = all[method];
  if (alerts.length === 0) return 0;

  const existing = await db
    .select({ ts: anomalyAlerts.ts, method: anomalyAlerts.method })
    .from(anomalyAlerts)
    .where(eq(anomalyAlerts.seriesId, seriesId));
  const existingKey = new Set(existing.map((e) => `${e.method}:${e.ts.toISOString()}`));

  const toInsert = alerts.filter((a) => !existingKey.has(`${a.method}:${a.ts}`));
  if (toInsert.length === 0) return 0;

  await db.insert(anomalyAlerts).values(
    toInsert.map((a) => ({
      seriesId,
      ts: new Date(a.ts),
      method: a.method,
      observed: a.observed,
      expectedLow: a.expectedLow,
      expectedHigh: a.expectedHigh,
      deviation: a.deviation,
      falsePositiveEstimate: a.falsePositiveEstimate,
      likelyCauses: a.likelyCauses,
      severity: a.severity,
    })),
  );
  return toInsert.length;
}

export async function listSeriesWithLatest() {
  const seriesRows = await db.select().from(metricSeries).orderBy(asc(metricSeries.name));
  const out = [];
  for (const series of seriesRows) {
    const [latest] = await db
      .select()
      .from(metricPoints)
      .where(eq(metricPoints.seriesId, series.id))
      .orderBy(desc(metricPoints.ts))
      .limit(1);
    const openAlerts = await db
      .select({ id: anomalyAlerts.id })
      .from(anomalyAlerts)
      .where(and(eq(anomalyAlerts.seriesId, series.id), eq(anomalyAlerts.status, "open")));
    out.push({ series, latest: latest ?? null, openAlertCount: openAlerts.length });
  }
  return out;
}

export async function getSeriesDetail(seriesId: number) {
  const [series] = await db.select().from(metricSeries).where(eq(metricSeries.id, seriesId));
  if (!series) return null;
  const pointRows = await db
    .select()
    .from(metricPoints)
    .where(eq(metricPoints.seriesId, seriesId))
    .orderBy(asc(metricPoints.ts));
  const alertRows = await db
    .select()
    .from(anomalyAlerts)
    .where(eq(anomalyAlerts.seriesId, seriesId))
    .orderBy(desc(anomalyAlerts.ts));
  const meta = metaFromRow(series);
  const method = primaryMethodFor(meta);
  return { series, points: pointRows, alerts: alertRows, primaryMethod: method };
}

export async function muteAlert(alertId: number, reason: string) {
  await db.update(anomalyAlerts).set({ status: "muted", muteReason: reason }).where(eq(anomalyAlerts.id, alertId));
}

export async function unmuteAlert(alertId: number) {
  await db.update(anomalyAlerts).set({ status: "open", muteReason: null }).where(eq(anomalyAlerts.id, alertId));
}

// ---------------------------------------------------------------------------
// Weak-signal radar
// ---------------------------------------------------------------------------

export async function mineAndStoreThemes() {
  const items = await db.select().from(signalItems).orderBy(asc(signalItems.ts));
  if (items.length === 0) return [];
  const input: SignalItemInput[] = items.map((i) => ({ id: i.id, text: i.text, ts: i.ts.toISOString() }));
  const themes = mineThemes(input);

  for (const theme of themes) {
    const [existingTheme] = await db.select().from(weakSignalThemes).where(eq(weakSignalThemes.ngram, theme.ngram));
    let themeId: number;
    if (existingTheme) {
      themeId = existingTheme.id;
      await db
        .update(weakSignalThemes)
        .set({
          label: theme.label,
          status: theme.status,
          evidenceCount: theme.evidenceCount,
          velocity: theme.velocity,
          lastSeen: new Date(theme.lastSeen),
          persistenceDays: theme.persistenceDays,
        })
        .where(eq(weakSignalThemes.id, themeId));
    } else {
      const [row] = await db
        .insert(weakSignalThemes)
        .values({
          label: theme.label,
          ngram: theme.ngram,
          status: theme.status,
          evidenceCount: theme.evidenceCount,
          velocity: theme.velocity,
          firstSeen: new Date(theme.firstSeen),
          lastSeen: new Date(theme.lastSeen),
          persistenceDays: theme.persistenceDays,
        })
        .returning({ id: weakSignalThemes.id });
      themeId = row.id;
    }

    const existingLinks = await db
      .select({ signalItemId: weakSignalThemeItems.signalItemId })
      .from(weakSignalThemeItems)
      .where(eq(weakSignalThemeItems.themeId, themeId));
    const existingItemIds = new Set(existingLinks.map((l) => l.signalItemId));
    const newLinks = theme.evidenceItemIds.filter((id) => !existingItemIds.has(id));
    if (newLinks.length > 0) {
      await db.insert(weakSignalThemeItems).values(newLinks.map((id) => ({ themeId, signalItemId: id, score: theme.velocity })));
    }
  }

  return themes;
}

export async function listThemes() {
  return db.select().from(weakSignalThemes).orderBy(desc(weakSignalThemes.velocity));
}

// ---------------------------------------------------------------------------
// Forecasting tournament
// ---------------------------------------------------------------------------

export async function listQuestions() {
  const questionRows = await db.select().from(forecastQuestions).orderBy(desc(forecastQuestions.createdAt));
  const out = [];
  for (const q of questionRows) {
    const forecastRows = await db.select().from(forecasts).where(eq(forecasts.questionId, q.id)).orderBy(desc(forecasts.createdAt));
    const { mean, extremized } = crowdAggregate(forecastRows.map((f) => f.probability));
    out.push({ question: q, forecasts: forecastRows, crowdMean: mean, crowdExtremized: extremized });
  }
  return out;
}

export async function submitForecast(questionId: number, forecaster: string, probability: number, isModel = false) {
  const clamped = clampProbability(probability);
  const [row] = await db.insert(forecasts).values({ questionId, forecaster, isModel, probability: clamped }).returning();
  return row;
}

export async function resolveQuestion(questionId: number, outcome: boolean) {
  const [q] = await db.select().from(forecastQuestions).where(eq(forecastQuestions.id, questionId));
  if (!q) throw new Error("question not found");
  if (q.status === "resolved") throw new Error("question already resolved");

  await db
    .update(forecastQuestions)
    .set({ status: "resolved", resolutionValue: outcome, resolvedAt: new Date() })
    .where(eq(forecastQuestions.id, questionId));

  const forecastRows = await db.select().from(forecasts).where(eq(forecasts.questionId, questionId));
  const scores = [];
  for (const f of forecastRows) {
    const [row] = await db
      .insert(forecastScores)
      .values({
        forecastId: f.id,
        questionId,
        forecaster: f.forecaster,
        brier: brierScore(f.probability, outcome),
        logLoss: logLoss(f.probability, outcome),
      })
      .returning();
    scores.push(row);
  }
  return scores;
}

export async function getLeaderboard() {
  const scoreRows = await db
    .select({
      forecaster: forecastScores.forecaster,
      brier: forecastScores.brier,
      logLoss: forecastScores.logLoss,
      questionId: forecastScores.questionId,
    })
    .from(forecastScores);

  // Need outcome + isModel + probability per record for calibration; join
  // back to forecasts/questions.
  const records: ResolvedForecastRecord[] = [];
  for (const s of scoreRows) {
    const [q] = await db.select().from(forecastQuestions).where(eq(forecastQuestions.id, s.questionId));
    const [f] = await db
      .select()
      .from(forecasts)
      .where(and(eq(forecasts.questionId, s.questionId), eq(forecasts.forecaster, s.forecaster)))
      .orderBy(desc(forecasts.createdAt))
      .limit(1);
    if (!q || q.resolutionValue === null || !f) continue;
    records.push({ forecaster: s.forecaster, isModel: f.isModel, probability: f.probability, outcome: q.resolutionValue, questionId: s.questionId });
  }
  return buildLeaderboard(records);
}

// ---------------------------------------------------------------------------
// Leading-indicator framework
// ---------------------------------------------------------------------------

export async function listRisksWithIndicators() {
  const riskRows = await db.select().from(riskRegister).orderBy(asc(riskRegister.title));
  const out = [];
  for (const risk of riskRows) {
    const indicatorRows = await db.select().from(leadingIndicators).where(eq(leadingIndicators.riskId, risk.id));
    const indicatorsWithSeries = [];
    for (const ind of indicatorRows) {
      const [series] = await db.select().from(metricSeries).where(eq(metricSeries.id, ind.seriesId));
      const [latestPoint] = await db
        .select()
        .from(metricPoints)
        .where(eq(metricPoints.seriesId, ind.seriesId))
        .orderBy(desc(metricPoints.ts))
        .limit(1);
      indicatorsWithSeries.push({ indicator: ind, series, latestPoint: latestPoint ?? null });
    }
    out.push({ risk, indicators: indicatorsWithSeries });
  }
  return out;
}

export async function checkIndicator(indicatorId: number) {
  const [indicator] = await db.select().from(leadingIndicators).where(eq(leadingIndicators.id, indicatorId));
  if (!indicator) throw new Error("indicator not found");
  const [latestPoint] = await db
    .select()
    .from(metricPoints)
    .where(eq(metricPoints.seriesId, indicator.seriesId))
    .orderBy(desc(metricPoints.ts))
    .limit(1);
  if (!latestPoint) throw new Error("no data for series");

  const evaluation = evaluateIndicator(latestPoint.value, indicator.direction as "above" | "below", indicator.thresholdValue);

  await db.update(leadingIndicators).set({ lastCheckedAt: new Date() }).where(eq(leadingIndicators.id, indicatorId));

  if (evaluation.breached && indicator.status !== "breached") {
    const [risk] = await db.select().from(riskRegister).where(eq(riskRegister.id, indicator.riskId));
    const [series] = await db.select().from(metricSeries).where(eq(metricSeries.id, indicator.seriesId));

    await db.update(leadingIndicators).set({ status: "breached" }).where(eq(leadingIndicators.id, indicatorId));

    const [finding] = await db
      .insert(findings)
      .values({
        source: "indicator_breach",
        title: `Leading indicator breached for risk "${risk?.title ?? indicator.riskId}"`,
        description: `Series "${series?.name ?? indicator.seriesId}" reached ${latestPoint.value.toFixed(2)} (${indicator.direction} threshold ${indicator.thresholdValue}).`,
        severity: "high",
        relatedType: "leading_indicator",
        relatedId: indicatorId,
      })
      .returning();

    // Part 14 seam stub: nothing is actually sent. Status stays
    // 'queued_stub' so it's unambiguous this is not a live notification
    // channel yet.
    await db.insert(notifications).values({
      findingId: finding.id,
      channel: "stub",
      status: "queued_stub",
      payload: { reason: "indicator_breach", indicatorId, seriesId: indicator.seriesId, value: latestPoint.value },
    });

    return { evaluation, finding };
  }

  return { evaluation, finding: null };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export async function listFindings() {
  return db.select().from(findings).orderBy(desc(findings.createdAt));
}

export async function listNotifications() {
  return db.select().from(notifications).orderBy(desc(notifications.createdAt));
}

// ---------------------------------------------------------------------------
// Morning brief
// ---------------------------------------------------------------------------

export async function generateTodayBrief() {
  const asOf = new Date();
  const since = new Date(asOf.getTime() - 24 * 3600 * 1000);

  const seriesRows = await db.select().from(metricSeries);
  const seriesById = new Map(seriesRows.map((s) => [s.id, s]));

  const recentAlerts = await db
    .select()
    .from(anomalyAlerts)
    .where(sql`${anomalyAlerts.createdAt} >= ${since}`)
    .orderBy(desc(anomalyAlerts.createdAt));

  const overnightAlerts: BriefInputs["overnightAlerts"] = recentAlerts.map((a) => ({
    alertId: a.id,
    seriesName: seriesById.get(a.seriesId)?.name ?? `series #${a.seriesId}`,
    method: a.method,
    observed: a.observed,
    expectedLow: a.expectedLow,
    expectedHigh: a.expectedHigh,
    deviation: a.deviation,
    falsePositiveEstimate: a.falsePositiveEstimate,
    severity: a.severity,
  }));

  const resolvedRecently = await db
    .select()
    .from(forecastQuestions)
    .where(sql`${forecastQuestions.resolvedAt} >= ${since}`);
  const newForecastsRecently = await db
    .select()
    .from(forecasts)
    .where(sql`${forecasts.createdAt} >= ${since}`);

  const forecastUpdates: BriefInputs["forecastUpdates"] = [];
  for (const q of resolvedRecently) {
    const scoreRows = await db.select().from(forecastScores).where(eq(forecastScores.questionId, q.id));
    const best = scoreRows.sort((a, b) => a.brier - b.brier)[0];
    forecastUpdates.push({
      questionId: q.id,
      question: q.question,
      kind: "resolved",
      detail: `resolved ${q.resolutionValue ? "YES" : "NO"}; ${scoreRows.length} forecasts scored${best ? `, best Brier ${best.brier.toFixed(4)} (${best.forecaster})` : ""}.`,
    });
  }
  const newByQuestion = new Map<number, number>();
  for (const f of newForecastsRecently) newByQuestion.set(f.questionId, (newByQuestion.get(f.questionId) ?? 0) + 1);
  for (const [questionId, count] of newByQuestion.entries()) {
    const [q] = await db.select().from(forecastQuestions).where(eq(forecastQuestions.id, questionId));
    if (!q) continue;
    const allForecasts = await db.select().from(forecasts).where(eq(forecasts.questionId, questionId));
    const { extremized } = crowdAggregate(allForecasts.map((f) => f.probability));
    forecastUpdates.push({
      questionId,
      question: q.question,
      kind: "new_forecast",
      detail: `${count} new forecast(s) in the last 24h; crowd (extremized) now at ${extremized.toFixed(2)}.`,
    });
  }

  const riskRows = await listRisksWithIndicators();
  const riskProximities: BriefInputs["riskProximities"] = [];
  for (const { risk, indicators } of riskRows) {
    for (const { indicator, latestPoint } of indicators) {
      if (!latestPoint) continue;
      const evaluation = evaluateIndicator(latestPoint.value, indicator.direction as "above" | "below", indicator.thresholdValue);
      if (evaluation.proximity >= 0.8) {
        riskProximities.push({
          riskId: risk.id,
          riskTitle: risk.title,
          indicatorId: indicator.id,
          currentValue: latestPoint.value,
          thresholdValue: indicator.thresholdValue,
          proximity: evaluation.proximity,
          direction: indicator.direction as "above" | "below",
        });
      }
    }
  }

  const themeRows = await listThemes();
  const weakSignals: BriefInputs["weakSignals"] = themeRows
    .filter((t) => new Date(t.lastSeen) >= since || t.status === "trend")
    .map((t) => ({ themeLabel: t.label, status: t.status as "signal" | "trend", velocity: t.velocity, evidenceCount: t.evidenceCount }));

  const inputs: BriefInputs = {
    asOf,
    monitoredSeriesCount: seriesRows.length,
    overnightAlerts,
    forecastUpdates,
    riskProximities,
    weakSignals,
  };

  const { content, citationsCount } = generateBrief(inputs);
  const lint = lintBrief(content);

  const briefDate = asOf.toISOString().slice(0, 10);
  const existing = await db.select().from(briefs).where(eq(briefs.briefDate, briefDate));
  if (existing.length > 0) {
    const [row] = await db
      .update(briefs)
      .set({ content, citationsCount, lintPassed: lint.passed, lintErrors: lint.errors })
      .where(eq(briefs.id, existing[0].id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(briefs)
    .values({ briefDate, content, citationsCount, lintPassed: lint.passed, lintErrors: lint.errors })
    .returning();
  return row;
}

export async function listBriefs() {
  return db.select().from(briefs).orderBy(desc(briefs.briefDate));
}

// ---------------------------------------------------------------------------
// Radar (combined triage view)
// ---------------------------------------------------------------------------

export async function getRadarData() {
  const openAlerts = await db.select().from(anomalyAlerts).where(eq(anomalyAlerts.status, "open")).orderBy(desc(anomalyAlerts.deviation));
  const seriesRows = await db.select().from(metricSeries);
  const seriesById = new Map(seriesRows.map((s) => [s.id, s]));
  const themeRows = await listThemes();
  const questionRows = await db.select().from(forecastQuestions).where(eq(forecastQuestions.status, "open"));

  const alertItems = openAlerts.map((a) => ({
    type: "anomaly" as const,
    id: a.id,
    series: seriesById.get(a.seriesId)?.name ?? `series #${a.seriesId}`,
    method: a.method,
    severity: a.severity,
    deviation: a.deviation,
    falsePositiveEstimate: a.falsePositiveEstimate,
    ts: a.ts,
    likelyCauses: a.likelyCauses,
    expectedLow: a.expectedLow,
    expectedHigh: a.expectedHigh,
    observed: a.observed,
  }));

  const signalItemsOut = themeRows.map((t) => ({
    type: "weak_signal" as const,
    id: t.id,
    label: t.label,
    status: t.status,
    velocity: t.velocity,
    evidenceCount: t.evidenceCount,
    persistenceDays: t.persistenceDays,
  }));

  const questionItems = questionRows.map((q) => ({
    type: "forecast_question" as const,
    id: q.id,
    question: q.question,
    resolveBy: q.resolveBy,
  }));

  const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const combined = [
    ...alertItems.map((a) => ({ ...a, rank: severityRank[a.severity] ?? 0 })),
    ...signalItemsOut.map((s) => ({ ...s, rank: s.status === "trend" ? 2 : 1 })),
    ...questionItems.map((q) => ({ ...q, rank: 1 })),
  ].sort((a, b) => b.rank - a.rank);

  return { alerts: alertItems, weakSignals: signalItemsOut, questions: questionItems, combined };
}
