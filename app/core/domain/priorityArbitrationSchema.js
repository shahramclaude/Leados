/**
 * app/core/domain/priorityArbitrationSchema.js — fail-closed normalizers for the
 * Cross-Line Priority Arbitration (ADR-0143, Schema v120).
 *
 * WHAT IS STORED
 * --------------
 * A `priorityArbitrations` row stores only human acts, and only these:
 *
 *   the FRAME     which person's capacity the case is about, who opened it, on
 *                 what day, and the opener's own words;
 *   the DEMANDS   the frozen contention: for each line, that line's demand as its
 *                 manager stated it, with the two integers the manager declared
 *                 (cost of delay and job size), the chain remaining in whole days,
 *                 and the day the five dispositions were applied to it;
 *   the PROPOSAL  the measured recommendation and the order it produced. It binds
 *                 nobody and the read model prints it as such;
 *   the AGREEMENT the arbiter's ratified precedence: the order, the effective
 *                 window, the review date, the rationale, and a POINTER to every
 *                 obligation it issued;
 *   the DISSENTS  each party's own answer, in their own words, recorded whether
 *                 it agrees or objects.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a score, a rank number, an "arbitration score", a percentage, a league
 *    table or any composite index. Every one of those is DERIVED on read from
 *    the frozen integers, so a re-score cannot drift from the numbers it claims
 *    to rank. If the printed order and the stored integers ever disagreed, the
 *    panel would be lying with a straight face — which is exactly the failure the
 *    Bulletproof Reliability Mandate forbids.
 *  - the state machine (`open` / `proposed` / `agreed` / `withdrawn`). It is
 *    re-derived from which acts exist, so a hand-edited file cannot promote a
 *    proposal into an agreement.
 *  - a copy of a delegation, a decision or a person record. The agreement holds
 *    an id pointer; whether that obligation still exists, and in what state, is
 *    re-read from the real record every time the panel renders.
 *
 * A malformed row is DROPPED with a printed warning, never repaired into a
 * plausible agreement: an arbitration invented at load time is a precedence
 * nobody negotiated, and a fabricated agreement is worse than a blank one.
 *
 * ALL ARITHMETIC INPUTS ARE INTEGERS in a DECLARED unit with no currency symbol.
 * Integer discipline is what makes the printed order exactly checkable against
 * the stored inputs (see `priorityRank`), instead of a float ordering that rounds
 * two genuinely different demands into a tie and then invents a tie-break.
 */

import {
  PRIORITY_BOUNDS,
  PRIORITY_DEFAULTS,
  PRIORITY_DISPOSITION_KEYS,
  PRIORITY_LIMITS,
  PRIORITY_VERDICT_LABELS,
} from './priorityArbitrationRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.trim()) ? value.trim() : null;
}

