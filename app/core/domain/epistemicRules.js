/**
 * app/core/domain/epistemicRules.js — RULE-EPI-01..05 on the shared post-commit
 * spine (ADR-0103, Schema v105).
 *
 *  RULE-EPI-01 HARVEST. Every signal the record already holds becomes ONE
 *    unknown, written once and never re-harvested (the id is a hash of the
 *    source record, so a rescan cannot duplicate it). The unknown becomes a
 *    graph node with one `rests-on` edge to the record it was read from and one
 *    `rolls-up-to` edge per leadership ancestor of the owning span — so the same
 *    atomic transaction that notices a missed signal also makes the MISSING
 *    signal visible above the span that missed it.
 *
 *  RULE-EPI-02 ESCALATE. An unopened DANGER or DEFECT unknown that has passed
 *    the declared escalation age opens exactly ONE governed decision per unknown,
 *    ever, owned at the span that owns it and naming the record, the age and the
 *    two honest routes (read it, or dismiss it with a reason). This is the rule
 *    that turns "we never noticed" into a named decision with an owner. Since
 *    ADR-0117 it is also the bounded backlog policy: at most
 *    `epistemicEscalateMaxPerWeek` escalations open per owning span per ISO week
 *    (oldest condition first, every transaction respecting the week's remaining
 *    quota), and the over-budget remainder stays queued and is PRINTED — a
 *    deferral marker per span per week and a live count on the Desk — rather
 *    than flooding a span's decision inbox faster than any human can read it.
 *
 *  RULE-EPI-03 EXPIRE. A harvested unknown whose declared evidence-bound expiry
 *    has passed with no human answer is marked `expired` and opens ONE governed
 *    decision per unknown per ISO week. The workspace refuses to launder a missed
 *    risk into a closed one by the passage of time.
 *
 *  RULE-EPI-04 GAP. A span whose beliefs over-predict good outcomes above the
 *    declared floor opens ONE calibration review per span per ISO week: the
 *    count of beliefs that ran ahead of the record goes up, the individual
 *    beliefs do not. Under-confidence is NOT escalated here — it is handed down
 *    by the screen, because its owner is the span itself.
 *
 *  RULE-EPI-05 GRADE. A frozen belief observation is scored exactly ONCE against
 *    the record's own outcomes, by the same discipline every other ledger in this
 *    workspace applies: the claim is frozen, the grade is a separate dated row,
 *    and the error is printed rather than hidden.
 *
 * All five are bounded, marker-idempotent and pausable by
 * `epistemicAutoPropagate`; an explicit `epistemic.scan` always runs every pass.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats, activeSeat } from './seat.js';
import { LEADER_ID, responsibleNodeId } from './chain.js';
import {
  buildEpistemicReport,
  cohenKappa,
  calibrationVerdict,
  escalationWeekOpenings,
  harvestSignals,
  scoreObservation,
  unknownAgeDays,
} from './epistemic.js';
import { epistemicConventions } from './epistemicSchema.js';
import {
  EPISTEMIC_EVENTS,
  EPISTEMIC_LIMITS,
  EPISTEMIC_RULE_IDS,
  EPISTEMIC_TRIGGER_PREFIX,
  epistemicMarkerId,
  harvestedUnknownId,
} from './epistemicRegistry.js';

function markersOf(draft) {
  return Array.isArray(draft.epistemicMarkers) ? draft.epistemicMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.epistemicMarkers)) draft.epistemicMarkers = [];
  if (draft.epistemicMarkers.some((row) => row && row.id === marker.id)) return false;
  draft.epistemicMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.epistemicMarkers.length > EPISTEMIC_LIMITS.markers) {
    draft.epistemicMarkers.splice(0, draft.epistemicMarkers.length - EPISTEMIC_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: String(summary || '').slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${String(summary).slice(0, 260)}`,
    });
  }
}

function ancestorsAbove(draft, seatId, now) {
  if (!seatId) return [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== LEADER_ID && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationale }) {
  const today = dayKey(ctx.now);
  const driver = String(ctx.draft?.settings?.leaderName || '').slice(0, 120);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility: 'reversible',
    driver,
    approver: driver,
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: rationale.slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function linkFindingDecision(draft, ctx, ruleId, decision, sourceType, sourceId, ownerSeatId, summary) {
  if (sourceType && sourceId) {
    addLink(draft, ctx, 'decision', decision.id, sourceType, sourceId, 'informs', ruleId, summary);
  }
  if (ownerSeatId) {
    addLink(draft, ctx, 'decision', decision.id, 'person', ownerSeatId, 'informs', ruleId,
      'The finding informs the span that owns the unknown it was read from.');
    for (const ancestor of ancestorsAbove(draft, ownerSeatId, ctx.now)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', ancestor, 'rolls-up-to', ruleId,
        'The finding rolls up to this leadership ancestor.');
    }
  }
}

/* ------------------------------------------------ RULE-EPI-01: harvest */

