/**
 * app/core/domain/psrSchema.js — fail-closed storage loaders for the
 * Pre-Startup Safety Review & Commissioning Readiness Register (ADR-0258,
 * Schema v210).
 *
 * SEVEN COLLECTIONS, ALL EMPTY AT UPGRADE:
 *   `psrReviews`, `psrPunchItems`, `psrSignoffs`, `psrReadiness`,
 *   `psrAuthorisations`, `psrStartups`, `psrMarkers`.
 *
 * ZERO DERIVED STORAGE. No state, breach list, overdue count, readiness rate or
 * gate completeness is stored on any row. Structurally unreadable or orphan
 * child rows are DROPPED with a counted warning (never silently defaulted or
 * repaired). Governance-breach rows that are structurally readable — a proposer
 * signing a discipline gate, a self-closed Category A blocker, a self-attested
 * readiness record, an authorisation outside the joint apex, or a premature
 * physical startup — are KEPT so the reader disqualifies or flags them with
 * full audit visibility rather than erasing evidence of the breach.
 */

import {
  PSR_BOUNDS,
  PSR_DEFAULTS,
  PSR_DISCIPLINE_BY_KEY,
  PSR_LIMITS as L,
  PSR_PUNCH_CATEGORY_BY_KEY,
  PSR_SETTING_KEYS,
  PSR_SIGNOFF_VERDICT_BY_KEY,
  PSR_TRIGGER_BY_KEY,
} from './psrRegistry.js';
import { instantMs, strictWholeInt, utcDayMs, wholeDaysBetween } from './psrMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const cleanText = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

export function psrId(value) {
  const candidate = cleanText(value);
  return ID_RE.test(candidate) ? candidate : null;
}

/** Bounded short reference (3..120 chars); rejects over-length rather than silently truncating identity refs. */
export function psrShort(value) {
  const candidate = cleanText(value);
  if (candidate.length < L.shortMin || candidate.length > L.shortMax) return null;
  return candidate;
}

/** Written basis or finding (24..600 chars); truncated only past textMax only? No — bounded cleanly. */
export function psrProse(value) {
  const candidate = cleanText(value);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

export function psrDayKey(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return utcDayMs(candidate) === null ? null : candidate;
}

export function psrInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/**
 * Required disciplines: 1..6 distinct keys from the closed vocabulary, read
 * WHOLE or refused as `null` — dropping one unrecognised discipline would
 * silently delete a required safety gate.
 */
export function psrDisciplines(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    const key = cleanText(raw);
    if (!key || !PSR_DISCIPLINE_BY_KEY[key]) return null;
    if (!out.includes(key)) out.push(key);
  }
  if (out.length < L.disciplinesMin || out.length > L.disciplinesMax) return null;
  return out;
}

/**
 * Affected operators: 1..12 distinct valid person ids, read WHOLE or refused as
 * `null` — dropping one unreadable entry would let a unit start with an
 * unbriefed operator invisible to the gate.
 */
export function psrOperators(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    const personId = psrId(raw);
    if (!personId) return null;
    if (!out.includes(personId)) out.push(personId);
  }
  if (out.length < L.operatorsMin || out.length > L.operatorsMax) return null;
  return out;
}

/* ------------------------------------------------------------------- reviews */

