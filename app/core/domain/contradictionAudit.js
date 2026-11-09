/**
 * app/core/domain/contradictionAudit.js — the Cross-Line Contradiction Audit
 * (ADR-0144, Schema v121, `#/contradiction`).
 *
 * THE DUTY. Session 194 built the instrument that settles which of two lines'
 * dated demands goes first — an adjudication, for one person, for one window.
 * This module answers the question a chief has to answer BEFORE the quarter is
 * planned, and which no adjudication can answer:
 *
 *   "Two lines of my matrix are each chartered to optimise something. Do their
 *    charters, as written, make one another permanently unachievable for the
 *    people who sit on both — and is the precedence we just arbitrated going to
 *    be re-fought every quarter for the rest of the year?"
 *
 * A single-chain workspace cannot ask it: with one manager there is one charter.
 * The contradiction is a property of the matrix. So this module is INERT in a
 * single-chain workspace — it returns zero findings and says why, rather than
 * inventing a pairing.
 *
 * WHAT IT READS, AND WHAT IT NEVER INVENTS
 * ----------------------------------------
 *  - the live matrix (`buildMatrix`): which people sit on which lines, today;
 *  - the declared charters (`lineMandates`): this line, this objective, this
 *    lever, this direction, this share of the scorecard, this claim on one
 *    existing envelope;
 *  - the existing goal records (for a charter's objective title) and the
 *    existing budget envelopes (for the ceiling a claim is measured against);
 *  - the recorded rulings (`contradictionReviews`), to derive each finding's
 *    state.
 *
 * It invents nothing: a lever outside the declared taxonomy never reaches the
 * engine (the normalizer refuses it), a missing weight is `null` and refuses the
 * total instead of reading as zero, a missing utilisation target refuses the
 * queueing test, and a person whose lines are partly outside this seat is
 * COUNTED as out of scope rather than silently summed over the part it can see.
 *
 * THE FIVE FAMILIES (see the registry for the literature behind each)
 * -------------------------------------------------------------------
 *  lever-opposition          same lever, opposite directions, shared people.
 *  coupled-trade-off         two coupled levers pulling against each other;
 *                            `incompatible` ONLY where the queueing law gives an
 *                            arithmetic test, `tension` everywhere else.
 *  incentive-oversubscription a person whose lines' declared weights sum > 100%.
 *  incentive-opposition       a person paid, at material weight, to do both.
 *  envelope-overclaim         lines claiming more than 100% of one envelope.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import {
  CONTRADICTION_COUPLINGS,
  CONTRADICTION_FULL_BP,
  CONTRADICTION_LEVERS,
  CONTRADICTION_LIMITS,
  CONTRADICTION_METHOD,
  CONTRADICTION_RELATIONS,
  CONTRADICTION_SEVERITY_RANK,
  CONTRADICTION_STATES,
  contradictionCoupling,
  contradictionFinding,
  contradictionFindingLabel,
  contradictionFindingRank,
  contradictionLeverLabel,
} from './contradictionRegistry.js';
import { normalizeContradictionSettings } from './contradictionSchema.js';

const MAX_COMPARED_PAIRS = 400;

/* ------------------------------------------------------------- arithmetic */

/**
 * The Kingman / VUT wait-to-processing multiplier at a declared utilisation.
 *
 * Returns the EXACT ratio as numerator/denominator plus a printed decimal, so a
 * reader can check the arithmetic by hand. `null` when the target cannot support
 * the claim (no target, or τ ≥ 100 where the ratio is unbounded) — the caller
 * refuses with the reason rather than returning a very large number that would
 * read as a measurement.
 */
export function contradictionQueueMultiplier(utilisationPct) {
  const tau = Number(utilisationPct);
  if (!Number.isInteger(tau) || tau <= 0 || tau >= 100) return null;
  const numerator = tau;
  const denominator = 100 - tau;
  const value = Math.round((numerator / denominator) * 100) / 100;
  return {
    numerator,
    denominator,
    value,
    display: `${numerator}/${denominator} = ${value.toFixed(2)}×`,
    text: `At ${tau}% utilisation, expected wait is ${value.toFixed(2)}× processing time (τ/(100−τ) = ${numerator}/${denominator}).`,
  };
}

/**
 * A stable, order-independent key for a finding. Two charters named in the other
 * order produce the SAME key, so a ruling recorded on one render is found on the
 * next.
 */
function pairKey(kind, lineAId, lineBId, aToken, bToken) {
  const [first, second] = lineAId <= lineBId ? [lineAId, lineBId] : [lineBId, lineAId];
  const [ta, tb] = lineAId <= lineBId ? [aToken, bToken] : [bToken, aToken];
  return `${kind}|${first}~${second}~${ta}~${tb}`;
}

