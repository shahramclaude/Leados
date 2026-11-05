/**
 * app/core/domain/reputationalCapitalRules.js — RULE-RCL-01..05 on the shared
 * post-commit spine (ADR-0101, Schema v103).
 *
 *  RULE-RCL-01 RECORD. Every act this workspace can already evidence becomes a
 *    first-class ledger entry, and every cell its acts support becomes a graph
 *    node with one `rests-on` edge to each source record it was derived from and
 *    one `rolls-up-to` edge per leadership ancestor of the person's span — all
 *    in the SAME atomic transaction. Cross-module automation and cross-altitude
 *    roll-up are one write, not two systems.
 *
 *  RULE-RCL-02 BREACH. A class whose interval has fallen BELOW its declared
 *    obstacle opens exactly ONE governed DACI decision per person per class per
 *    ISO week, owned at the span above the person (the span that can author the
 *    repair), naming the class, the interval and the tier ladder — never a
 *    verdict about the person's character.
 *
 *  RULE-RCL-03 GUARANTEE. An open guarantee whose cell is not solvent opens
 *    exactly ONE governed decision per position per week, addressed to the span
 *    that offered it: raise the stake, lower the obstacle, or withdraw the
 *    guarantee. The ledger prices; a human chooses.
 *
 *  RULE-RCL-04 REPAIR. A recorded repair whose due date has passed without the
 *    banked acts it declared opens ONE governed decision per repair per week.
 *    A repair that DID bank its acts is closed as kept and its decision is
 *    deliberately left open for the human who opened it.
 *
 *  RULE-RCL-05 GRADE. A tagged guarantee (one that names a source record whose
 *    outcome another module already dates) is graded exactly ONCE, out of
 *    sample, and reports the platform's own Brier-style error against its own
 *    declared claim. The ledger grades ITSELF — the same discipline ADR-0094
 *    applies to a leader's bets, applied to this module's prices.
 *
 * All five are bounded, marker-idempotent and pausable via
 * `reputationAutoPropagate`; an explicit `reputation.scan` always runs.
 */
import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import {
  buildReputationReport,
  harvestActs,
  cellReading,
  obstaclePct,
} from './reputationalCapital.js';
import { reputationConventions } from './reputationalCapitalSchema.js';
import {
  ACT_CLASS_KEYS,
  REPUTATION_EVENTS,
  REPUTATION_LIMITS,
  REPUTATION_ACT_EVENTS,
  REPUTATION_RULE_IDS,
  REPUTATION_TRIGGER_PREFIX,
  engagementTierMeta,
} from './reputationalCapitalRegistry.js';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

const markerId = (kind, key) => `rcl-${kind}-${hash(String(key))}`;