export function normalizePsrReviews(rows, warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the review ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seenId = new Set();
  const seenRef = new Set();
  let dropped = 0;

  for (const row of rows) {
    if (out.length >= L.reviews) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = psrId(row.id);
    const reviewRef = psrShort(row.reviewRef);
    const unitRef = psrShort(row.unitRef);
    const triggerKind = cleanText(row.triggerKind);
    const triggerDef = triggerKind ? PSR_TRIGGER_BY_KEY[triggerKind] : null;
    const changeBasisRef = psrProse(row.changeBasisRef);
    const proposerId = psrId(row.proposerId);
    const unitHolderId = psrId(row.unitHolderId);
    const requiredDisciplines = psrDisciplines(row.requiredDisciplines);
    const affectedOperatorIds = psrOperators(row.affectedOperatorIds);
    const plannedStartDay = psrDayKey(row.plannedStartDay);
    const hasRevert = row.revertByDay !== undefined && row.revertByDay !== null && row.revertByDay !== '';
    const revertByDay = hasRevert ? psrDayKey(row.revertByDay) : null;
    const openedById = psrId(row.openedById);
    const openedAt = psrInstant(row.openedAt);
    const openedDay = psrDayKey(row.openedDay);

    if (!rowId || seenId.has(rowId) || !reviewRef || seenRef.has(reviewRef) || !unitRef
      || !triggerDef || !changeBasisRef || !proposerId || !unitHolderId
      || !requiredDisciplines || !affectedOperatorIds || !plannedStartDay
      || !openedById || !openedAt || !openedDay) {
      dropped += 1;
      continue;
    }

    // Flixborough rule: temporary modifications MUST carry a valid revertByDay
    // on or after plannedStartDay; non-temporary triggers MUST NOT carry one.
    if (triggerDef.temporary) {
      if (!revertByDay) { dropped += 1; continue; }
      const span = wholeDaysBetween(plannedStartDay, revertByDay);
      if (span === null || span < 0) { dropped += 1; continue; }
    } else if (hasRevert) {
      dropped += 1;
      continue;
    }

    seenId.add(rowId);
    seenRef.add(reviewRef);
    out.push({
      id: rowId,
      reviewRef,
      unitRef,
      triggerKind,
      changeBasisRef,
      proposerId,
      unitHolderId,
      requiredDisciplines,
      affectedOperatorIds,
      plannedStartDay,
      revertByDay: triggerDef.temporary ? revertByDay : null,
      openedById,
      openedAt,
      openedDay,
      createdAt: psrInstant(row.createdAt) || openedAt,
      updatedAt: psrInstant(row.updatedAt) || openedAt,
    });
  }

  if (dropped) {
    warn(`${dropped} pre-startup review row(s) could not be read exactly — missing or invalid reference, unit, trigger, written change basis, proposer, unit holder, discipline list, affected operators, planned startup day, mandatory temporary revert-by day, or duplicate reference — and were dropped without repair.`);
  }
  return out;
}

/* --------------------------------------------------------------- punch items */

export function normalizePsrPunchItems(rows, reviews = [], warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the punch-item ledger was not an array; it was read as empty');
    return [];
  }
  const reviewIds = new Set(list(reviews).map((r) => r.id));
  const out = [];
  const seenId = new Set();
  const seenReviewRef = new Set();
  let dropped = 0;
  let orphan = 0;

  for (const row of rows) {
    if (out.length >= L.punchItems) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = psrId(row.id);
    const reviewId = psrId(row.reviewId);
    const itemRef = psrShort(row.itemRef);
    const category = cleanText(row.category);
    const categoryDef = category ? PSR_PUNCH_CATEGORY_BY_KEY[category] : null;
    const discipline = cleanText(row.discipline);
    const disciplineDef = discipline ? PSR_DISCIPLINE_BY_KEY[discipline] : null;
    const finding = psrProse(row.finding);
    const ownerId = psrId(row.ownerId);
    const hasDue = row.dueDay !== undefined && row.dueDay !== null && row.dueDay !== '';
    const dueDay = hasDue ? psrDayKey(row.dueDay) : null;
    const recordedById = psrId(row.recordedById);
    const recordedAt = psrInstant(row.recordedAt);
    const recordedDay = psrDayKey(row.recordedDay);

    if (!rowId || seenId.has(rowId) || !reviewId || !itemRef || !categoryDef
      || !disciplineDef || !finding || !ownerId || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!reviewIds.has(reviewId)) { orphan += 1; continue; }
    // Category B post-startup items MUST declare an explicit dueDay; invalid dueDay on Category A also drops.
    if (category === 'post-startup' && !dueDay) { dropped += 1; continue; }
    if (hasDue && !dueDay) { dropped += 1; continue; }

    // Closure fields must be either ALL absent (open) or ALL valid (closed).
    const closureFields = [row.closedDay, row.closedAt, row.closedById, row.closureEvidenceRef, row.closureBasis];
    const anyClosed = closureFields.some((v) => v !== undefined && v !== null && v !== '');
    let closedDay = null;
    let closedAt = null;
    let closedById = null;
    let closureEvidenceRef = null;
    let closureBasis = null;
    if (anyClosed) {
      closedDay = psrDayKey(row.closedDay);
      closedAt = psrInstant(row.closedAt);
      closedById = psrId(row.closedById);
      closureEvidenceRef = psrShort(row.closureEvidenceRef);
      closureBasis = psrProse(row.closureBasis);
      const orderDays = closedDay ? wholeDaysBetween(recordedDay, closedDay) : null;
      if (!closedDay || !closedAt || !closedById || !closureEvidenceRef || !closureBasis || orderDays === null || orderDays < 0) {
        dropped += 1;
        continue;
      }
    }

    const pairKey = `${reviewId}\u0000${itemRef}`;
    if (seenReviewRef.has(pairKey)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenReviewRef.add(pairKey);
    out.push({
      id: rowId,
      reviewId,
      itemRef,
      category,
      discipline,
      finding,
      ownerId,
      dueDay,
      recordedById,
      recordedAt,
      recordedDay,
      closedDay,
      closedAt,
      closedById,
      closureEvidenceRef,
      closureBasis,
      createdAt: psrInstant(row.createdAt) || recordedAt,
      updatedAt: psrInstant(row.updatedAt) || closedAt || recordedAt,
    });
  }

  if (orphan) warn(`${orphan} punch-item row(s) named a review not on the register and were dropped.`);
  if (dropped) warn(`${dropped} punch-item row(s) could not be read exactly — missing category, discipline, finding, owner, Category B due day, half-recorded or reversed closure, or duplicate item reference — and were dropped without repair.`);
  return out;
}