/** Deterministic latest-first ordering for reviews of one finding. */
function reviewOrder(a, b) {
  if (a.decidedOn !== b.decidedOn) return a.decidedOn < b.decidedOn ? 1 : -1;
  const ac = a.createdAt || '';
  const bc = b.createdAt || '';
  if (ac !== bc) return ac < bc ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/* --------------------------------------------------------------- building */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Build the audit. The seat argument is optional: without it the engine resolves
 * the active seat exactly as the write path does, so a read and a write can
 * never disagree about which span is being audited.
 */
export function buildContradictionAudit(state, { now = new Date(), settings = null, seat = null } = {}) {
  const effective = settings || state?.settings || null;
  const conv = normalizeContradictionSettings(effective || {});
  const today = dayKey(now);
  const matrix = buildMatrix(state, { now, settings: effective });

  let resolvedSeat = seat;
  if (!resolvedSeat) {
    const built = buildSeats(state, { now, settings: effective, lineScope: matrixLineScope(matrix) });
    resolvedSeat = activeSeat(built);
  }
  const fullAccess = Boolean(resolvedSeat?.fullAccess);
  const scopeIds = new Set();
  if (!fullAccess) {
    for (const source of [resolvedSeat?.scope, resolvedSeat?.lineScope]) {
      if (source && typeof source.forEach === 'function') source.forEach((id) => scopeIds.add(id));
    }
    if (resolvedSeat?.id) scopeIds.add(resolvedSeat.id);
  }

  const mandates = Array.isArray(state?.lineMandates) ? state.lineMandates : [];
  const goals = Array.isArray(state?.goals) ? state.goals : [];
  const budgets = Array.isArray(state?.budgets) ? state.budgets : [];
  const reviews = Array.isArray(state?.contradictionReviews) ? state.contradictionReviews : [];

  const goalById = new Map(goals.filter(Boolean).map((g) => [g.id, g]));
  const budgetById = new Map(budgets.filter(Boolean).map((b) => [b.id, b]));

  const refusals = {
    unknownLine: [],
    danglingObjective: [],
    danglingEnvelope: [],
    expired: [],
    outOfScope: [],
    unreadableWeight: [],
    missingClaim: [],
    pairsDeferred: 0,
    linesOutOfScope: [],
  };

  /** A charter is live today, in scope, on a line this workspace actually has. */
  const inWindow = (m) => m.status !== 'withdrawn'
    && (!m.effectiveFrom || m.effectiveFrom <= today)
    && (!m.effectiveTo || m.effectiveTo >= today);

  const active = [];
  for (const m of mandates) {
    if (!m || !m.id) continue;
    if (!inWindow(m)) { if (m.status !== 'withdrawn') refusals.expired.push(m); continue; }
    if (!matrix.nodes.has(m.lineManagerId)) { refusals.unknownLine.push(m); continue; }
    if (!fullAccess && !scopeIds.has(m.lineManagerId)) { refusals.outOfScope.push(m); continue; }
    if (m.objectiveId && !goalById.has(m.objectiveId)) {
      // The pointer is kept and the finding still evaluated — the LEVER is the
      // declared fact. The dangling objective is printed so a reader knows the
      // charter's stated objective has been deleted rather than read.
      refusals.danglingObjective.push(m);
    }
    if (m.envelopeId && !budgetById.has(m.envelopeId)) {
      refusals.danglingEnvelope.push(m);
    }
    active.push(m);
  }

  /** Per-line roll-up of the declared charters. */
  const lineMap = new Map();
  for (const m of active) {
    if (!lineMap.has(m.lineManagerId)) {
      const node = matrix.nodes.get(m.lineManagerId);
      lineMap.set(m.lineManagerId, {
        managerId: m.lineManagerId,
        managerName: node?.name || m.lineManagerId,
        altitude: node?.altitude || null,
        mandateIds: [],
        weightBp: 0,
        weightDeclared: true,
        objectiveIds: new Set(),
        envelopeClaims: [],
      });
    }
    const line = lineMap.get(m.lineManagerId);
    line.mandateIds.push(m.id);
    if (Number.isInteger(m.weightBp)) line.weightBp += m.weightBp;
    else line.weightDeclared = false;
    if (m.objectiveId) line.objectiveIds.add(m.objectiveId);
    if (m.envelopeId && Number.isInteger(m.envelopeClaimBp)) line.envelopeClaims.push({ envelopeId: m.envelopeId, claimBp: m.envelopeClaimBp });
  }
  const lines = [...lineMap.values()]
    .map((line) => ({
      ...line,
      objectiveIds: [...line.objectiveIds],
      weightBp: line.weightDeclared ? line.weightBp : null,
      weightState: !line.weightDeclared
        ? 'undeclared'
        : line.weightBp > CONTRADICTION_FULL_BP ? 'over' : 'within',
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
  const lineIds = lines.map((l) => l.managerId);
  const lineIdSet = new Set(lineIds);

  /** Active lines per person, restricted to the audited lines. */
  const peopleWithLines = [];
  for (const [personId, personLines] of matrix.linesByPerson.entries()) {
    const live = personLines.filter((l) => l.active !== false && lineIdSet.has(l.managerId));
    if (!live.length) continue;
    const outside = personLines.filter((l) => l.active !== false && !lineIdSet.has(l.managerId));
    if (outside.length) {
      // A person is only summed over lines the seat can see. Their total weight
      // would be a partial sum presented as a whole, which is exactly the
      // display-vs-stored failure the mandate forbids.
      refusals.linesOutOfScope.push({ personId, outsideLineN: outside.length });
      continue;
    }
    peopleWithLines.push({ personId, lines: live });
  }
  const multiLinePeople = peopleWithLines.filter((p) => new Set(p.lines.map((l) => l.managerId)).size >= 2);

  const findings = [];
  const pushFinding = (finding) => {
    const known = contradictionFinding(finding.kind);
    findings.push({
      severity: finding.severity || known?.severity || 'tension',
      state: CONTRADICTION_STATES.undecided,
      review: null,
      ...finding,
    });
  };

  /* ------------------------------------------------ 1. line-pair families */

  const pairs = [];
  for (let i = 0; i < lineIds.length; i += 1) {
    for (let j = i + 1; j < lineIds.length; j += 1) pairs.push([lineIds[i], lineIds[j]]);
  }
  const comparedPairs = pairs.slice(0, MAX_COMPARED_PAIRS);
  refusals.pairsDeferred = Math.max(0, pairs.length - comparedPairs.length);

  /** Who sits on BOTH of two lines — the matrix catch, derived, never stored. */
  const sharedPeopleBetween = (a, b) => {
    const out = [];
    for (const entry of matrix.linesByPerson.entries()) {
      const [personId, personLines] = entry;
      const live = personLines.filter((l) => l.active !== false);
      const managers = new Set(live.map((l) => l.managerId));
      if (managers.has(a) && managers.has(b)) out.push(personId);
    }
    return out.sort();
  };

  const visiblePeople = (ids) => (fullAccess ? ids : ids.filter((pid) => scopeIds.has(pid)));

  for (const [lineAId, lineBId] of comparedPairs) {
    const lineA = lineMap.get(lineAId);
    const lineB = lineMap.get(lineBId);
    if (!lineA || !lineB) continue;
    const mandateA = active.filter((m) => m.lineManagerId === lineAId);
    const mandateB = active.filter((m) => m.lineManagerId === lineBId);
    const shared = sharedPeopleBetween(lineAId, lineBId);
    const sharedN = shared.length;

    for (const mA of mandateA) {
      for (const mB of mandateB) {
        const both = {
          lineAId, lineBId,
          lineAName: lineA.managerName,
          lineBName: lineB.managerName,
          mandateAId: mA.id,
          mandateBId: mB.id,
          objectiveAId: mA.objectiveId,
          objectiveBId: mB.objectiveId,
          objectiveATitle: mA.objectiveId ? (goalById.get(mA.objectiveId)?.title || '') : '',
          objectiveBTitle: mB.objectiveId ? (goalById.get(mB.objectiveId)?.title || '') : '',
          weightABp: mA.weightBp,
          weightBBp: mB.weightBp,
          sharedPersonN: sharedN,
          sharedPersonIds: visiblePeople(shared),
          sharedWithheldN: sharedN - visiblePeople(shared).length,
          leverA: mA.lever,
          leverB: mB.lever,
        };

        /* (a) Same lever, opposite directions — a direct contradiction. */
        if (mA.lever === mB.lever && mA.direction !== mB.direction) {
          pushFinding({
            ...both,
            key: pairKey('lever-opposition', lineAId, lineBId, mA.id, mB.id),
            kind: 'lever-opposition',
            subjectType: 'lines',
            lever: mA.lever,
            leverLabel: contradictionLeverLabel(mA.lever),
            directionA: mA.direction,
            directionB: mB.direction,
            severity: sharedN > 0 ? 'incompatible' : 'isolated',
            headline: `${lineA.managerName} must move ${contradictionLeverLabel(mA.lever)} ${mA.direction === 'increase' ? 'up' : 'down'} while ${lineB.managerName} must move it ${mB.direction === 'increase' ? 'up' : 'down'}.`,
            reason: sharedN > 0
              ? `${sharedN} person(s) sit on both lines, so the same people are measured against two opposite success criteria on one lever. A lever cannot rise and fall at once, so this pair is incompatible for everyone caught between it.`
              : `No person sits on both lines today, so nobody is caught. This is a latent contradiction: declare a shared line tomorrow and it becomes live.`,
          });
          continue;
        }

        /* (b) Coupled levers pulling against each other. */
        const coupling = contradictionCoupling(mA.lever, mB.lever);
        if (!coupling) continue;
        const aIsCouplingA = coupling.a === mA.lever;
        const expectedA = aIsCouplingA ? coupling.aDirection : coupling.bDirection;
        const expectedB = aIsCouplingA ? coupling.bDirection : coupling.aDirection;
        if (mA.direction !== expectedA || mB.direction !== expectedB) continue;

        const utilisationMandate = mA.lever === 'utilisation' ? mA : mB.lever === 'utilisation' ? mB : null;
        const couplingBase = {
          ...both,
          key: pairKey('coupled-trade-off', lineAId, lineBId, mA.id, mB.id),
          kind: 'coupled-trade-off',
          subjectType: 'lines',
          lever: coupling.key,
          leverLabel: `${contradictionLeverLabel(coupling.a)} ⇄ ${contradictionLeverLabel(coupling.b)}`,
          directionA: mA.direction,
          directionB: mB.direction,
          law: coupling.law,
          why: coupling.why,
          provable: Boolean(coupling.provable),
        };

        if (coupling.provable === 'queueing') {
          const tau = utilisationMandate?.targetValue ?? null;
          if (tau === null) {
            pushFinding({
              ...couplingBase,
              severity: 'insufficient',
              headline: `${lineA.managerName} and ${lineB.managerName} pull utilisation and lead time against each other; the utilisation target was not declared.`,
              reason: `The queueing test needs a declared utilisation target in whole percent. ${utilisationMandate?.lineManagerId || 'The line'} declared none, so no multiplier is computed and no verdict is offered — the missing figure is named rather than assumed at a favourable value.`,
              missingFigure: 'utilisation target (whole percent)',
            });
            continue;
          }
          const multiplier = contradictionQueueMultiplier(tau);
          if (!multiplier) {
            pushFinding({
              ...couplingBase,
              severity: 'insufficient',
              utilisationTargetPct: tau,
              headline: `${lineA.managerName} and ${lineB.managerName} declare a utilisation target of ${tau}%, which cannot be measured.`,
              reason: 'A utilisation target of 0% or 100% and above makes the wait multiplier unbounded. The declared figure is printed and no multiplier is offered, because "unbounded" is not a number a leader should act on.',
              missingFigure: 'a utilisation target between 1 and 99',
            });
            continue;
          }
          const pastKnee = tau >= conv.ctrUtilisationCeiling;
          pushFinding({
            ...couplingBase,
            severity: pastKnee
              ? (sharedN > 0 ? 'incompatible' : 'isolated')
              : 'tension',
            utilisationTargetPct: tau,
            utilisationCeilingPct: conv.ctrUtilisationCeiling,
            queueMultiplier: multiplier.value,
            queueMultiplierDisplay: multiplier.display,
            headline: `${lineA.managerName} must push utilisation to ${tau}% while ${lineB.managerName} must pull lead time down — the queueing law puts wait at ${multiplier.display} of processing time.`,
            reason: pastKnee
              ? `At ${tau}% utilisation the declared ceiling of ${conv.ctrUtilisationCeiling}% is passed, and τ/(1−τ) is already ${multiplier.value.toFixed(2)}×. Lead time is not a separate dial: the line asked to shorten it is spending the same buffer the other line is being paid to remove. ${sharedN > 0 ? `${sharedN} person(s) sit on both lines and cannot satisfy both.` : 'No person sits on both lines today, so the contradiction is latent rather than live.'}`
              : `At ${tau}% utilisation the queueing multiplier is ${multiplier.value.toFixed(2)}×, below the declared knee of ${conv.ctrUtilisationCeiling}%. The trade-off is real but the pair is not yet arithmetically impossible; it is printed as tension, not as a verdict.`,
          });
          continue;
        }

        /* Every other coupling is a declared trade-off, never a proof. */
        pushFinding({
          ...couplingBase,
          severity: sharedN > 0 ? 'tension' : 'isolated',
          headline: `${lineA.managerName} and ${lineB.managerName} pull coupled levers against each other.`,
          reason: sharedN > 0
            ? `${sharedN} person(s) sit on both lines. ${coupling.why} This module does not claim impossibility here — a deliberate process change moves the frontier — so the finding is printed as tension.`
            : `No person sits on both lines today. The coupling exists in the design but catches nobody; it is counted as isolated, never as a contradiction.`,
        });
      }
    }
  }

  /* ------------------------------------------- 2. incentive weight family */

  const materialityBp = conv.ctrMaterialityBp;
  for (const entry of multiLinePeople) {
    const lineIdsForPerson = [...new Set(entry.lines.map((l) => l.managerId))].sort();
    const mandatesForPerson = active.filter((m) => lineIdsForPerson.includes(m.lineManagerId));
    const weightParts = mandatesForPerson.map((m) => m.weightBp);
    const missingWeight = weightParts.some((w) => !Number.isInteger(w));
    const weightSumBp = missingWeight ? null : weightParts.reduce((sum, w) => sum + w, 0);
    const personNode = matrix.nodes.get(entry.personId);
    const personName = personNode?.name || entry.personId;

    if (weightSumBp !== null && weightSumBp > CONTRADICTION_FULL_BP) {
      pushFinding({
        key: `incentive-oversubscription|${entry.personId}`,
        kind: 'incentive-oversubscription',
        subjectType: 'person',
        personId: entry.personId,
        personName,
        lineAId: null,
        lineBId: null,
        lineIds: lineIdsForPerson,
        mandateIds: mandatesForPerson.map((m) => m.id),
        weightSumBp,
        weightPartsBp: weightParts,
        severity: 'incompatible',
        headline: `${personName} carries ${weightSumBp} basis points of declared incentive weight across ${lineIdsForPerson.length} lines.`,
        reason: `The scorecards of ${lineIdsForPerson.length} lines add up to ${(weightSumBp / 100).toFixed(2)}% of one person. Above 100% at least one line's payout is unachievable by construction, however well the person performs. The exact integer sum is printed so the arithmetic is checkable.`,
      });
    } else if (weightSumBp === null) {
      refusals.unreadableWeight.push({ personId: entry.personId, personName });
    }

    /* Paid, at material weight, to do both. */
    const byLever = new Map();
    for (const m of mandatesForPerson) {
      if (!byLever.has(m.lever)) byLever.set(m.lever, []);
      byLever.get(m.lever).push(m);
    }
    for (const [lever, list] of byLever.entries()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const mA = list[i];
          const mB = list[j];
          if (mA.direction === mB.direction) continue;
          if (mA.lineManagerId === mB.lineManagerId) continue;
          const combinedBp = Number.isInteger(mA.weightBp) && Number.isInteger(mB.weightBp)
            ? mA.weightBp + mB.weightBp
            : null;
          const [first, second] = mA.id <= mB.id ? [mA, mB] : [mB, mA];
          const base = {
            key: `incentive-opposition|${entry.personId}~${lever}~${first.id}~${second.id}`,
            kind: 'incentive-opposition',
            subjectType: 'person',
            personId: entry.personId,
            personName,
            lineAId: first.lineManagerId,
            lineBId: second.lineManagerId,
            lineAName: matrix.nodes.get(first.lineManagerId)?.name || first.lineManagerId,
            lineBName: matrix.nodes.get(second.lineManagerId)?.name || second.lineManagerId,
            mandateAId: first.id,
            mandateBId: second.id,
            lever,
            leverLabel: contradictionLeverLabel(lever),
            directionA: first.direction,
            directionB: second.direction,
            weightABp: first.weightBp,
            weightBBp: second.weightBp,
            weightSumBp: combinedBp,
            materialityBp,
            sharedPersonN: 1,
            sharedPersonIds: [entry.personId],
            sharedWithheldN: 0,
          };
          if (combinedBp === null) {
            pushFinding({
              ...base,
              severity: 'insufficient',
              headline: `${personName} is chartered both ways on ${contradictionLeverLabel(lever)}, but a weight was not declared.`,
              reason: 'One of the two charters carries no declared weight, so the combined incentive is unknown. The weight is printed as not declared rather than read as zero.',
              missingFigure: 'incentive weight (basis points)',
            });
            continue;
          }
          if (combinedBp < materialityBp) continue;
          pushFinding({
            ...base,
            severity: 'incompatible',
            headline: `${personName} is paid ${(combinedBp / 100).toFixed(2)}% to move ${contradictionLeverLabel(lever)} both up and down.`,
            reason: `Two lines pay one person to move the same lever in opposite directions, at a combined declared weight of ${combinedBp} bp, above the declared materiality floor of ${materialityBp} bp. Kerr’s point: the scorecard, not the person, is what has been designed to fail.`,
          });
        }
      }
    }
  }

  /* --------------------------------------------- 3. envelope over-claim */

  const envelopeClaims = new Map();
  for (const m of active) {
    if (!m.envelopeId) continue;
    const budget = budgetById.get(m.envelopeId);
    if (!budget) continue;
    if (!envelopeClaims.has(m.envelopeId)) {
      envelopeClaims.set(m.envelopeId, {
        envelopeId: m.envelopeId,
        envelopeName: budget.name || m.envelopeId,
        currency: budget.currency || 'USD',
        limit: Number.isFinite(Number(budget.limit)) && Number(budget.limit) > 0 ? Number(budget.limit) : null,
        status: budget.status || 'active',
        claimants: [],
      });
    }
    const bucket = envelopeClaims.get(m.envelopeId);
    bucket.claimants.push({ mandateId: m.id, lineManagerId: m.lineManagerId, claimBp: m.envelopeClaimBp });
    if (!Number.isInteger(m.envelopeClaimBp)) refusals.missingClaim.push({ mandateId: m.id, envelopeId: m.envelopeId });
  }

  for (const bucket of envelopeClaims.values()) {
    const missing = bucket.claimants.filter((c) => !Number.isInteger(c.claimBp));
    const claimSumBp = missing.length ? null : bucket.claimants.reduce((sum, c) => sum + c.claimBp, 0);
    const claimants = [...bucket.claimants].sort((a, b) => (b.claimBp ?? -1) - (a.claimBp ?? -1) || String(a.mandateId).localeCompare(String(b.mandateId)));
    const lineIdsForEnvelope = [...new Set(claimants.map((c) => c.lineManagerId))].sort();
    // EVERY person who sits on two or more of the claiming lines — not just the
    // first pair. A three-way claim that catches somebody is not reported as
    // catching nobody because its first two lines happen to share no one.
    const envelopeShared = new Set();
    for (const [personId, personLines] of matrix.linesByPerson.entries()) {
      const on = new Set(personLines.filter((l) => l.active !== false).map((l) => l.managerId));
      if (lineIdsForEnvelope.filter((id) => on.has(id)).length >= 2) envelopeShared.add(personId);
    }
    const sharedN = envelopeShared.size;
    const base = {
      key: `envelope-overclaim|${bucket.envelopeId}`,
      kind: 'envelope-overclaim',
      subjectType: 'envelope',
      envelopeId: bucket.envelopeId,
      envelopeName: bucket.envelopeName,
      envelopeCurrency: bucket.currency,
      envelopeLimit: bucket.limit,
      envelopeStatus: bucket.status,
      lineAId: lineIdsForEnvelope[0] || null,
      lineBId: lineIdsForEnvelope[1] || null,
      lineAName: lineIdsForEnvelope[0] ? (matrix.nodes.get(lineIdsForEnvelope[0])?.name || lineIdsForEnvelope[0]) : '',
      lineBName: lineIdsForEnvelope[1] ? (matrix.nodes.get(lineIdsForEnvelope[1])?.name || lineIdsForEnvelope[1]) : '',
      claimantN: claimants.length,
      claimantLineIds: lineIdsForEnvelope,
      claimPartsBp: claimants.map((c) => c.claimBp),
      sharedPersonN: sharedN,
    };
    if (claimSumBp === null) {
      pushFinding({
        ...base,
        severity: 'insufficient',
        claimSumBp: null,
        headline: `Lines claim one envelope (${bucket.envelopeName}) but a claim was not declared.`,
        reason: `${missing.length} claimant(s) declared no share. The total is unknown, so no over-claim is asserted — the missing claims are printed instead of being read as zero.`,
        missingFigure: 'envelope claim (basis points)',
      });
      continue;
    }
    if (claimSumBp > CONTRADICTION_FULL_BP) {
      pushFinding({
        ...base,
        claimSumBp,
        severity: 'incompatible',
        headline: `${claimants.length} lines claim ${(claimSumBp / 100).toFixed(2)}% of one envelope (${bucket.envelopeName}).`,
        reason: `Declared claims sum to ${claimSumBp} bp against a ceiling of ${CONTRADICTION_FULL_BP} bp, so at least ${(claimSumBp - CONTRADICTION_FULL_BP)} bp of the plan cannot be funded from the envelope it names. The over-claim is exact integer arithmetic against the envelope's own recorded ceiling.`,
      });
    }
  }

  /* ------------------------------------------------------- 4. review join */

  const reviewsByKey = new Map();
  for (const review of reviews) {
    if (!review || !review.findingKey) continue;
    if (!reviewsByKey.has(review.findingKey)) reviewsByKey.set(review.findingKey, []);
    reviewsByKey.get(review.findingKey).push(review);
  }
  for (const list of reviewsByKey.values()) list.sort(reviewOrder);

  const findingKeys = new Set(findings.map((f) => f.key));
  let reviewOrphanN = 0;
  for (const key of reviewsByKey.keys()) if (!findingKeys.has(key)) reviewOrphanN += 1;

  for (const finding of findings) {
    const list = reviewsByKey.get(finding.key) || [];
    const latest = list[0] || null;
    if (!latest) {
      finding.state = CONTRADICTION_STATES.undecided;
      finding.review = null;
      finding.attention = finding.severity === 'incompatible';
      continue;
    }
    finding.state = latest.verdict;
    const declaredReviewOn = latest.reviewOn || null;
    const derivedReviewOn = latest.verdict === 'accepted'
      ? addDays(latest.decidedOn, conv.ctrReviewDays)
      : null;
    const reviewOn = declaredReviewOn || derivedReviewOn;
    const daysToReview = reviewOn ? daysBetween(today, reviewOn) : null;
    const overdue = Boolean(reviewOn && reviewOn < today && latest.verdict === 'accepted');
    finding.review = {
      id: latest.id,
      verdict: latest.verdict,
      rationale: latest.rationale,
      decidedOn: latest.decidedOn,
      decidedBySeatId: latest.decidedBySeatId,
      reviewOn,
      reviewOnDeclared: Boolean(declaredReviewOn),
      reviewDerived: !declaredReviewOn && Boolean(derivedReviewOn),
      daysToReview,
      overdue,
      resequenceLineId: latest.resequenceLineId,
      decisionId: latest.decisionId,
      obligationIssued: latest.obligationIssued || [],
      historyN: list.length,
    };
    finding.attention = latest.verdict === 'undecided'
      ? finding.severity === 'incompatible'
      : overdue;
  }

  /* ------------------------------------------------------------- ordering */

  findings.sort((a, b) => {
    const sa = CONTRADICTION_SEVERITY_RANK[a.severity] ?? 9;
    const sb = CONTRADICTION_SEVERITY_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    const ka = contradictionFindingRank(a.kind);
    const kb = contradictionFindingRank(b.kind);
    if (ka !== kb) return ka - kb;
    return a.key < b.key ? -1 : 1;
  });

  /* --------------------------------------------------------------- totals */

  const countWhere = (fn) => findings.filter(fn).length;
  const totals = {
    mandatesN: active.length,
    inactiveN: refusals.expired.length,
    lineN: lines.length,
    objectiveN: new Set(active.map((m) => m.objectiveId).filter(Boolean)).size,
    pairN: pairs.length,
    comparedPairsN: comparedPairs.length,
    findingN: findings.length,
    incompatibleN: countWhere((f) => f.severity === 'incompatible'),
    tensionN: countWhere((f) => f.severity === 'tension'),
    isolatedN: countWhere((f) => f.severity === 'isolated'),
    insufficientN: countWhere((f) => f.severity === 'insufficient'),
    undecidedN: countWhere((f) => f.state === CONTRADICTION_STATES.undecided),
    acceptedN: countWhere((f) => f.state === 'accepted'),
    resequencedN: countWhere((f) => f.state === 'resequenced'),
    withheldN: countWhere((f) => f.state === 'withheld'),
    overdueN: countWhere((f) => f.review?.overdue),
    attentionN: countWhere((f) => f.attention),
    caughtPeopleN: new Set(findings
      .filter((f) => f.severity === 'incompatible')
      .flatMap((f) => f.sharedPersonIds || (f.personId ? [f.personId] : []))).size,
    multiLinePeopleN: multiLinePeople.length,
    weightOverN: countWhere((f) => f.kind === 'incentive-oversubscription'),
    envelopeN: envelopeClaims.size,
    envelopeOverN: countWhere((f) => f.kind === 'envelope-overclaim' && f.severity === 'incompatible'),
    obligationN: findings.reduce((sum, f) => sum + (f.review?.obligationIssued?.length || 0), 0),
    decisionN: new Set(findings.map((f) => f.review?.decisionId).filter(Boolean)).size,
    outOfScopeN: refusals.outOfScope.length + refusals.linesOutOfScope.length,
    refusedMandateN: refusals.unknownLine.length + refusals.danglingEnvelope.length,
    reviewOrphanN,
  };

  /**
   * THREE separate claims, printed separately. Adding up, being reviewed, and
   * matching the rows are different facts (NORTH_STAR, bulletproof mandate).
   */
  const checks = {
    reconciles: totals.incompatibleN + totals.tensionN + totals.isolatedN + totals.insufficientN === totals.findingN,
    reviewed:
      totals.undecidedN + totals.acceptedN + totals.resequencedN + totals.withheldN === totals.findingN,
    rowsMatch: findings.length === totals.findingN,
    weightsExact: findings
      .filter((f) => f.kind === 'incentive-oversubscription')
      .every((f) => (f.weightPartsBp || []).reduce((s, w) => s + w, 0) === f.weightSumBp),
  };

  const boardLimit = CONTRADICTION_LIMITS.boardFindings;

  return {
    engineVersion: state?.contradictionEngineVersion || 'contradiction-audit-2026.11-v1',
    generatedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    today,
    altitude: resolvedSeat?.altitudeKey || null,
    altitudeLabel: resolvedSeat?.label || 'Undeclared operator view',
    rank: resolvedSeat?.rank ?? null,
    seat: resolvedSeat
      ? {
        id: resolvedSeat.id,
        name: resolvedSeat.name,
        label: resolvedSeat.label,
        fullAccess: Boolean(resolvedSeat.fullAccess),
        readOnly: Boolean(resolvedSeat.readOnly),
        scopeN: fullAccess ? null : scopeIds.size,
      }
      : null,
    conventions: conv,
    isMatrix: lines.length >= 2,
    lines,
    mandates: active.slice(0, CONTRADICTION_LIMITS.mandatesMax).map((m) => ({
      id: m.id,
      lineManagerId: m.lineManagerId,
      lineName: matrix.nodes.get(m.lineManagerId)?.name || m.lineManagerId,
      objectiveId: m.objectiveId,
      objectiveTitle: m.objectiveId ? (goalById.get(m.objectiveId)?.title || '') : '',
      objectiveDangling: Boolean(m.objectiveId && !goalById.has(m.objectiveId)),
      lever: m.lever,
      leverLabel: contradictionLeverLabel(m.lever),
      direction: m.direction,
      weightBp: m.weightBp,
      targetValue: m.targetValue,
      envelopeId: m.envelopeId,
      envelopeName: m.envelopeId ? (budgetById.get(m.envelopeId)?.name || '') : '',
      envelopeDangling: Boolean(m.envelopeId && !budgetById.has(m.envelopeId)),
      envelopeClaimBp: m.envelopeClaimBp,
      effectiveFrom: m.effectiveFrom,
      effectiveTo: m.effectiveTo,
      note: m.note,
      declaredOn: m.declaredOn,
    })),
    people: multiLinePeople.map((entry) => {
      const lineIdsForPerson = [...new Set(entry.lines.map((l) => l.managerId))].sort();
      const mandatesForPerson = active.filter((m) => lineIdsForPerson.includes(m.lineManagerId));
      const parts = mandatesForPerson.map((m) => m.weightBp);
      const missing = parts.some((w) => !Number.isInteger(w));
      return {
        personId: entry.personId,
        personName: matrix.nodes.get(entry.personId)?.name || entry.personId,
        lineIds: lineIdsForPerson,
        lineNames: lineIdsForPerson.map((id) => matrix.nodes.get(id)?.name || id),
        weightPartsBp: parts,
        weightSumBp: missing ? null : parts.reduce((s, w) => s + w, 0),
        weightState: missing ? 'undeclared' : parts.reduce((s, w) => s + w, 0) > CONTRADICTION_FULL_BP ? 'over' : 'within',
      };
    }),
    allFindings: findings,
    findings: findings.slice(0, boardLimit),
    findingsDeferredN: Math.max(0, findings.length - boardLimit),
    findingsAllN: findings.length,
    reviews: reviews.slice().sort(reviewOrder).slice(0, CONTRADICTION_LIMITS.reviewsKept),
    totals,
    checks,
    refusals: {
      unknownLine: refusals.unknownLine.map((m) => ({ mandateId: m.id, lineManagerId: m.lineManagerId })),
      danglingObjective: refusals.danglingObjective.map((m) => ({ mandateId: m.id, objectiveId: m.objectiveId })),
      danglingEnvelope: refusals.danglingEnvelope.map((m) => ({ mandateId: m.id, envelopeId: m.envelopeId })),
      expiredN: refusals.expired.length,
      outOfScopeN: refusals.outOfScope.length,
      linesOutOfScope: refusals.linesOutOfScope,
      unreadableWeight: refusals.unreadableWeight,
      missingClaim: refusals.missingClaim,
      pairsDeferredN: refusals.pairsDeferred,
    },
    levers: CONTRADICTION_LEVERS,
    couplings: CONTRADICTION_COUPLINGS,
    method: CONTRADICTION_METHOD,
    relations: CONTRADICTION_RELATIONS,
  };
}

/* ---------------------------------------------------------------- attention */

/**
 * The bounded attention queue. Counts only what a chief must actually look at:
 * an incompatible finding nobody has ruled on, and an accepted one whose review
 * date has passed. An isolated or `tension` finding is information, not a badge.
 */
export function contradictionAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  const report = buildContradictionAudit(state, { now, settings, seat });
  return report.totals.attentionN;
}

/* --------------------------------------------------------------------- csv */

/** Identity-free rows: no person, no line id, no objective title, no reasoning. */
export function contradictionCsvRows(report) {
  const rows = [];
  const summary = {
    row_kind: 'summary',
    scope: 'workspace',
    altitude: report.altitude || '',
    findings_n: report.totals.findingN,
    incompatible_n: report.totals.incompatibleN,
    tension_n: report.totals.tensionN,
    isolated_n: report.totals.isolatedN,
    insufficient_n: report.totals.insufficientN,
    undecided_n: report.totals.undecidedN,
    accepted_n: report.totals.acceptedN,
    resequenced_n: report.totals.resequencedN,
    withheld_n: report.totals.withheldN,
    overdue_review_n: report.totals.overdueN,
    caught_people_n: report.totals.caughtPeopleN,
    line_n: report.totals.lineN,
    mandate_n: report.totals.mandatesN,
    objective_n: report.totals.objectiveN,
    materiality_bp: report.conventions.ctrMaterialityBp,
    utilisation_ceiling_pct: report.conventions.ctrUtilisationCeiling,
    obligation_n: report.totals.obligationN,
    board_shown_n: report.findings.length,
    findings_deferred_n: report.findingsDeferredN || 0,
    withheld: '',
    withheld_reason: '',
  };
  rows.push(summary);

  // EVERY finding is exported, not the board slice: an export that silently
  // stopped at forty rows would be exactly the silent drop the mandate forbids.
  for (const finding of report.allFindings || report.findings) {
    rows.push({
      row_kind: 'finding',
      scope: 'line-pair',
      altitude: report.altitude || '',
      lever_a: finding.lever || '',
      lever_b: finding.lever || '',
      direction_a: finding.directionA || '',
      direction_b: finding.directionB || '',
      finding_kind: finding.kind,
      severity: finding.severity,
      state: finding.state,
      weight_a_bp: Number.isInteger(finding.weightABp) ? finding.weightABp : '',
      weight_b_bp: Number.isInteger(finding.weightBBp) ? finding.weightBBp : '',
      weight_sum_bp: Number.isInteger(finding.weightSumBp) ? finding.weightSumBp : '',
      materiality_bp: report.conventions.ctrMaterialityBp,
      claim_a_bp: finding.claimPartsBp?.[0] ?? '',
      claim_b_bp: finding.claimPartsBp?.[1] ?? '',
      claim_sum_bp: Number.isInteger(finding.claimSumBp) ? finding.claimSumBp : '',
      utilisation_target_pct: Number.isInteger(finding.utilisationTargetPct) ? finding.utilisationTargetPct : '',
      queue_multiplier: Number.isFinite(finding.queueMultiplier) ? finding.queueMultiplier : '',
      utilisation_ceiling_pct: report.conventions.ctrUtilisationCeiling,
      review_on: finding.review?.reviewOn || '',
      days_to_review: Number.isInteger(finding.review?.daysToReview) ? finding.review.daysToReview : '',
      obligation_n: finding.review?.obligationIssued?.length || 0,
      // Below the disclosure floor no line is named; the kind and the integers
      // are what a board pack needs, and the reason is printed rather than a
      // silent blank.
      band: report.totals.findingN > 0 ? 'aggregate' : '',
      withheld: report.seat?.fullAccess ? '' : 'line-identity',
      withheld_reason: report.seat?.fullAccess
        ? ''
        : 'Line identity is withheld from an export under a scoped seat; the finding kind, severity and declared integers are exported unchanged.',
    });
  }

  /* Per-lever roll-up: how many findings touch each lever, and at what severity. */
  const leverCounts = new Map();
  for (const finding of report.findings) {
    for (const lever of [finding.leverA || finding.lever, finding.leverB].filter(Boolean)) {
      if (!leverCounts.has(lever)) leverCounts.set(lever, { incompatible: 0, tension: 0, isolated: 0, insufficient: 0 });
      const bucket = leverCounts.get(lever);
      if (bucket[finding.severity] !== undefined) bucket[finding.severity] += 1;
    }
  }
  for (const [lever, counts] of [...leverCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({
      row_kind: 'lever',
      scope: 'lever',
      altitude: report.altitude || '',
      lever_a: lever,
      findings_n: counts.incompatible + counts.tension + counts.isolated + counts.insufficient,
      incompatible_n: counts.incompatible,
      tension_n: counts.tension,
      isolated_n: counts.isolated,
      insufficient_n: counts.insufficient,
      withheld: '',
      withheld_reason: '',
    });
  }

  return rows;
}

/* ------------------------------------------------------------------- brief */

/** The identity-free line the chief sees at the top of their brief. */
export function contradictionBriefText(report) {
  const t = report.totals;
  if (!report.isMatrix) {
    return 'Cross-line contradiction audit: this workspace declares one line per person, so there is no cross-line charter to contradict. Nothing is reported rather than a pairing being invented.';
  }
  if (!t.findingN) {
    return `Cross-line contradiction audit: ${t.mandatesN} declared charter(s) across ${t.lineN} line(s) — no contradiction found. ${t.comparedPairsN} line pair(s) compared; ${t.isolatedN} isolated and ${t.insufficientN} refused for a missing figure.`;
  }
  return `Cross-line contradiction audit: ${t.findingN} finding(s) across ${t.lineN} line(s) — ${t.incompatibleN} incompatible, ${t.tensionN} tension, ${t.isolatedN} isolated, ${t.insufficientN} refused for a missing figure. ${t.caughtPeopleN} person(s) are caught by an incompatible pair; ${t.undecidedN} finding(s) have no ruling and ${t.overdueN} accepted ruling(s) are past review.`;
}

/** Re-exported so a view can label a kind without importing two modules. */
export { contradictionFindingLabel };