function markersOf(draft) {
  return Array.isArray(draft.reputationMarkers) ? draft.reputationMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.reputationMarkers)) draft.reputationMarkers = [];
  if (draft.reputationMarkers.some((row) => row?.id === marker.id)) return false;
  draft.reputationMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.reputationMarkers.length > REPUTATION_LIMITS.markers) {
    draft.reputationMarkers.splice(0, draft.reputationMarkers.length - REPUTATION_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: String(summary).slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: summary.slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
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
  return {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 4000),
    date: today,
    reversibility: 'reversible',
    driver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationale).slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* ------------------------------------------------ RULE-RCL-01: record */

/**
 * Cells become graph nodes. The rule is deliberately conservative: it links one
 * `rests-on` edge per DISTINCT source record (capped), and one `rolls-up-to` edge
 * per ancestor. It never writes an act and never writes a stored cell — the cell
 * is re-derived on read, so a stored copy would be a second, drifting truth.
 */
function recordRule(draft, ctx, out, conv) {
  const harvest = harvestActs(draft, { now: ctx.now, conventions: conv });
  const byCell = new Map();
  for (const act of harvest.acts) {
    const key = `${act.personId}|${act.actClass}`;
    if (!byCell.has(key)) byCell.set(key, { acts: [], personId: act.personId, actClass: act.actClass });
    byCell.get(key).acts.push(act);
  }
  let registered = 0;
  for (const [key, bucket] of byCell) {
    if (registered >= 40) break;
    const id = markerId('cell', key);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const kept = bucket.acts.filter((a) => a.status === 'kept').length;
    const breached = bucket.acts.filter((a) => a.status === 'breached').length;
    const disputed = bucket.acts.filter((a) => a.status === 'disputed').length;
    if (!kept && !breached && !disputed) continue;
    const sources = [...new Set(bucket.acts.map((a) => `${a.sourceType}:${a.sourceId}`).filter((s) => !s.endsWith(':null')))].slice(0, 8);
    let linked = 0;
    for (const source of sources) {
      const [sourceType, sourceId] = source.split(':');
      if (!sourceId) continue;
      const ok = addLink(draft, ctx, 'person', bucket.personId, sourceType, sourceId, 'rests-on',
        REPUTATION_RULE_IDS.act,
        `A ${bucket.actClass} act in this span's reputational record is derived from this dated record; the act is re-read from the source, never copied.`);
      if (ok) linked += 1;
    }
    const ancestors = ancestorsAbove(draft, bucket.personId, ctx.now);
    for (const targetId of ancestors) {
      addLink(draft, ctx, 'person', bucket.personId, 'person', targetId, 'rolls-up-to',
        REPUTATION_RULE_IDS.act,
        `A ${bucket.actClass} reputational cell in this span rolls up: ${kept} kept, ${breached} breached, ${disputed} disputed act(s).`);
    }
    addMarker(draft, ctx, {
      id,
      kind: 'cell',
      key,
      personId: bucket.personId,
      actClass: bucket.actClass,
      note: `${bucket.actClass} cell registered: ${kept} kept, ${breached} breached, ${disputed} disputed; ${linked} source edge(s), ${ancestors.length} ancestor roll-up(s).`,
    });
    registered += 1;
    note(ctx, out, REPUTATION_RULE_IDS.act, 'registered', 'person', bucket.personId,
      `${bucket.actClass} reputational cell registered from ${sources.length} dated record(s); ${ancestors.length} ancestor roll-up edge(s).`);
  }
  return registered;
}

/* ------------------------------------------------ RULE-RCL-02: breach */

/**
 * A class whose interval has fallen BELOW its obstacle is encumbered, and one
 * that cannot be read at all because its acts are disputed is contested. Both
 * open a governed decision — but only ONCE per person per class per ISO week,
 * and only at the span that can actually author a repair.
 */
function breachRule(draft, ctx, out, conv) {
  // ADR-0101: the spine reads the WHOLE workspace, not the leader's own person id.
  // `seatId: LEADER_ID` resolved to a seat whose subtree is only the leader's own
  // acts, so the rule never saw the org beneath it and opened no finding at all —
  // the same scoping defect the report itself was repaired for. `null` resolves
  // through `activeSeat`, which is the workspace seat (full access) the post-commit
  // spine runs under; a per-seat read is the SCREEN's job, not the spine's.
  const report = buildReputationReport(draft, { now: ctx.now, settings: draft.settings });
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), Math.max(7, Math.min(30, Math.round(conv.reputationHalfLifeDays / 9))));
  let opened = 0;
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  for (const reading of report.readings) {
    if (opened >= REPUTATION_LIMITS.repairsPerScan) break;
    if (reading.verdict !== 'encumbered' && reading.verdict !== 'drawn-down' && reading.verdict !== 'contested') continue;
    const id = markerId('breach', `${reading.personId}|${reading.actClass}|${wk}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const meta = engagementTierMeta('structural');
    const isContested = reading.verdict === 'contested';
    const decision = decisionRecord(ctx, {
      title: isContested
        ? `Contested act · class withdrawal · ${reading.actClass} · week of ${wk}`
        : `Guarantee · repair · ${reading.actClass} · week of ${wk}`,
      question: [
        isContested
          ? `${reading.disputed} act(s) of the ${reading.actClass} class (${reading.actsN} on record) are disputed. Reputational capital cannot be priced on this class until the dispute is resolved, and this ledger will not resolve it.`
          : `The ${reading.actClass} class records ${reading.kept.toFixed(1)} weighted kept and ${reading.breached.toFixed(1)} decayed breach(es): a ${reading.intervalLowPct}–${reading.intervalHighPct}% interval against a ${reading.obstaclePct}% obstacle.`,
        `Declared class hazard ${reading.hazardPct}%; window ${conv.reputationWindowDays} days, half-life ${conv.reputationHalfLifeDays} days. The obstacle is a convention, clamped and printed.`,
        `The ledger prices three honest routes and chooses none: bank the missing acts, move the guarantee down the tier ladder toward "${meta.label.toLowerCase()}", or withdraw the guarantee.`,
        'This is a reading of what an act will cost to guarantee — never a judgement about whether a person is trustworthy.',
      ].join(' '),
      options: [
        [`Bank a repair of ${Math.max(1, Math.ceil((Number(reading.actsN) || 0) * 0.5))} more kept act(s) of ${reading.actClass} and re-read`, 'A costly, observable signal. Fudenberg & Tirole (1990): only a costly signal rebuilds a dissolved stake.', 'Takes real time, and a repair that cannot be met is a second breach.'],
        ['Move the guarantee down the tier ladder', 'Structural guarantees do not rest on this person at all (Grossman–Hart residual control).', 'Costs real money or an allocation of rights, and must be decided by whoever holds them.'],
        ['Withdraw the guarantee and restate the terms', 'Honest when the ask is larger than the class can ever carry.', 'The work still has to be guaranteed somehow; a withdrawal is not a solution.'],
      ],
      reviewOn,
      rationale: `RULE-RCL-02: ${reading.verdict} on the ${reading.actClass} class; opened for a human decision at the span that can author the repair. The engine prices; it never withholds a decision.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    const seatId = built.byId.has(reading.personId) ? reading.personId : null;
    const parent = seatId ? (built.chain.nodes.get(seatId)?.parentId || null) : null;
    if (parent && built.byId.has(parent)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', parent, 'informs', REPUTATION_RULE_IDS.breach,
        'The reputational-capital decision informs the span that can author the repair.');
    }
    for (const targetId of seatId ? ancestorsAbove(draft, seatId, ctx.now) : []) {
      addLink(draft, ctx, 'decision', decision.id, 'person', targetId, 'rolls-up-to', REPUTATION_RULE_IDS.breach,
        `The ${reading.actClass} reputational decision rolls up to this span.`);
    }
    addMarker(draft, ctx, {
      id,
      kind: 'breach',
      key: `${reading.personId}|${reading.actClass}|${wk}`,
      personId: reading.personId,
      actClass: reading.actClass,
      decisionId: decision.id,
      weekKey: wk,
      note: `${reading.verdict} on ${reading.actClass}: one governed decision opened.`,
    });
    opened += 1;
    note(ctx, out, REPUTATION_RULE_IDS.breach, 'created', 'decision', decision.id,
      `${reading.actClass} class ${reading.verdict}; one governed repair decision opened.`);
  }
  return opened;
}