/* ------------------------------------------------------------------ signoffs */

export function normalizePsrSignoffs(rows, reviews = [], warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the discipline sign-off ledger was not an array; it was read as empty');
    return [];
  }
  const reviewById = new Map(list(reviews).map((r) => [r.id, r]));
  const out = [];
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;

  for (const row of rows) {
    if (out.length >= L.signoffs) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = psrId(row.id);
    const reviewId = psrId(row.reviewId);
    const discipline = cleanText(row.discipline);
    const disciplineDef = discipline ? PSR_DISCIPLINE_BY_KEY[discipline] : null;
    const verdict = cleanText(row.verdict);
    const verdictDef = verdict ? PSR_SIGNOFF_VERDICT_BY_KEY[verdict] : null;
    const evidenceRef = psrShort(row.evidenceRef);
    const basisRef = psrProse(row.basisRef);
    const signedById = psrId(row.signedById);
    const signedAt = psrInstant(row.signedAt);
    const signedDay = psrDayKey(row.signedDay);

    if (!rowId || seenId.has(rowId) || !reviewId || !disciplineDef || !verdictDef
      || !evidenceRef || !basisRef || !signedById || !signedAt || !signedDay) {
      dropped += 1;
      continue;
    }
    const review = reviewById.get(reviewId);
    if (!review) { orphan += 1; continue; }
    if (!review.requiredDisciplines.includes(discipline)) { dropped += 1; continue; }

    seenId.add(rowId);
    out.push({
      id: rowId,
      reviewId,
      discipline,
      verdict,
      evidenceRef,
      basisRef,
      signedById,
      signedAt,
      signedDay,
      createdAt: psrInstant(row.createdAt) || signedAt,
    });
  }

  if (orphan) warn(`${orphan} sign-off row(s) named a review not on the register and were dropped.`);
  if (dropped) warn(`${dropped} sign-off row(s) could not be read exactly — invalid discipline, undeclared discipline for the review, invalid verdict, or missing evidence/basis/signer/timestamp — and were dropped without repair.`);
  return out;
}

/* ----------------------------------------------------------------- readiness */

