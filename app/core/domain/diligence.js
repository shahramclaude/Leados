/**
 * app/core/domain/diligence.js — the pure read model and the closed-form maths
 * behind the Diligence Ledger (ADR-0104, Schema v106, `#/diligence`).
 *
 * WHAT IS MEASURED
 * ----------------
 * For each decision, RULE-DLG-01 froze the KNOWABLE SET: the dated records from
 * five evidence classes that existed on or before the decision date. This module
 * reads that frozen set back, partitions it by what the leader actually did, and
 * reports the DELIBERATION FRONTIER — the boundary between what was knowable and
 * what was consulted. Three things make it more than a checklist:
 *
 *   1. "Ruled out with a reason" COUNTS AS DILIGENCE. The Hindsight Lock can only
 *      see a link that was made; it charges "missed" for anything unlinked. A
 *      leader who looked at a fact and judged it irrelevant did the work — this
 *      module records that judgement and refuses to call it a miss.
 *   2. A class-level Jeffreys Beta(½,½) credible interval detects SYSTEMATIC
 *      inattention across many decisions, with a declared refusal below the
 *      evidence floor. A dark class is a property of the information system
 *      around a span, never a judgement of a person.
 *   3. A pre-declared PROCESS FORECAST is graded ONCE, out of sample, by Brier
 *      skill against a strictly-prior (maximum-entropy 0.5) base rate. A
 *      negative skill is printed, never hidden.
 *
 * Every statistic is exported and pure so a test can check it by hand. The
 * maths is NOT novel (Wilson 1927; Jeffreys 1946; Brier 1950) — what is novel is
 * applying it to the organisation's OWN dated deliberation record, before the
 * outcome, with honest refusals. No causal claim, no sentiment score, no rating
 * of a person.
 *
 * Pure module: no storage access, no clock beyond the injected `now`.
 */

import { dayKey, weekKey } from '../time.js';
import { buildSeats, activeSeat } from './seat.js';
import { diligenceConventions } from './diligenceSchema.js';
import {
  COVERAGE_BANDS,
  DILIGENCE_DISCLOSURE,
  DILIGENCE_ENGINE_VERSION,
  DILIGENCE_LIMITS,
  DILIGENCE_PLAYBOOK,
  EVIDENCE_CLASSES,
  EVIDENCE_CLASS_KEYS,
  GRADE_VERDICTS,
} from './diligenceRegistry.js';

/* =========================================================================
 * 1. Statistics — exported, deterministic, hand-checkable. No dependencies.
 * ========================================================================= */

export function round(n, dp = 1) {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
}

/** Wilson (1927) score interval for a binomial proportion. Returns fractions. */
export function wilsonInterval(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const k = Math.min(n, Math.max(0, successes));
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    p,
    lo: Math.max(0, centre - half),
    hi: Math.min(1, centre + half),
    pct: round(p * 100, 1),
    loPct: round(Math.max(0, centre - half) * 100, 1),
    hiPct: round(Math.min(1, centre + half) * 100, 1),
  };
}