function stamp(value) {
  const s = text(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function day(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function clampInt(value, bounds, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, n));
}

/**
 * A declared integer measurement. `null` is honest — the manager did not state
 * it — and is never coerced to 0, because `Number(null) === 0` is precisely the
 * defect ADR-0136 had to repair in the budget ledger: a missing figure read as a
 * measured zero and quietly won or lost a comparison.
 */
function measurement(value, { min = 0, max = PRIORITY_LIMITS.valueMax } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

/** The two parties' shared vocabulary for "what happened to this demand". */
function normalizeTreatment(raw) {
  if (!isPlainObject(raw)) return null;
  const disposition = PRIORITY_DISPOSITION_KEYS.includes(raw.disposition) ? raw.disposition : null;
  if (!disposition) return null;
  return {
    disposition,
    reason: text(raw.reason, PRIORITY_LIMITS.treatReasonChars),
    decidedOn: day(raw.decidedOn),
    decidedBySeatId: id(raw.decidedBySeatId),
  };
}

function normalizeDemand(raw, warnings, caseId) {
  if (!isPlainObject(raw)) {
    warnings.push('Priority arbitration: dropped a malformed demand row (not an object).');
    return null;
  }
  const demandId = id(raw.id);
  const managerId = id(raw.managerId);
  const title = text(raw.title, PRIORITY_LIMITS.titleChars);
  const frozenAt = stamp(raw.frozenAt);
  if (!demandId || !managerId || !title || !frozenAt) {
    warnings.push(`Priority arbitration: case “${caseId}” dropped a demand with no line, no title or no freeze date; no demand was inferred.`);
    return null;
  }
  const treatment = normalizeTreatment(raw.treatment);
  return {
    id: demandId,
    lineId: id(raw.lineId),
    managerId,
    managerName: text(raw.managerName, 120),
    kind: text(raw.kind, 40),
    kindLabel: text(raw.kindLabel, 60),
    title,
    dueOn: day(raw.dueOn),
    // Declared, never inferred. `null` = not stated, and the ranking refuses
    // rather than treating it as zero.
    cod: measurement(raw.cod),
    jobSize: measurement(raw.jobSize, { min: 1 }),
    chainDays: measurement(raw.chainDays, { min: 0, max: PRIORITY_LIMITS.chainDaysMax }),
    frozenAt,
    // A demand with no recorded treatment is `pending`, and a case with a
    // pending demand cannot be agreed. That is a rule, not a default value.
    treatment,
  };
}

/**
 * A ranked order is only a ranked order if it names EVERY frozen demand exactly
 * once. Anything else is a proposal about records the case does not hold, and it
 * is dropped rather than trimmed into shape.
 */
function normalizeOrder(rawOrder, demandIds) {
  if (!Array.isArray(rawOrder)) return null;
  const wanted = new Set(demandIds);
  const seen = new Set();
  const out = [];
  for (const value of rawOrder) {
    const demandId = id(value);
    if (!demandId || !wanted.has(demandId) || seen.has(demandId)) return null;
    seen.add(demandId);
    out.push(demandId);
  }
  return out.length === demandIds.length ? out : null;
}

function normalizeProposal(raw, demandIds, warnings, caseId) {
  if (!isPlainObject(raw)) return null;
  const at = stamp(raw.at);
  const bySeatId = id(raw.bySeatId);
  // Validated against the PRINTED verdict vocabulary, keyed by the literal string
  // the action stores (`clear-first`, `contested`, ...). Looking it up in the
  // camelCase constant map would reject every real verdict and silently drop a
  // proposal that is perfectly readable — which is a data-loss bug wearing a
  // validation's clothes.
  const verdict = Object.prototype.hasOwnProperty.call(PRIORITY_VERDICT_LABELS, raw.verdict) ? raw.verdict : null;
  const rankedIds = normalizeOrder(raw.rankedIds, demandIds);
  if (!at || !verdict || !rankedIds) {
    warnings.push(`Priority arbitration: case “${caseId}” dropped an unreadable proposal. A proposal that does not name every frozen demand exactly once is not a ranking of this case.`);
    return null;
  }
  return {
    at,
    bySeatId,
    verdict,
    rankedIds,
    rationale: text(raw.rationale, PRIORITY_LIMITS.noteChars),
  };
}

function normalizeAgreement(raw, demandIds, warnings, caseId) {
  if (!isPlainObject(raw)) return null;
  const at = stamp(raw.at);
  const bySeatId = id(raw.bySeatId);
  const rationale = text(raw.rationale, PRIORITY_LIMITS.noteChars);
  const rankedIds = normalizeOrder(raw.rankedIds, demandIds);
  const effectiveFrom = day(raw.effectiveFrom);
  const effectiveTo = day(raw.effectiveTo);
  const reviewOn = day(raw.reviewOn);
  if (!at || !rankedIds || !effectiveFrom || !effectiveTo || effectiveFrom > effectiveTo) {
    warnings.push(`Priority arbitration: case “${caseId}” dropped an agreement it could not read back exactly (order, effective window or ratification date missing). An agreement the product cannot reconstruct is not an agreement, and it was not loaded.`);
    return null;
  }
  if (rationale.length < 12) {
    warnings.push(`Priority arbitration: case “${caseId}” dropped an agreement with no written rationale. “Because I said so” is not a precedence two managers can be held to.`);
    return null;
  }
  // Obligations are POINTERS. A pointer with no demand id is not attributable to
  // a line, and is dropped with the count reported rather than silently kept.
  const issued = [];
  if (Array.isArray(raw.issued)) {
    const seen = new Set();
    for (const entry of raw.issued) {
      if (!isPlainObject(entry)) continue;
      const demandId = id(entry.demandId);
      const taskId = id(entry.taskId);
      const dueOn = day(entry.dueOn);
      if (!demandId || !taskId || !dueOn) continue;
      if (!demandIds.includes(demandId) || seen.has(taskId)) continue;
      seen.add(taskId);
      issued.push({ demandId, taskId, dueOn });
    }
  }
  return {
    at,
    bySeatId,
    rationale,
    rankedIds,
    effectiveFrom,
    effectiveTo,
    reviewOn,
    issued,
    supersededBy: id(raw.supersededBy),
  };
}

/**
 * Each party answers once. A second answer from the same seat is dropped, not
 * stacked: two contradictory stances from one manager is not two facts, it is an
 * unresolved record, and the register keeps the first one it can read.
 */
function normalizeDissents(raw, warnings, caseId) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const at = stamp(entry.at);
    const seatId = id(entry.seatId);
    const stance = entry.stance === 'object' || entry.stance === 'abstain' ? entry.stance : null;
    if (!at || !seatId || !stance) {
      warnings.push(`Priority arbitration: case “${caseId}” dropped an unreadable party answer.`);
      continue;
    }
    if (seen.has(seatId)) {
      warnings.push(`Priority arbitration: case “${caseId}” already holds an answer from that seat; the later one was not stacked on top of it.`);
      continue;
    }
    seen.add(seatId);
    out.push({ at, seatId, stance, reason: text(entry.reason, PRIORITY_LIMITS.treatReasonChars) });
  }
  return out;
}