export function normalizePsrReadiness(rows, reviews = [], warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the operator-readiness ledger was not an array; it was read as empty');
    return [];
  }
  const reviewById = new Map(list(reviews).map((r) => [r.id, r]));
  const out = [];
  const seenId = new Set();
  const seenPair = new Set();
  let dropped = 0;
  let orphan = 0;

  for (const row of rows) {
    if (out.length >= L.readiness) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = psrId(row.id);
    const reviewId = psrId(row.reviewId);
    const operatorId = psrId(row.operatorId);
    const procedureRef = psrShort(row.procedureRef);
    const evidenceRef = psrShort(row.evidenceRef);
    const attestedDay = psrDayKey(row.attestedDay);
    const attestedById = psrId(row.attestedById);
    const attestedAt = psrInstant(row.attestedAt);

    if (!rowId || seenId.has(rowId) || !reviewId || !operatorId || !procedureRef
      || !evidenceRef || !attestedDay || !attestedById || !attestedAt) {
      dropped += 1;
      continue;
    }
    const review = reviewById.get(reviewId);
    if (!review) { orphan += 1; continue; }
    if (!review.affectedOperatorIds.includes(operatorId)) { dropped += 1; continue; }

    const pairKey = `${reviewId}\u0000${operatorId}`;
    if (seenPair.has(pairKey)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenPair.add(pairKey);
    out.push({
      id: rowId,
      reviewId,
      operatorId,
      procedureRef,
      evidenceRef,
      attestedDay,
      attestedById,
      attestedAt,
      createdAt: psrInstant(row.createdAt) || attestedAt,
    });
  }

  if (orphan) warn(`${orphan} operator-readiness row(s) named a review not on the register and were dropped.`);
  if (dropped) warn(`${dropped} operator-readiness row(s) could not be read exactly — missing procedure or walkdown evidence, operator not named on the review, or duplicate attestation — and were dropped without repair.`);
  return out;
}

/* ------------------------------------------------------------ authorisations */

export function normalizePsrAuthorisations(rows, reviews = [], warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the startup-authorisation ledger was not an array; it was read as empty');
    return [];
  }
  const reviewIds = new Set(list(reviews).map((r) => r.id));
  const out = [];
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;

  for (const row of rows) {
    if (out.length >= L.authorisations) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = psrId(row.id);
    const reviewId = psrId(row.reviewId);
    const authorisedById = psrId(row.authorisedById);
    const authorisedAt = psrInstant(row.authorisedAt);
    const authorisedDay = psrDayKey(row.authorisedDay);
    const permitClearanceRef = psrShort(row.permitClearanceRef);
    const basisRef = psrProse(row.basisRef);

    if (!rowId || seenId.has(rowId) || !reviewId || !authorisedById || !authorisedAt
      || !authorisedDay || !permitClearanceRef || !basisRef) {
      dropped += 1;
      continue;
    }
    if (!reviewIds.has(reviewId)) { orphan += 1; continue; }

    seenId.add(rowId);
    out.push({
      id: rowId,
      reviewId,
      authorisedById,
      authorisedAt,
      authorisedDay,
      permitClearanceRef,
      basisRef,
      createdAt: psrInstant(row.createdAt) || authorisedAt,
    });
  }

  if (orphan) warn(`${orphan} startup-authorisation row(s) named a review not on the register and were dropped.`);
  if (dropped) warn(`${dropped} startup-authorisation row(s) could not be read exactly — missing permit-clearance reference, basis, authoriser, timestamp, or duplicate authorisation for one review — and were dropped without repair.`);
  return out;
}

/* ------------------------------------------------------------------ startups */