/** Lanczos log-gamma (g=7, n=9), accurate to ~1e-13 over the positive reals. */
export function logGamma(z) {
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  let a = g[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i += 1) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued-fraction expansion for the incomplete beta (Numerical Recipes). */
function betaContinuedFraction(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
export function betaIncomplete(x, a, b) {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Beta quantile by bisection on the monotone CDF. Deterministic. */
export function betaQuantile(p, a, b) {
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 160; i += 1) {
    const mid = (lo + hi) / 2;
    if (betaIncomplete(mid, a, b) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

/**
 * Jeffreys Beta(½,½) posterior and an equal-tailed credible interval for a
 * proportion. `hits` is the consulted count, `misses` the unconsulted count.
 * The interval is exact (bisection on the incomplete beta), not a normal
 * approximation, so a 0-of-4 cell prints the wide bound it has earned.
 */
export function jeffreysInterval(hits, misses, level = 0.9) {
  const a = 0.5 + Math.max(0, hits);
  const b = 0.5 + Math.max(0, misses);
  const tail = (1 - level) / 2;
  return {
    a, b,
    mean: a / (a + b),
    lo: betaQuantile(tail, a, b),
    hi: betaQuantile(1 - tail, a, b),
  };
}

/** Brier (1950) score over [{p, y}] with p on [0,1]. Lower is better. */
export function brierScore(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  let sum = 0;
  for (const pair of pairs) sum += (pair.p - pair.y) ** 2;
  return round(sum / pairs.length, 4);
}

/**
 * Skill of a forecast against a strictly-prior base rate (p = 0.5 for every
 * claim). Maximum-entropy, chosen BEFORE looking at any outcome, so the grade is
 * genuinely out of sample. A NEGATIVE skill is a legitimate result and is
 * printed, never clamped.
 */
export function brierSkill(claims) {
  if (!Array.isArray(claims) || !claims.length) return null;
  const brier = brierScore(claims);
  const baseBrier = brierScore(claims.map((claim) => ({ p: 0.5, y: claim.y })));
  const skill = baseBrier > 0 ? round(1 - brier / baseBrier, 4) : null;
  let verdict = 'refused';
  if (skill !== null) {
    if (skill > 0.05) verdict = 'better-than-coin';
    else if (skill < -0.05) verdict = 'worse-than-coin';
    else verdict = 'indistinguishable';
  }
  return { brier, baseBrier, skill, verdict };
}

/* =========================================================================
 * 2. The frozen knowable set (derived, deterministic, never a copy of content)
 * ========================================================================= */

function asDay(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function firstDay(record, fields) {
  for (const field of fields) {
    const d = asDay(record?.[field]);
    if (d) return d;
  }
  return null;
}

/**
 * Harvest the facts that were KNOWABLE on a decision's date. A fact is a
 * POINTER: type, id, evidence class, evidence date, severity. No title, note,
 * person or amount is ever copied. A record with no established date is
 * excluded — it cannot be shown to have existed at decision time. A settled
 * decision qualifies as precedent only if it is STRICTLY earlier, and the
 * decision being examined is always excluded.
 *
 * Deterministic order (date, class, id) so a rescan produces the same frozen
 * set; capped at `factsPerChecklist` so no decision can dominate the ledger.
 */
export function knowableFacts(state, decision, { limit = DILIGENCE_LIMITS.factsPerChecklist } = {}) {
  const cutoff = asDay(decision?.date);
  if (!cutoff) return [];
  const out = [];
  for (const className of EVIDENCE_CLASS_KEYS) {
    const spec = EVIDENCE_CLASSES[className];
    const rows = Array.isArray(state?.[spec.collection]) ? state[spec.collection] : [];
    for (const row of rows) {
      if (!row || !row.id) continue;
      if (spec.sourceType === 'decision') {
        if (row.id === decision.id) continue;
        // A precedent is a decision whose outcome has settled and which predates
        // this call. An open or same-day decision is not yet a precedent.
        if (!row.outcome || row.outcome === 'pending') continue;
        const on = firstDay(row, spec.dates);
        if (!on || on >= cutoff) continue;
        out.push({ sourceType: spec.sourceType, sourceId: row.id, evidenceClass: className, evidencesOn: on, severity: 2 });
        continue;
      }
      const on = firstDay(row, spec.dates);
      if (!on || on > cutoff) continue;
      const severity = Number(row.severity);
      out.push({
        sourceType: spec.sourceType,
        sourceId: row.id,
        evidenceClass: className,
        evidencesOn: on,
        severity: Number.isFinite(severity) ? Math.min(3, Math.max(1, Math.round(severity))) : 2,
      });
    }
  }
  out.sort((a, b) => (
    a.evidencesOn.localeCompare(b.evidencesOn)
    || EVIDENCE_CLASS_KEYS.indexOf(a.evidenceClass) - EVIDENCE_CLASS_KEYS.indexOf(b.evidenceClass)
    || a.sourceId.localeCompare(b.sourceId)
  ));
  return out.slice(0, limit);
}

export function factKey(fact) {
  return `${fact.sourceType}:${fact.sourceId}`;
}

/* =========================================================================
 * 3. Coverage, class cells and the once-only forecast grade
 * ========================================================================= */

/**
 * The deliberation frontier for ONE frozen checklist. `used` and `ruled-out`
 * both count as consulted; `deferred` is counted but printed separately. A
 * consult that points at a fact NOT in the frozen set is ignored (it cannot
 * inflate coverage). REFUSED below the declared knowable floor — a refusal is
 * printed as a reason, never as a zero.
 */
export function coverageOf(checklist, consults, conventions) {
  const facts = Array.isArray(checklist?.facts) ? checklist.facts : [];
  const knowableN = facts.length;
  const factKeys = new Set(facts.map(factKey));
  const byKey = new Map();
  for (const consult of consults || []) {
    if (!consult) continue;
    const key = factKey(consult);
    if (!factKeys.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, consult);
  }
  const breakdown = { used: 0, ruledOut: 0, deferred: 0 };
  let consultedN = 0;
  for (const consult of byKey.values()) {
    consultedN += 1;
    if (consult.disposition === 'used') breakdown.used += 1;
    else if (consult.disposition === 'ruled-out') breakdown.ruledOut += 1;
    else if (consult.disposition === 'deferred') breakdown.deferred += 1;
  }
  const refused = knowableN < conventions.diligenceKnowableFloor;
  const wilson = refused ? null : wilsonInterval(consultedN, knowableN);
  const coveragePct = refused ? null : round((consultedN / knowableN) * 100, 1);
  return {
    knowableN,
    consultedN,
    unconsultedN: knowableN - consultedN,
    ...breakdown,
    coveragePct,
    loPct: wilson ? wilson.loPct : null,
    hiPct: wilson ? wilson.hiPct : null,
    wilson,
    band: coveragePct === null ? 'refused' : bandFor(coveragePct),
    refused,
    reason: refused
      ? `Only ${knowableN} knowable fact(s) were frozen against a declared floor of ${conventions.diligenceKnowableFloor}. At that sample a coverage rate is a coin flip, so it is refused rather than printed.`
      : null,
  };
}

export function bandFor(coveragePct) {
  let band = COVERAGE_BANDS[0].key;
  for (const entry of COVERAGE_BANDS) if (coveragePct >= entry.minPct) band = entry.key;
  return band;
}

/**
 * Pool the frontier across many checklists by EVIDENCE CLASS. Each cell is a
 * count with a Jeffreys 90% credible interval on the consulted share. A class is
 * DARK when the whole interval sits below the declared ceiling — the honest
 * statement that this span systematically walks past this class. A cell below
 * the class floor is REFUSED (BLANK), never printed as a low rate.
 */
export function classCells(checklists, consults, conventions) {
  // A consult belongs to ONE frontier. Keying by (checklist, fact) stops a
  // consultation recorded against one decision from silently crediting the
  // same record inside a DIFFERENT frontier's class cell.
  const consultedKeys = new Set((consults || []).filter(Boolean)
    .map((consult) => `${consult.checklistId}|${factKey(consult)}`));
  const rows = [];
  for (const className of EVIDENCE_CLASS_KEYS) {
    let knowableN = 0;
    let consultedN = 0;
    for (const checklist of checklists || []) {
      for (const fact of Array.isArray(checklist?.facts) ? checklist.facts : []) {
        if (fact.evidenceClass !== className) continue;
        knowableN += 1;
        if (consultedKeys.has(`${checklist.id}|${factKey(fact)}`)) consultedN += 1;
      }
    }
    const refused = knowableN < conventions.diligenceClassFloor;
    const interval = refused ? null : jeffreysInterval(consultedN, knowableN - consultedN);
    const loPct = interval ? round(interval.lo * 100, 1) : null;
    const hiPct = interval ? round(interval.hi * 100, 1) : null;
    rows.push({
      className,
      label: EVIDENCE_CLASSES[className].label,
      discipline: EVIDENCE_CLASSES[className].discipline,
      knowableN,
      consultedN,
      unconsultedN: knowableN - consultedN,
      sharePct: refused ? null : round((consultedN / knowableN) * 100, 1),
      loPct,
      hiPct,
      dark: refused ? null : hiPct < conventions.diligenceDarkCeilingPct,
      refused,
      reason: refused
        ? `Only ${knowableN} knowable fact(s) in this class against a declared cell floor of ${conventions.diligenceClassFloor}.`
        : null,
    });
  }
  return rows;
}

/**
 * Grade ONE pre-decision process forecast, out of sample. The forecast declares
 * a set of evidence classes and one probability `p` that the leader will consult
 * them. Each declared class becomes a Bernoulli claim (p, y=consulted?), plus
 * one coverage claim (p, y=coverage ≥ floor?). Brier skill is measured against
 * a strictly-prior 0.5 base rate. Graded exactly ONCE, only after the decision
 * has settled, only if the claim count clears the floor.
 */
export function gradeForecast(checklist, consults, conventions) {
  const forecast = checklist?.forecast;
  if (!forecast || !Array.isArray(forecast.classes) || !forecast.classes.length) {
    return { refused: true, reason: 'No pre-decision process forecast was declared for this decision.' };
  }
  const coverage = coverageOf(checklist, consults, conventions);
  const p = Math.min(0.99, Math.max(0.01, forecast.confidencePct / 100));
  const consultedKeys = new Set((consults || []).filter(Boolean).map(factKey));
  const facts = Array.isArray(checklist.facts) ? checklist.facts : [];
  const claims = [];
  for (const className of forecast.classes) {
    const inClass = facts.filter((fact) => fact.evidenceClass === className);
    const hit = inClass.some((fact) => consultedKeys.has(factKey(fact)));
    claims.push({ p, y: hit ? 1 : 0, className });
  }
  // The single coverage claim. A refused coverage (too few knowable facts) is
  // NOT scored as a loss — a refusal is not a measurement.
  if (!coverage.refused) {
    claims.push({ p, y: coverage.coveragePct >= conventions.diligenceCoverageFloorPct ? 1 : 0, className: 'coverage' });
  }
  // A forecast declares at most five evidence classes plus one coverage claim,
  // so its OWN declared floor is used here — never the knowable-facts floor.
  if (claims.length < conventions.diligenceGradeClaimFloor) {
    return { refused: true, reason: `Only ${claims.length} scoreable claim(s) against the declared grade floor of ${conventions.diligenceGradeClaimFloor}.` };
  }
  const scored = brierSkill(claims);
  return {
    refused: false,
    claimsN: claims.length,
    hitsN: claims.filter((claim) => claim.y === 1).length,
    brier: scored.brier,
    baseBrier: scored.baseBrier,
    skill: scored.skill,
    verdict: scored.verdict,
    coveragePct: coverage.coveragePct,
    claims,
  };
}

/* =========================================================================
 * 4. Scoping — the read boundary. A declared seat sees only its own subtree.
 * ========================================================================= */

function inScope(seat, seatId) {
  if (!seat) return true;
  if (seat.fullAccess) return true;
  if (!seatId) return false;
  return seatId === seat.id || (seat.scope && seat.scope.has(seatId));
}

function isSettled(decision) {
  return Boolean(decision && decision.outcome && decision.outcome !== 'pending');
}

/* =========================================================================
 * 5. The whole terminal — one derived report, scoped to the active seat
 * ========================================================================= */

export function buildDiligenceReport(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const conventions = diligenceConventions(effective);
  const built = buildSeats(state, { now, settings: effective });
  const seat = activeSeat(built);
  const today = dayKey(now);

  const allChecklists = Array.isArray(state?.diligenceChecklists) ? state.diligenceChecklists : [];
  const scoped = allChecklists.filter((row) => inScope(seat, row.ownerSeatId));
  const scopedIds = new Set(scoped.map((row) => row.id));
  const consults = (Array.isArray(state?.diligenceConsults) ? state.diligenceConsults : [])
    .filter((row) => scopedIds.has(row.checklistId));
  const byChecklist = new Map();
  for (const consult of consults) {
    if (!byChecklist.has(consult.checklistId)) byChecklist.set(consult.checklistId, []);
    byChecklist.get(consult.checklistId).push(consult);
  }
  const decisionById = new Map((Array.isArray(state?.decisions) ? state.decisions : []).map((d) => [d.id, d]));
  const grades = (Array.isArray(state?.diligenceGrades) ? state.diligenceGrades : [])
    .filter((row) => inScope(seat, row.ownerSeatId));
  const gradedIds = new Set(grades.map((row) => row.checklistId));

  /* ---- one row per frozen frontier ---- */
  const coverageRows = scoped.map((checklist) => {
    const own = byChecklist.get(checklist.id) || [];
    const coverage = coverageOf(checklist, own, conventions);
    const decision = decisionById.get(checklist.decisionId) || null;
    const settled = isSettled(decision);
    const hasForecast = Boolean(checklist.forecast);
    return {
      id: checklist.id,
      decisionId: checklist.decisionId,
      decisionOn: checklist.decisionOn,
      frozenOn: checklist.frozenOn,
      status: checklist.status,
      outcome: checklist.outcome,
      settled,
      knowableN: coverage.knowableN,
      consultedN: coverage.consultedN,
      unconsultedN: coverage.unconsultedN,
      usedN: coverage.used,
      ruledOutN: coverage.ruledOut,
      deferredN: coverage.deferred,
      coveragePct: coverage.coveragePct,
      loPct: coverage.loPct,
      hiPct: coverage.hiPct,
      band: coverage.band,
      refused: coverage.refused,
      reason: coverage.reason,
      facts: checklist.facts,
      consultedKeys: [...new Set(own.map(factKey))],
      forecast: hasForecast ? { ...checklist.forecast } : null,
      gradedOn: checklist.gradedOn || null,
      gradeable: hasForecast && settled && !gradedIds.has(checklist.id),
      ownerSeatId: checklist.ownerSeatId || null,
      altitudeKey: checklist.altitudeKey || 'chief',
      rank: checklist.rank || 5,
    };
  }).sort((a, b) => b.decisionOn.localeCompare(a.decisionOn) || a.id.localeCompare(b.id));

  const cells = classCells(scoped, consults, conventions);
  const settledRows = coverageRows.filter((row) => row.settled && !row.refused);
  const thinN = settledRows.filter((row) => row.coveragePct < conventions.diligenceCoverageFloorPct).length;
  const refusedN = coverageRows.filter((row) => row.refused).length;
  const darkN = cells.filter((row) => row.dark === true).length;
  const pooledKnowable = coverageRows.reduce((n, row) => n + row.knowableN, 0);
  const pooledConsulted = coverageRows.reduce((n, row) => n + row.consultedN, 0);
  const pooledWilson = pooledKnowable >= conventions.diligenceKnowableFloor
    ? wilsonInterval(pooledConsulted, pooledKnowable) : null;

  /* ---- altitude roll-up (identity-free: rank × counts) ---- */
  const byAltitude = new Map();
  for (const row of coverageRows) {
    const key = row.altitudeKey || 'chief';
    if (!byAltitude.has(key)) byAltitude.set(key, { altitudeKey: key, checklistsN: 0, knowableN: 0, consultedN: 0, settledN: 0 });
    const acc = byAltitude.get(key);
    acc.checklistsN += 1;
    acc.knowableN += row.knowableN;
    acc.consultedN += row.consultedN;
    if (row.settled) acc.settledN += 1;
  }
  const altitudeRows = [...byAltitude.values()].map((acc) => ({
    ...acc,
    coveragePct: acc.knowableN >= conventions.diligenceKnowableFloor
      ? round((acc.consultedN / acc.knowableN) * 100, 1) : null,
    refused: acc.knowableN < conventions.diligenceKnowableFloor,
  })).sort((a, b) => a.altitudeKey.localeCompare(b.altitudeKey));

  /* ---- the grade ledger ---- */
  const gradeRows = grades.map((grade) => ({
    id: grade.id,
    checklistId: grade.checklistId,
    gradedOn: grade.gradedOn,
    claimsN: grade.claimsN,
    hitsN: grade.hitsN,
    brier: grade.brier,
    baseBrier: grade.baseBrier,
    skill: grade.skill,
    coveragePct: grade.coveragePct,
    verdict: grade.verdict,
    verdictLabel: GRADE_VERDICTS[grade.verdict]?.label || grade.verdict,
  })).sort((a, b) => b.gradedOn.localeCompare(a.gradedOn));
  const scored = gradeRows.filter((row) => Number.isFinite(row.skill));
  const pooledSkill = scored.length ? round(scored.reduce((n, row) => n + row.skill, 0) / scored.length, 4) : null;

  /* ---- governed findings this module opened ----
   * Marker notes are engine-generated text (a class name, a week and a count),
   * never a person, title or free-text reason, so they are safe at every
   * altitude. The decision records themselves are reached through the typed
   * graph, which is already seat-scoped. */
  const findings = (Array.isArray(state?.diligenceMarkers) ? state.diligenceMarkers : [])
    .filter((marker) => marker && ['gap', 'dark'].includes(marker.kind))
    .slice(-24)
    .map((marker) => ({
      id: marker.id, kind: marker.kind, weekKey: marker.weekKey || null,
      recordedOn: marker.recordedOn || null, note: marker.note || '',
      decisionId: marker.decisionId || null,
    }))
    .reverse();

  const attention = thinN + darkN + coverageRows.filter((row) => row.gradeable).length + refusedN * 0;

  return {
    ok: true,
    engineVersion: DILIGENCE_ENGINE_VERSION,
    premise: 'Most tools can tell you whether a decision WORKED. This one asks whether the organisation LOOKED before it leaped: the knowable set is frozen at decision time, a consultation is a first-class dated act (where ruling a fact out with a reason counts as diligence, not a miss), and a pre-declared process forecast is graded once, out of sample. No sentiment score, no rating of a person.',
    seat: {
      id: seat.id, label: seat.label, rank: seat.rank,
      altitudeKey: seat.altitudeKey, fullAccess: Boolean(seat.fullAccess),
      playbook: DILIGENCE_PLAYBOOK[seat.altitudeKey] || DILIGENCE_PLAYBOOK.chief,
    },
    conventions,
    today,
    week: weekKey(now) || today,
    summary: {
      checklistsN: scoped.length,
      settledN: coverageRows.filter((row) => row.settled).length,
      openN: coverageRows.filter((row) => row.status === 'open').length,
      lapsedN: coverageRows.filter((row) => row.status === 'lapsed').length,
      knowableN: pooledKnowable,
      consultedN: pooledConsulted,
      unconsultedN: pooledKnowable - pooledConsulted,
      coveragePct: pooledWilson ? pooledWilson.pct : null,
      loPct: pooledWilson ? pooledWilson.loPct : null,
      hiPct: pooledWilson ? pooledWilson.hiPct : null,
      refused: pooledWilson === null,
      thinN, darkN, refusedN,
      forecastsN: coverageRows.filter((row) => row.forecast).length,
      gradedN: gradeRows.length,
      dueGradesN: coverageRows.filter((row) => row.gradeable).length,
      pooledSkill,
    },
    ledger: coverageRows,
    cells: { rows: cells, darkN, measurableN: cells.filter((row) => !row.refused).length },
    altitudes: altitudeRows,
    grades: { rows: gradeRows, pooledSkill, scoredN: scored.length },
    findings: { rows: findings },
    disclosure: DILIGENCE_DISCLOSURE,
    attention,
  };
}

/* =========================================================================
 * 6. Aggregate-only CSV and the identity-free upward brief
 * ========================================================================= */

/** BLANK, never zero: a refused or suppressed cell is an empty string. */
export function diligenceCsvRows(report) {
  const rows = [];
  const s = report.summary;
  rows.push({
    row_kind: 'summary', scope: 'workspace',
    checklists_n: s.checklistsN, settled_n: s.settledN, open_n: s.openN,
    knowable_n: s.knowableN, consulted_n: s.consultedN, unconsulted_n: s.unconsultedN,
    coverage_pct: s.refused ? '' : s.coveragePct,
    lo_pct: s.refused ? '' : s.loPct, hi_pct: s.refused ? '' : s.hiPct,
    band: '', class_key: '', dark: '', graded_n: s.gradedN, claims_n: '',
    brier: '', base_brier: '', skill: report.grades.pooledSkill ?? '',
    verdict: '', refused: s.refused ? 'yes' : 'no', reason_code: s.refused ? 'knowable_floor' : '', altitude: '',
  });
  for (const cell of report.cells.rows) {
    rows.push({
      row_kind: 'class', scope: 'workspace',
      checklists_n: '', settled_n: '', open_n: '',
      knowable_n: cell.knowableN, consulted_n: cell.consultedN, unconsulted_n: cell.unconsultedN,
      coverage_pct: cell.refused ? '' : cell.sharePct,
      lo_pct: cell.refused ? '' : cell.loPct, hi_pct: cell.refused ? '' : cell.hiPct,
      band: '', class_key: cell.className, dark: cell.refused ? '' : (cell.dark ? 'yes' : 'no'),
      graded_n: '', claims_n: '', brier: '', base_brier: '', skill: '', verdict: '',
      refused: cell.refused ? 'yes' : 'no', reason_code: cell.refused ? 'class_floor' : '', altitude: '',
    });
  }
  for (const alt of report.altitudes) {
    rows.push({
      row_kind: 'altitude', scope: 'workspace',
      checklists_n: alt.checklistsN, settled_n: alt.settledN, open_n: '',
      knowable_n: alt.knowableN, consulted_n: alt.consultedN,
      unconsulted_n: alt.knowableN - alt.consultedN,
      coverage_pct: alt.refused ? '' : alt.coveragePct,
      lo_pct: '', hi_pct: '', band: '', class_key: '', dark: '', graded_n: '', claims_n: '',
      brier: '', base_brier: '', skill: '', verdict: '',
      refused: alt.refused ? 'yes' : 'no', reason_code: alt.refused ? 'knowable_floor' : '', altitude: alt.altitudeKey,
    });
  }
  for (const grade of report.grades.rows) {
    rows.push({
      row_kind: 'grade', scope: 'workspace',
      checklists_n: '', settled_n: '', open_n: '', knowable_n: '', consulted_n: '', unconsulted_n: '',
      coverage_pct: grade.coveragePct ?? '', lo_pct: '', hi_pct: '', band: '', class_key: '', dark: '',
      graded_n: '', claims_n: grade.claimsN, brier: grade.brier ?? '', base_brier: grade.baseBrier ?? '',
      skill: grade.skill ?? '', verdict: grade.verdict,
      refused: grade.verdict === 'refused' ? 'yes' : 'no', reason_code: '', altitude: '',
    });
  }
  return rows;
}

/** Identity-free, safe to carry upward unchanged. Prints refusals, not guesses. */
export function diligenceBriefText(report) {
  const s = report.summary;
  const lines = [];
  lines.push(`DILIGENCE LEDGER — upward brief, ${report.today} (identity-free)`);
  lines.push(`Frozen knowable sets: ${s.checklistsN}. Settled: ${s.settledN}. Open: ${s.openN}. Lapsed: ${s.lapsedN}.`);
  lines.push(s.refused
    ? `Consulted coverage: REFUSED — ${s.knowableN} knowable fact(s) is below the declared floor of ${report.conventions.diligenceKnowableFloor}. No rate is printed.`
    : `Consulted coverage: ${s.coveragePct}% (Wilson 95% interval ${s.loPct}–${s.hiPct}%) over ${s.consultedN} of ${s.knowableN} knowable facts.`);
  lines.push(`Settled decisions below the ${report.conventions.diligenceCoverageFloorPct}% diligence floor: ${s.thinN}. Dark evidence classes: ${s.darkN}.`);
  for (const cell of report.cells.rows) {
    lines.push(cell.refused
      ? `  ${cell.className}: REFUSED (${cell.knowableN} fact(s) below the class floor of ${report.conventions.diligenceClassFloor}).`
      : `  ${cell.className}: ${cell.sharePct}% consulted, Jeffreys 90% ${cell.loPct}–${cell.hiPct}%${cell.dark ? ' — DARK (systematically unconsulted)' : ''}.`);
  }
  lines.push(report.grades.scoredN
    ? `Process forecasts graded: ${report.grades.scoredN}. Pooled Brier skill vs a strictly-prior base rate: ${report.grades.pooledSkill}${report.grades.pooledSkill < 0 ? ' (negative — the forecasts were overconfident)' : ''}.`
    : 'Process forecasts graded: none yet. A grade is written once, out of sample, after the decision settles.');
  lines.push('Disclosure: no decision id, no record id, no title, no person, no note and no individual consultation travels upward. A refused cell is BLANK, never zero.');
  return { text: lines.join('\n'), lines };
}

/** Nav badge: settled thin frontiers, dark classes and due forecast grades. */
export function diligenceAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildDiligenceReport(state, { now, settings });
    return report.attention;
  } catch {
    return 0;
  }
}