function harvestPass(draft, ctx, out, conventions) {
  const signals = harvestSignals(draft, { now: ctx.now, settings: draft.settings || {} });
  if (!signals.length) return 0;
  if (!Array.isArray(draft.epistemicUnknowns)) draft.epistemicUnknowns = [];
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  const seat = activeSeat(built);
  const existing = new Set(draft.epistemicUnknowns
    .filter((row) => row && row.origin !== 'declared')
    .map((row) => `${row.sourceType}:${row.sourceId}|${row.signalKey || ''}`));
  let createdN = 0;
  for (const signal of signals) {
    if (draft.epistemicUnknowns.length >= EPISTEMIC_LIMITS.unknowns) break;
    const key = `${signal.sourceType}:${signal.sourceId}|${signal.signalKey}`;
    if (existing.has(key)) continue;
    // Attribute the unknown to the span that OWNS the work the signal came from,
    // not to whoever happens to be operating the browser. A signal with no
    // identifiable owner belongs to the workspace, and is clamped to `chief` and
    // held in review by the scale that declared it.
    // The owner is the NEAREST leadership span responsible for the work the
    // signal came from — the same `responsibleNodeId` the Command Chain uses to
    // attribute work, so the ledger and the chain cannot disagree about who owns
    // an unread signal.
    const people = signal.people || [];
    const responsible = people.length ? responsibleNodeId(built.chain, people) : LEADER_ID;
    const ownerSeat = responsible && responsible !== LEADER_ID ? (built.byId.get(responsible) || null) : null;
    const id = harvestedUnknownId(signal.className, signal.sourceType, signal.sourceId);
    const row = {
      id,
      title: signal.title,
      className: signal.className,
      origin: 'harvested',
      signalKey: signal.signalKey,
      discipline: signal.discipline,
      sourceType: signal.sourceType,
      sourceId: signal.sourceId,
      sourceRoute: signal.route,
      evidenceClass: signal.evidenceClass,
      severity: signal.severity,
      ownerSeatId: ownerSeat ? ownerSeat.id : null,
      altitudeKey: ownerSeat ? ownerSeat.altitudeKey : 'chief',
      rank: ownerSeat ? ownerSeat.rank : 5,
      harvestedOn: dayKey(ctx.now),
      evidencesOn: signal.evidencesOn,
      expiresOn: signal.expiresOn,
      state: 'unopened',
      openedOn: null,
      answeredOn: null,
      answer: '',
      dismissReason: '',
      belief: null,
      refs: [{ type: signal.sourceType, id: signal.sourceId }],
      timeline: [{ at: ctx.now.toISOString(), on: dayKey(ctx.now), kind: 'harvested', text: `Harvested from a ${signal.sourceType} record dated ${signal.evidencesOn}.`, by: seat.id === 'leader' ? null : seat.id }],
      engineVersion: 'epistemic-ledger-2026.11-v1',
      createdAt: ctx.now.toISOString(),
      updatedAt: ctx.now.toISOString(),
    };
    draft.epistemicUnknowns.push(row);
    existing.add(key);
    createdN += 1;
    addLink(draft, ctx, 'unknown', id, signal.sourceType, signal.sourceId, 'rests-on',
      EPISTEMIC_RULE_IDS.HARVEST,
      `This unknown was harvested from the ${signal.sourceType} record it summarises; no content was copied.`);
    if (ownerSeat) {
      for (const ancestor of ancestorsAbove(draft, ownerSeat.id, ctx.now)) {
        addLink(draft, ctx, 'unknown', id, 'person', ancestor, 'rolls-up-to',
          EPISTEMIC_RULE_IDS.HARVEST,
          `A ${signal.className} signal owned below this span has not been read.`);
      }
    }
    note(ctx, out, EPISTEMIC_RULE_IDS.HARVEST, 'registered', 'unknown', id,
      `Harvested one unopened ${signal.className} signal from a ${signal.sourceType} record dated ${signal.evidencesOn}.`);
  }
  void conventions;
  return createdN;
}