export function normalizePsrStartups(rows, reviews = [], warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the startup ledger was not an array; it was read as empty');
    return [];
  }
  const reviewById = new Map(list(reviews).map((r) => [r.id, r]));
  const out = [];
  const seenId = new Set();
  const seenReview = new Set();
  let dropped = 0;
  let orphan = 0;

  for (const row of rows) {
    if (out.length >= L.startups) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = psrId(row.id);
    const reviewId = psrId(row.reviewId);
    const energisedAt = psrInstant(row.energisedAt);
    const energisedDay = psrDayKey(row.energisedDay);
    const energisedById = psrId(row.energisedById);
    const startupLogRef = psrShort(row.startupLogRef);
    const basisRef = psrProse(row.basisRef);

    if (!rowId || seenId.has(rowId) || !reviewId || !energisedAt || !energisedDay
      || !energisedById || !startupLogRef || !basisRef) {
      dropped += 1;
      continue;
    }
    const review = reviewById.get(reviewId);
    if (!review) { orphan += 1; continue; }
    if (seenReview.has(reviewId)) { dropped += 1; continue; }

    const restFields = [row.restoredAt, row.restoredDay, row.restoredById, row.restorationRef, row.restorationBasis];
    const anyRestored = restFields.some((v) => v !== undefined && v !== null && v !== '');
    let restoredAt = null;
    let restoredDay = null;
    let restoredById = null;
    let restorationRef = null;
    let restorationBasis = null;
    if (anyRestored) {
      if (review.triggerKind !== 'temporary-change') { dropped += 1; continue; }
      restoredAt = psrInstant(row.restoredAt);
      restoredDay = psrDayKey(row.restoredDay);
      restoredById = psrId(row.restoredById);
      restorationRef = psrShort(row.restorationRef);
      restorationBasis = psrProse(row.restorationBasis);
      const startMs = instantMs(energisedAt);
      const restMs = restoredAt ? instantMs(restoredAt) : null;
      const orderDays = restoredDay ? wholeDaysBetween(energisedDay, restoredDay) : null;
      if (!restoredAt || !restoredDay || !restoredById || !restorationRef || !restorationBasis
        || startMs === null || restMs === null || restMs < startMs || orderDays === null || orderDays < 0) {
        dropped += 1;
        continue;
      }
    }

    seenId.add(rowId);
    seenReview.add(reviewId);
    out.push({
      id: rowId,
      reviewId,
      energisedAt,
      energisedDay,
      energisedById,
      startupLogRef,
      basisRef,
      restoredAt,
      restoredDay,
      restoredById,
      restorationRef,
      restorationBasis,
      createdAt: psrInstant(row.createdAt) || energisedAt,
      updatedAt: psrInstant(row.updatedAt) || restoredAt || energisedAt,
    });
  }

  if (orphan) warn(`${orphan} startup row(s) named a review not on the register and were dropped.`);
  if (dropped) warn(`${dropped} startup row(s) could not be read exactly — missing startup log reference, basis, timestamp, half-recorded or pre-startup restoration, restoration on a permanent change, or duplicate startup — and were dropped without repair.`);
  return out;
}

/* ------------------------------------------------------------------- markers */

export function normalizePsrMarkers(rows, warnings = []) {
  const warn = (msg) => warnings.push(`[pre-startup] ${msg}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the pre-startup marker ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const key = cleanText(row.key).slice(0, 240);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      at: psrInstant(row.at) || '',
      ruleId: cleanText(row.ruleId).slice(0, 40),
      kind: cleanText(row.kind).slice(0, 40),
      detail: cleanText(row.detail).slice(0, 400),
    });
    if (out.length >= L.markers) break;
  }
  return out;
}

/* ------------------------------------------------------------------ settings */

/**
 * Bounded conventions on load. Unreadable or out-of-bounds values fall back to
 * declared defaults rather than clamping to an unchosen boundary; the command
 * door (`psrSetConventions`) refuses invalid or out-of-bounds inputs outright.
 */
export function normalizePsrSettings(settings = {}) {
  const src = isPlainObject(settings) ? settings : {};
  const floorParsed = strictWholeInt(src[PSR_SETTING_KEYS.privacyFloor]);
  const floor = floorParsed !== null
    && floorParsed >= PSR_BOUNDS.privacyFloor.min
    && floorParsed <= PSR_BOUNDS.privacyFloor.max
    ? floorParsed
    : PSR_DEFAULTS.privacyFloor;
  const horizonParsed = strictWholeInt(src[PSR_SETTING_KEYS.revertHorizonDays]);
  const horizon = horizonParsed !== null
    && horizonParsed >= PSR_BOUNDS.revertHorizonDays.min
    && horizonParsed <= PSR_BOUNDS.revertHorizonDays.max
    ? horizonParsed
    : PSR_DEFAULTS.revertHorizonDays;
  return {
    psrAutoPropagate: src[PSR_SETTING_KEYS.autoPropagate] !== false,
    psrPrivacyFloor: floor,
    psrRevertHorizonDays: horizon,
  };
}