/* ---------------------------------------------- RULE-RCL-03: guarantee */

/**
 * An open guarantee whose cell is not solvent is a promise about to fail. One
 * decision per position per ISO week, at the span that offered it — never a
 * silent expiry, and never an automatic withdrawal by the engine.
 */
function guaranteeRule(draft, ctx, out, conv) {
  const positions = Array.isArray(draft.reputationPositions) ? draft.reputationPositions : [];
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), 14);
  let opened = 0;
  for (const position of positions) {
    if (opened >= REPUTATION_LIMITS.guaranteesPerScan) break;
    if (!position || position.status !== 'open' || position.kind !== 'guarantee') continue;
    const id = markerId('guarantee', `${position.id}|${wk}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const report = buildReputationReport(draft, { now: ctx.now, settings: draft.settings });
    const priced = report.positions.find((row) => row.id === position.id);
    if (!priced || priced.reading.verdict === 'solvent') continue;
    const tier = engagementTierMeta(position.tier || 'vouching');
    const keep = priced.reading;
    const decision = decisionRecord(ctx, {
      title: `Guarantee · ${position.actClass} · ${tier.label.toLowerCase()} · ${position.dueOn || 'undated'} · week of ${wk}`,
      question: [
        `A ${tier.label.toLowerCase()} guarantee was offered on the ${position.actClass} class, due ${position.dueOn || 'no declared date'}. Today's record reads ${keep.verdict === 'refused' ? `refused (${keep.reason})` : `${keep.intervalLowPct ?? '—'}–${keep.intervalHighPct ?? '—'}%`} against a ${keep.obstaclePct}% obstacle.`,
        'The position is open, so someone is standing behind a promise the record does not yet support. The engine will not withdraw it: a guarantee is authority, and withdrawing authority is a human act.',
        'Choose: raise the stake with a repair, move the guarantee down the tier ladder, or withdraw it and restate the terms.',
      ].join(' '),
      options: [
        ['Open a repair before the due date', 'Prices the gap in acts rather than in confidence.', 'A repair with no owner is a second undated promise.'],
        ['Move to a cheaper tier (structural)', 'Separates the guarantee from the person (Grossman–Hart).', 'Requires the right holder to actually cede the right, not just agree to.'],
        ['Withdraw the guarantee', 'Honest when the class cannot carry the ask.', 'The underlying work still needs a credible answer.'],
      ],
      reviewOn,
      rationale: `RULE-RCL-03: open ${position.tier} guarantee on ${position.actClass} priced at ${keep.obstaclePct}% against the record; one governed decision per week.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    addLink(draft, ctx, 'decision', decision.id, 'person', position.personId, 'decides', REPUTATION_RULE_IDS.guarantee,
      'The guarantee decision decides what the ledger priced; the position itself is not changed by the engine.');
    for (const targetId of ancestorsAbove(draft, position.personId, ctx.now)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', targetId, 'rolls-up-to', REPUTATION_RULE_IDS.guarantee,
        `An at-risk ${position.actClass} guarantee rolls up to this span.`);
    }
    addMarker(draft, ctx, {
      id,
      kind: 'guarantee',
      key: `${position.id}|${wk}`,
      personId: position.personId,
      actClass: position.actClass,
      positionId: position.id,
      decisionId: decision.id,
      weekKey: wk,
      note: `Open ${tier.label.toLowerCase()} guarantee on ${position.actClass} is not solvent; one governed decision opened.`,
    });
    opened += 1;
    note(ctx, out, REPUTATION_RULE_IDS.guarantee, 'created', 'decision', decision.id,
      `At-risk guarantee (${position.actClass}, ${tier.key}) opened for a human decision.`);
  }
  return opened;
}

/* ------------------------------------------------- RULE-RCL-04: repair */

/**
 * A repair is a promise a person made about themselves. When its date passes,
 * the engine reads the acts the person actually banked SINCE the repair opened
 * (never a self-report) and either closes the repair as kept or opens one
 * governed decision. Closing a repair as kept does NOT close the human's
 * decision: the human owns the finding, the ledger only reports the count.
 */
function repairRule(draft, ctx, out, conv) {
  const positions = Array.isArray(draft.reputationPositions) ? draft.reputationPositions : [];
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), 14);
  let opened = 0;
  let closed = 0;
  for (const position of positions) {
    if (opened >= REPUTATION_LIMITS.repairsPerScan) break;
    if (!position || position.status !== 'open' || position.kind !== 'repair') continue;
    if (!position.dueOn || position.dueOn >= dayKey(ctx.now)) continue;
    const id = markerId('repair', `${position.id}|${wk}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const harvest = harvestActs(draft, { now: ctx.now, conventions: conv });
    const banked = harvest.acts.filter((act) => act.personId === position.personId
      && act.actClass === position.actClass
      && act.status === 'kept'
      && act.on >= position.openedOn);
    const target = Math.max(1, Number(position.askActs) || 1);
    if (banked.length >= target) {
      position.status = 'kept';
      position.outcome = 'kept';
      position.closedOn = dayKey(ctx.now);
      addMarker(draft, ctx, {
        id,
        kind: 'repair-kept',
        key: `${position.id}|${wk}`,
        personId: position.personId,
        actClass: position.actClass,
        positionId: position.id,
        weekKey: wk,
        note: `Repair banked ${banked.length} of ${target} declared act(s) and closed as kept. The human decision stays open.`,
      });
      closed += 1;
      note(ctx, out, REPUTATION_RULE_IDS.repair, 'closed', 'person', position.personId,
        `Repair on ${position.actClass} met its declared ${target} act(s); recorded as kept.`);
      continue;
    }
    const decision = decisionRecord(ctx, {
      title: `Repair · ${position.actClass} · ${position.dueOn} · week of ${wk}`,
      question: [
        `A repair on the ${position.actClass} class was due ${position.dueOn} and declared ${target} kept act(s).`,
        `The record shows ${banked.length} kept act(s) of that class dated on or after ${position.openedOn}.`,
        'A repair is the only channel through which a dissolved stake is rebuilt. Decide whether the target was wrong, the acts were real but unrecorded, or the repair should be restated with a date it can actually meet.',
      ].join(' '),
      options: [
        ['Restate the repair with a reachable target', 'The declared count was the error, not the effort.', 'A repair that keeps moving stops being a costly signal.'],
        ['Record the acts that exist but were never dated', 'Only where a real record backs them — a reconstructed act is not an act.', 'This ledger will not accept an undated claim as an act, and the module says so.'],
        ['Withdraw the repair and move the guarantee to structural', 'Accepts that this class will not become solvent on this record.', 'Costs a real allocation of rights or money.'],
      ],
      reviewOn,
      rationale: `RULE-RCL-04: repair due ${position.dueOn} banked ${banked.length}/${target}; opened for a human decision.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    for (const targetId of ancestorsAbove(draft, position.personId, ctx.now)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', targetId, 'rolls-up-to', REPUTATION_RULE_IDS.repair,
        `A missed ${position.actClass} repair rolls up to this span.`);
    }
    addMarker(draft, ctx, {
      id,
      kind: 'repair-missed',
      key: `${position.id}|${wk}`,
      personId: position.personId,
      actClass: position.actClass,
      positionId: position.id,
      decisionId: decision.id,
      weekKey: wk,
      note: `Repair banked ${banked.length}/${target}; one governed decision opened.`,
    });
    opened += 1;
    note(ctx, out, REPUTATION_RULE_IDS.repair, 'created', 'decision', decision.id,
      `Missed repair on ${position.actClass} (${banked.length}/${target}); one governed decision opened.`);
  }
  return { opened, closed };
}

/* -------------------------------------------------- RULE-RCL-05: grade */

/**
 * THE LEDGER GRADES ITSELF.
 *
 * A guarantee may be tagged with the record whose outcome decides it: a
 * prospective contract id, an escalation id, a robust plan id. When that source
 * settles, the guarantee is graded exactly ONCE against the claim it made at
 * open time, and the platform's own error is printed beside every other grade in
 * the workspace.
 *
 * The declared claim is `p = the cell's interval low end at open time` — the
 * conservative end, never the point estimate — and the outcome is binary. The
 * error is the squared difference: the ledger's own Brier component. No skill
 * score is printed until five guarantees have been graded, because a Brier score
 * over three calls is decoration.
 */
function gradeRule(draft, ctx, out, conv) {
  const positions = Array.isArray(draft.reputationPositions) ? draft.reputationPositions : [];
  const wk = weekKey(ctx.now);
  let graded = 0;
  for (const position of positions) {
    if (graded >= REPUTATION_LIMITS.guaranteesPerScan) break;
    if (!position || position.kind !== 'guarantee') continue;
    if (position.status !== 'open') continue;
    if (position.grade && Number.isFinite(Number(position.grade.error))) continue;
    const sourceId = position.sourceId;
    if (!sourceId) continue;
    const outcome = resolvePositionOutcome(draft, position.actClass, sourceId);
    if (!outcome) continue;
    const id = markerId('grade', `${position.id}|${wk}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    // ADR-0101 defect repair: `Number(null)` is 0, not NaN, so `Number.isFinite`
    // accepted a NULL claim and graded it as an 0% claim — writing a number the
    // leader never made, after the outcome was known. The guard must test the
    // value, not its coercion.
    const claim = position.claimP === null || position.claimP === undefined || position.claimP === ''
      ? null
      : (Number.isFinite(Number(position.claimP)) ? Number(position.claimP) : null);
    if (claim === null) {
      // No declared claim at open time means no way to grade honestly. Say so
      // once, and leave the position alone rather than inventing a claim.
      addMarker(draft, ctx, {
        id,
        kind: 'grade-refused',
        key: `${position.id}|${wk}`,
        personId: position.personId,
        actClass: position.actClass,
        positionId: position.id,
        weekKey: wk,
        note: 'No claimP was declared when this guarantee opened; it cannot be graded after the fact without hindsight.',
      });
      note(ctx, out, REPUTATION_RULE_IDS.grade, 'refused', 'person', position.personId,
        'A guarantee without a frozen claim was not graded — a claim written after the outcome is not a claim.');
      continue;
    }
    const y = outcome === 'kept' ? 1 : 0;
    const error = Math.round((claim - y) * (claim - y) * 1e6) / 1e6;
    position.grade = {
      y,
      claimP: claim,
      error,
      gradedOn: dayKey(ctx.now),
      sourceOutcome: outcome,
      engineVersion: 'reputational-capital-grader-2026.11-v1',
    };
    position.status = 'kept';
    position.outcome = outcome;
    position.closedOn = dayKey(ctx.now);
    addMarker(draft, ctx, {
      id,
      kind: 'graded',
      key: `${position.id}|${wk}`,
      personId: position.personId,
      actClass: position.actClass,
      positionId: position.id,
      weekKey: wk,
      note: `Guarantee graded once: claim ${claim.toFixed(3)}, outcome ${outcome}, error ${error.toFixed(4)}.`,
    });
    graded += 1;
    note(ctx, out, REPUTATION_RULE_IDS.grade, 'graded', 'person', position.personId,
      `Guarantee graded once against its frozen claim (error ${error.toFixed(4)}).`);
  }
  return graded;
}

function resolvePositionOutcome(draft, actClass, sourceId) {
  if (!sourceId) return null;
  // ADR-0101 defect repair: a Brier grade is a SEPARATE append-only record in
  // `prospectiveGrades`, not a `grade` field on the contract. Reading the frozen
  // contract for it found nothing, so a calibration guarantee could never settle.
  if (actClass === 'calibration') {
    const contract = (draft.prospectiveContracts || []).find((r) => r && r.id === sourceId);
    if (!contract) return null;
    const grade = (draft.prospectiveGrades || []).find((g) => g && g.contractId === sourceId);
    if (!grade) return null;
    const threshold = Number(contract.thresholdPct);
    const probability = Number(contract.probabilityPct);
    if (!Number.isFinite(threshold) || !Number.isFinite(probability)) return null;
    // The frozen contract said "I believe P(reached) is at least `threshold`". The
    // guarantee was KEPT when that belief was right, whatever the outcome was.
    const claimedReached = probability >= threshold;
    const outcome = typeof grade.outcome === 'string' ? grade.outcome : null;
    const reached = Number(grade.reachedN) >= Number(grade.thresholdN ?? grade.observedN);
    if (outcome === 'reached') return claimedReached ? 'kept' : 'breached';
    if (outcome === 'missed') return claimedReached ? 'breached' : 'kept';
    if (grade.y === 1 || grade.y === 0) return (claimedReached ? grade.y === 1 : grade.y === 0) ? 'kept' : 'breached';
    return null;
  }
  if (actClass === 'delivery') {
    const row = (draft.delegations || []).find((r) => r && r.id === sourceId);
    if (!row || (row.status !== 'done' && row.status !== 'returned')) return null;
    const closedOn = row.completedOn || row.returnedOn;
    return row.dueOn && closedOn > row.dueOn ? 'breached' : 'kept';
  }
  if (actClass === 'custody') {
    const row = (draft.mandates || []).find((r) => r && r.id === sourceId);
    if (!row) return null;
    if (row.status === 'verified') return 'kept';
    if (row.status === 'breached') return 'breached';
    return null;
  }
  if (actClass === 'stewardship') {
    const row = (draft.escalationRecords || []).find((r) => r && r.id === sourceId);
    if (!row) return null;
    if (row.absorbedBy === 'self' || row.absorbed === true) return 'kept';
    if (row.settledOn && row.absorbed === false) return 'breached';
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------- rule */

export function reputationalCapitalRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === REPUTATION_EVENTS.SCAN;
  const own = event.type.startsWith(REPUTATION_TRIGGER_PREFIX);
  // ADR-0101 (defect repair): the ledger's FACTS are produced by other modules —
  // a delegation returning, an authority contract being verified, a bet being
  // graded, a case being resolved. Gating only on `reputation.*` meant a source
  // settling never reached the spine, so a guarantee could only ever be graded by
  // a human pressing Scan. The rule now also runs on the declared source events,
  // which is the whole point of a shared propagation spine: the module that owns
  // the outcome writes it once and every reader sees it in the same transaction.
  const sourceSettled = REPUTATION_ACT_EVENTS.includes(event.type);
  if (!explicit && !own && !sourceSettled) return [];
  const conv = reputationConventions(ctx.settings || draft.settings || {});
  if (!explicit && conv.reputationAutoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const out = [];

  recordRule(draft, runCtx, out, conv);
  breachRule(draft, runCtx, out, conv);
  guaranteeRule(draft, runCtx, out, conv);
  const repairs = repairRule(draft, runCtx, out, conv);
  gradeRule(draft, runCtx, out, conv);

  if (explicit) {
    note(runCtx, out, REPUTATION_RULE_IDS.act, 'scanned', 'workspace', 'reputation',
      `Explicit scan: ${repairs.closed} repair(s) closed as kept, ${repairs.opened} repair decision(s) opened.`);
  }
  return out;
}

// Re-exported so an action can price a single cell through the same engine the
// rules and the screen use — one implementation, three callers.
export { cellReading, obstaclePct, ACT_CLASS_KEYS };