/**
 * The arbitration ledger. A case is dropped whole if its frame is unreadable: a
 * case about no person, opened on no day, is not a case, and half-loading it
 * would put demands into a span whose capacity the read model cannot resolve.
 */
export function normalizePriorityArbitrations(value, people = null, warnings = []) {
  if (!Array.isArray(value)) return [];
  const known = Array.isArray(people) && people.length
    ? new Set(people.filter((p) => p && typeof p.id === 'string').map((p) => p.id))
    : null;
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Priority arbitration: dropped a malformed case row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const personId = id(raw.personId);
    const openedOn = day(raw.openedOn);
    const openedAt = stamp(raw.openedAt);
    if (!rowId || !personId || !openedOn || !openedAt) {
      warnings.push('Priority arbitration: dropped an incomplete case; no arbitration was inferred.');
      continue;
    }
    if (known && !known.has(personId)) {
      warnings.push('Priority arbitration: dropped a case about a person who is not on this roster. A contention about nobody is not a case.');
      continue;
    }
    if (seen.has(rowId)) {
      warnings.push('Priority arbitration: dropped a duplicate case id.');
      continue;
    }
    seen.add(rowId);

    const demands = [];
    const rawDemands = Array.isArray(raw.demands) ? raw.demands : [];
    const demandIds = new Set();
    for (const entry of rawDemands) {
      if (demands.length >= PRIORITY_LIMITS.demandsPerCase) {
        warnings.push(`Priority arbitration: case “${rowId}” carries more than the declared maximum of ${PRIORITY_LIMITS.demandsPerCase} demands; the excess rows were not loaded and no demand was invented to replace them.`);
        break;
      }
      const demand = normalizeDemand(entry, warnings, rowId);
      if (!demand) continue;
      if (demandIds.has(demand.id)) {
        warnings.push(`Priority arbitration: case “${rowId}” dropped a duplicate demand id.`);
        continue;
      }
      demandIds.add(demand.id);
      demands.push(demand);
    }
    const ids = demands.map((d) => d.id);

    const withdrawnOn = day(raw.withdrawnOn);
    const withdrawnAt = stamp(raw.withdrawnAt);
    const withdrawReason = text(raw.withdrawReason, PRIORITY_LIMITS.treatReasonChars);
    if (raw.status === 'withdrawn' && (!withdrawnOn || !withdrawnAt || withdrawReason.length < 8)) {
      warnings.push(`Priority arbitration: case “${rowId}” was marked withdrawn without a date and a reason; it loads as OPEN rather than as a silent cancellation.`);
    }
    const isWithdrawn = raw.status === 'withdrawn' && Boolean(withdrawnOn && withdrawnAt && withdrawReason.length >= 8);

    out.push({
      id: rowId,
      personId,
      personName: text(raw.personName, 120),
      openedOn,
      openedAt,
      openedBySeatId: id(raw.openedBySeatId),
      note: text(raw.note, PRIORITY_LIMITS.noteChars),
      demands,
      proposal: normalizeProposal(raw.proposal, ids, warnings, rowId),
      agreement: normalizeAgreement(raw.agreement, ids, warnings, rowId),
      dissents: normalizeDissents(raw.dissents, warnings, rowId),
      withdrawnOn: isWithdrawn ? withdrawnOn : null,
      withdrawnAt: isWithdrawn ? withdrawnAt : null,
      withdrawReason: isWithdrawn ? withdrawReason : '',
      status: isWithdrawn ? 'withdrawn' : 'open',
    });
    if (out.length >= 400) {
      warnings.push('Priority arbitration: ledger cap reached; additional cases were not loaded.');
      break;
    }
  }
  return out;
}

export function normalizePriorityMarkers(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const key = text(raw.key, 200);
    const at = stamp(raw.at);
    if (!key || !at || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      at,
      ruleId: text(raw.ruleId, 40),
      kind: text(raw.kind, 60),
      detail: text(raw.detail, 300),
    });
    if (out.length >= PRIORITY_LIMITS.markers) break;
  }
  return out;
}

export function normalizePrioritySettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    priorityPrecedenceDays: clampInt(source.priorityPrecedenceDays, PRIORITY_BOUNDS.precedenceDays, PRIORITY_DEFAULTS.precedenceDays),
    priorityReviewDays: clampInt(source.priorityReviewDays, PRIORITY_BOUNDS.reviewDays, PRIORITY_DEFAULTS.reviewDays),
    priorityCapacityShareH: clampInt(source.priorityCapacityShareH, PRIORITY_BOUNDS.capacityShareH, PRIORITY_DEFAULTS.capacityShareH),
  };
}

export function priorityMarkerKey(...parts) {
  return parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|');
}