/* ----------------------------------------------- RULE-EPI-02: escalate */

function escalatePass(draft, ctx, out, conventions, budget) {
  if (!Array.isArray(draft.epistemicUnknowns)) return 0;
  const today = dayKey(ctx.now);
  const week = weekKey(ctx.now) || today;
  // ADR-0117: the bounded backlog policy. Each owning span may open at most
  // `epistemicEscalateMaxPerWeek` escalations per ISO week — a WIP limit on the
  // escalation inbox (Anderson's bounded work-in-progress; Reinertsen's
  // small-batch economics) so a large harvested backlog drains as a weekly
  // batch a human can read, instead of opening six governed decisions on every
  // unrelated save until the queue is empty. The counts come from the marker
  // ledger, so EVERY transaction in the week shares one quota — including an
  // explicit scan — and a decision can never open twice for the same unknown.
  const cap = conventions.epistemicEscalateMaxPerWeek;
  const openedBySeat = escalationWeekOpenings(draft, { now: ctx.now });
  const deferredBySeat = new Map();
  let openedN = 0;
  const ordered = [...draft.epistemicUnknowns]
    .filter((row) => row && row.state === 'unopened' && ['danger', 'defect'].includes(row.className))
    // Oldest condition first: the debt that has waited longest is the first the
    // week's batch buys back, and what the quota defers is the newest arrival.
    .sort((a, b) => String(a.evidencesOn || a.harvestedOn).localeCompare(String(b.evidencesOn || b.harvestedOn))
      || String(a.harvestedOn).localeCompare(String(b.harvestedOn))
      || String(a.id).localeCompare(String(b.id)));
  for (const row of ordered) {
    if (budget.remaining <= 0) break;
    // The age that matters is the age of the CONDITION, not of our bookmark: a
    // case open for sixty-five days is escalated on the day it is harvested,
    // because the organisation has already waited two months to look at it.
    const age = unknownAgeDays(row, today);
    if (age < conventions.epistemicEscalateDays) continue;
    const marker = epistemicMarkerId('escalate', row.id);
    if (markersOf(draft).some((m) => m && m.id === marker)) continue;
    const seatKey = row.ownerSeatId || 'workspace';
    if ((openedBySeat.get(seatKey) || 0) >= cap) {
      deferredBySeat.set(seatKey, (deferredBySeat.get(seatKey) || 0) + 1);
      continue;
    }
    const decision = decisionRecord(ctx, {
      title: `Unread ${row.className} signal, ${age} day(s) old: read it or dismiss it`,
      question: [
        `The record has carried this signal since ${row.evidencesOn} and nobody has opened it.`,
        row.title,
        `It was harvested on ${row.harvestedOn} and has now passed the declared escalation age of ${conventions.epistemicEscalateDays} day(s).`,
        'Two routes are honest: read the record and answer what it shows, or dismiss it with a written reason. Leaving it unopened is the only option that costs the ledger — and the dismissal rate this screen prints is how the workspace finds out if dismissing is becoming the habit.',
      ].join(' '),
      options: [
        ['Read it and record what it shows', 'Closes the unknown with an act rather than with time, and makes the answer rate real.', 'Takes the minutes the age already cost.'],
        ['Dismiss it with a reason', 'Honest when the signal is noise — the record was wrong, not the reader.', 'Counts against the answer rate, permanently, and the reason is kept.'],
      ],
      reviewOn: addDays(today, conventions.epistemicReviewDays),
      rationale: `RULE-EPI-02: an unopened ${row.className} signal harvested on ${row.harvestedOn} passed the declared escalation age of ${conventions.epistemicEscalateDays} day(s). One governed decision per unknown, ever, opened inside this span's declared weekly escalation budget of ${cap}.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    linkFindingDecision(draft, ctx, EPISTEMIC_RULE_IDS.ESCALATE, decision, 'unknown', row.id, row.ownerSeatId,
      'The escalation tracks the unknown it asks to be read.');
    addMarker(draft, ctx, {
      id: marker, kind: 'escalate', key: row.id, unknownId: row.id, decisionId: decision.id,
      ownerSeatId: row.ownerSeatId || null, weekKey: week,
      note: `Unopened ${row.className} signal, ${age} day(s) old.`,
    });
    row.updatedAt = ctx.now.toISOString();
    openedN += 1;
    openedBySeat.set(seatKey, (openedBySeat.get(seatKey) || 0) + 1);
    budget.remaining -= 1;
    note(ctx, out, EPISTEMIC_RULE_IDS.ESCALATE, 'created', 'decision', decision.id,
      `Opened one governed decision for an unopened ${row.className} signal ${age} day(s) old.`);
  }
  // The remainder is deferred, never dropped: one dated deferral marker per
  // span per ISO week (so a repeat pass cannot re-log it) and a live count with
  // its renewal week on the Desk. A deferral is a queue, not a resolution.
  for (const [seatKey, deferredN] of deferredBySeat) {
    const added = addMarker(draft, ctx, {
      id: epistemicMarkerId('escalate-deferred', `${seatKey}|${week}`),
      kind: 'escalate-deferred', key: `${seatKey}|${week}`, weekKey: week,
      ownerSeatId: seatKey === 'workspace' ? null : seatKey,
      note: `RULE-EPI-02 deferred ${deferredN} escalation(s) beyond the declared weekly budget of ${cap} for this span.`,
    });
    if (added) {
      note(ctx, out, EPISTEMIC_RULE_IDS.ESCALATE, 'deferred', 'epistemic', 'backlog',
        `Deferred ${deferredN} escalation(s) beyond the declared weekly budget of ${cap} for one span; they stay queued, oldest first, and open as the weekly quota renews.`);
    }
  }
  return openedN;
}

/* ------------------------------------------------- RULE-EPI-03: expire */

function expirePass(draft, ctx, out, conventions, budget) {
  if (!Array.isArray(draft.epistemicUnknowns)) return 0;
  const today = dayKey(ctx.now);
  const week = weekKey(ctx.now) || today;
  let expiredN = 0;
  for (const row of draft.epistemicUnknowns) {
    if (budget.remaining <= 0) break;
    if (!row || !['unopened', 'open'].includes(row.state)) continue;
    if (!row.expiresOn || row.expiresOn >= today) continue;
    // The transition is one-way and dated: expiry is not resolution, and the
    // state change itself is the record a later reader needs.
    if (row.state !== 'expired') {
      row.state = 'expired';
      row.updatedAt = ctx.now.toISOString();
      row.timeline = Array.isArray(row.timeline) ? row.timeline : [];
      row.timeline.push({ at: ctx.now.toISOString(), on: today, kind: 'expired', text: `Declared expiry ${row.expiresOn} passed with no human answer.`, by: null });
      expiredN += 1;
    }
    const marker = epistemicMarkerId('expire', `${row.id}|${week}`);
    if (markersOf(draft).some((m) => m && m.id === marker)) continue;
    const decision = decisionRecord(ctx, {
      title: `A signal expired unanswered: ${row.title.slice(0, 120)}`,
      question: [
        `This ${row.className} signal was harvested on ${row.harvestedOn} with a declared evidence-bound expiry of ${row.expiresOn}.`,
        'The window has passed with no human answer. The workspace will not record that as resolved: the risk did not go away because the quarter ended, and a ledger that let it would be reporting its own hygiene rather than the organisation.',
        'Answer it now, or record that it can no longer be answered and why. Both are honest; silence is not.',
      ].join(' '),
      options: [
        ['Answer it now, late', 'Keeps the record truthful and the age visible; a late answer still teaches.', 'A late answer is weaker evidence than a timely one, and the dates stay on the record.'],
        ['Record that it cannot be answered', 'Honest when the window closed on information nobody holds any more.', 'Removes it from the answer rate permanently; that has to be a human judgement.'],
      ],
      reviewOn: addDays(today, conventions.epistemicReviewDays),
      rationale: `RULE-EPI-03: an unknown with declared expiry ${row.expiresOn} passed it with no answer. One bounded prompt per unknown per ISO week.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    linkFindingDecision(draft, ctx, EPISTEMIC_RULE_IDS.EXPIRE, decision, 'unknown', row.id, row.ownerSeatId,
      'The expiry prompt tracks the unknown whose window closed.');
    addMarker(draft, ctx, {
      id: marker, kind: 'expire', key: `${row.id}|${week}`, unknownId: row.id, decisionId: decision.id, weekKey: week,
      note: `Declared expiry ${row.expiresOn} passed unanswered.`,
    });
    budget.remaining -= 1;
    note(ctx, out, EPISTEMIC_RULE_IDS.EXPIRE, 'created', 'decision', decision.id,
      'Opened one governed decision for an unknown whose declared expiry passed unanswered.');
  }
  return expiredN;
}

/* ---------------------------------------------------- RULE-EPI-04: gap */

function gapPass(draft, ctx, out, conventions, budget) {
  const observations = Array.isArray(draft.epistemicObservations) ? draft.epistemicObservations : [];
  if (!observations.length) return 0;
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const bySeat = new Map();
  for (const observation of observations) {
    const cells = { agreedOk: 0, optimism: 0, pessimism: 0, agreedBad: 0 };
    const scored = scoreObservation(draft, observation);
    Object.assign(cells, scored.cells);
    const key = observation.ownerSeatId || 'workspace';
    if (!bySeat.has(key)) bySeat.set(key, { agreedOk: 0, optimism: 0, pessimism: 0, agreedBad: 0 });
    const acc = bySeat.get(key);
    for (const cell of Object.keys(acc)) acc[cell] += cells[cell];
  }
  let openedN = 0;
  for (const [seatKey, cells] of bySeat) {
    if (budget.remaining <= 0) break;
    const kappa = cohenKappa(cells, { pairFloor: conventions.epistemicPairFloor });
    if (kappa.refused) continue;
    const verdict = calibrationVerdict(kappa, { conventions });
    if (verdict.key !== 'optimism') continue;
    const marker = epistemicMarkerId('gap', `${seatKey}|${week}`);
    if (markersOf(draft).some((m) => m && m.id === marker)) continue;
    const ownerSeatId = seatKey === 'workspace' ? null : seatKey;
    const decision = decisionRecord(ctx, {
      title: `Calibration review: beliefs ran ahead of the record on ${kappa.b + kappa.c} of ${kappa.n} graded pairs`,
      question: [
        `Across the frozen belief observations this span declared, ${kappa.b} said work was fine when the record later said it was not, against ${kappa.c} the other way.`,
        `Kappa is ${kappa.kappa} (PABAK ${kappa.pabak}), the bias index is ${kappa.biasIndex} and the two-sided p is ${kappa.p}.`,
        verdict.reason,
        'The finding is about the SPAN and its reading of its own record, never about a person. The individual beliefs are not listed here and do not climb: what climbs is the count and the direction.',
      ].join(' '),
      options: [
        ['Change what this span reads before it declares', 'The only fix with a mechanism behind it: the beliefs are formed from the wrong inputs.', 'Slower to declare, and honest about it.'],
        ['Re-declare the paired-belief floor', 'If the floor is wrong, the reading is wrong, and re-declaring it is the fixed way to say so.', 'Moves the obstacle for every span at once; director+ only.'],
      ],
      reviewOn: addDays(dayKey(ctx.now), conventions.epistemicReviewDays),
      rationale: `RULE-EPI-04: pooled belief-versus-record kappa ${kappa.kappa} with bias index ${kappa.biasIndex} at ${kappa.n} paired beliefs. One calibration review per span per ISO week.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    linkFindingDecision(draft, ctx, EPISTEMIC_RULE_IDS.GAP, decision, null, null, ownerSeatId,
      'The calibration review concerns the span’s own reading of the record.');
    addMarker(draft, ctx, {
      id: marker, kind: 'gap', key: `${seatKey}|${week}`, decisionId: decision.id, weekKey: week,
      note: `Optimism gap: bias index ${kappa.biasIndex} at ${kappa.n} paired beliefs.`,
    });
    openedN += 1;
    budget.remaining -= 1;
    note(ctx, out, EPISTEMIC_RULE_IDS.GAP, 'created', 'decision', decision.id,
      'Opened one calibration review for a span whose beliefs over-predict good outcomes.');
  }
  return openedN;
}

/* -------------------------------------------------- RULE-EPI-05: grade */

function gradePass(draft, ctx, out, budget) {
  const observations = Array.isArray(draft.epistemicObservations) ? draft.epistemicObservations : [];
  if (!observations.length) return 0;
  if (!Array.isArray(draft.epistemicGrades)) draft.epistemicGrades = [];
  const graded = new Set(draft.epistemicGrades.filter((row) => row && row.observationId).map((row) => row.observationId));
  const conventions = epistemicConventions(draft.settings || {});
  let gradedN = 0;
  for (const observation of observations) {
    if (budget.remaining <= 0) break;
    if (!observation || !observation.id || graded.has(observation.id)) continue;
    const scored = scoreObservation(draft, observation);
    // Grade only once at least one pair has a resolved outcome. An observation
    // with nothing resolved yet stays live — grading it now would freeze a row
    // of zeros and call it a result.
    if (scored.pairedN < 1) continue;
    const kappa = cohenKappa(scored.cells, { pairFloor: conventions.epistemicPairFloor });
    const verdict = calibrationVerdict(kappa, { conventions });
    const grade = {
      id: ctx.idFactory('epigrade'),
      observationId: observation.id,
      gradedOn: dayKey(ctx.now),
      cells: { ...scored.cells },
      unpairedN: scored.unpairedN,
      kappa: kappa.refused ? null : kappa.kappa,
      pabak: kappa.refused ? null : kappa.pabak,
      prevalenceIndex: kappa.refused ? null : kappa.prevalenceIndex,
      biasIndex: kappa.refused ? null : kappa.biasIndex,
      verdict: verdict.key,
      ownerSeatId: observation.ownerSeatId || null,
      altitudeKey: observation.altitudeKey || null,
      rank: observation.rank || 5,
      engineVersion: 'epistemic-ledger-2026.11-v1',
      createdAt: ctx.now.toISOString(),
    };
    draft.epistemicGrades.push(grade);
    graded.add(observation.id);
    observation.gradedOn = grade.gradedOn;
    observation.cells = { ...scored.cells };
    observation.unpairedN = scored.unpairedN;
    gradedN += 1;
    budget.remaining -= 1;
    note(ctx, out, EPISTEMIC_RULE_IDS.GRADE, 'graded', 'epistemicgrade', grade.id,
      `Graded one frozen belief observation once: ${scored.pairedN} paired, κ ${kappa.refused ? 'refused' : kappa.kappa}, verdict ${verdict.key}.`);
  }
  return gradedN;
}

/**
 * Decisions THIS module opened are audit output, not operational work: locking
 * one would make the hindsight audit measure the ledger's own findings, and every
 * escalation would immediately spawn a second-order decision about the first.
 * The provenance is the marker written in the same transaction the decision was.
 */
export function epistemicFindingIds(state = {}) {
  const out = new Set();
  for (const marker of Array.isArray(state.epistemicMarkers) ? state.epistemicMarkers : []) {
    if (marker && marker.decisionId) out.add(marker.decisionId);
  }
  return out;
}

/* ------------------------------------------------------------------- rule */

export function epistemicRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === EPISTEMIC_EVENTS.SCAN || event.type === EPISTEMIC_EVENTS.ANSWERED
    || event.type === EPISTEMIC_EVENTS.DISMISSED || event.type === EPISTEMIC_EVENTS.OBSERVED
    || event.type === EPISTEMIC_EVENTS.DECLARED;
  const own = event.type.startsWith(EPISTEMIC_TRIGGER_PREFIX);
  const conventions = epistemicConventions(ctx.settings || draft.settings || {});
  if (!explicit && !own && conventions.epistemicAutoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    draft,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const out = [];
  // Two bounds, deliberately separate. The PER-PASS budget is the spine-cost
  // governor: the spine runs on every commit, and a module that opened six
  // governed decisions on every unrelated write would bury the workspace; an
  // explicit scan pays the ledger's own size instead, so a scan does not take
  // one pass per six findings and read as non-idempotence. The PER-SPAN WEEKLY
  // budget (ADR-0117, in `escalatePass`) is the workload governor: it binds
  // every transaction — scans included — so the escalation inbox of any one
  // span grows by at most `epistemicEscalateMaxPerWeek` per ISO week, and the
  // over-budget remainder is deferred and printed rather than dropped.
  // (Hindsight refuses to lock these findings either way: audit output is not
  // operational work. See RULE-HND-01 and `epistemicFindingIds`.)
  const explicitScan = event.type === EPISTEMIC_EVENTS.SCAN;
  const budget = {
    remaining: explicitScan ? EPISTEMIC_LIMITS.unknowns : EPISTEMIC_LIMITS.findingsPerPass,
  };
  harvestPass(draft, runCtx, out, conventions);
  escalatePass(draft, runCtx, out, conventions, budget);
  expirePass(draft, runCtx, out, conventions, budget);
  gapPass(draft, runCtx, out, conventions, budget);
  gradePass(draft, runCtx, out, budget);
  return out;
}
