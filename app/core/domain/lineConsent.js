/**
 * app/core/domain/lineConsent.js — Matrix Line Consent (ADR-0148, Schema v123,
 * `#/matrix?panel=consent`).
 *
 * THE QUESTION THIS ANSWERS, IN AN OPERATOR'S WORDS. "Priya has been given 40%
 * of Sam on my project. I never agreed a delivery with her, and nobody has told
 * Sam. If I open the matrix ledger it prints 40% as though I had." That is the
 * gap: the ledger records what one manager DECLARED, and nothing records what
 * the other manager and the person ANSWERED. A declared share is an ask until
 * both of them say yes, and the difference between the two is the number a
 * director actually needs.
 *
 * WHAT IT BUILDS. For every person on more than one line: each declared line,
 * the manager's dated acceptance or reasoned decline, the person's own dated
 * acknowledgement, and five printed states. Below that, three totals printed
 * with exact integer arithmetic — declared shares, accepted shares,
 * acknowledged shares — and a refusal when any line's share is undeclared,
 * because a partial sum would understate the claim.
 *
 * THE FINDING THAT IS THE PRODUCT. A manager who DECLINED the share is not
 * removed from the ledger's arithmetic: the declaration stands until a human
 * ends it, so the share is still charged to the person and still counted in
 * every roll-up. The register prints `declined` beside the still-charged share
 * and names it, rather than quietly subtracting a number a human never agreed
 * to remove.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { normalizeLineConsentSettings } from './lineConsentSchema.js';
import {
  LINE_CONSENT_ENGINE_VERSION,
  LINE_CONSENT_FULL_H,
  LINE_CONSENT_LIMITS,
  LINE_CONSENT_METHOD,
  LINE_CONSENT_STATES,
  LINE_CONSENT_STATE_LABELS,
  LINE_CONSENT_STATE_TONES,
  LINE_CONSENT_VERDICTS,
  lineConsentVerdict,
} from './lineConsentRegistry.js';

/* ------------------------------------------------------------ small helpers */

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function nameOf(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** The later of two dated acts. Ties keep the stored order (array is dated). */
function latestAct(current, candidate) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  if (candidate.decidedOn > current.decidedOn) return candidate;
  if (candidate.decidedOn < current.decidedOn) return current;
  return String(candidate.at || '') >= String(current.at || '') ? candidate : current;
}

/** Every act against one declaration, split by side, latest wins. */
export function consentActsFor(acts, declarationId) {
  const out = { manager: null, person: null, history: [] };
  for (const act of Array.isArray(acts) ? acts : []) {
    if (!act || act.declarationId !== declarationId) continue;
    out.history.push(act);
    if (act.side === 'manager') out.manager = latestAct(out.manager, act);
    else if (act.side === 'person') out.person = latestAct(out.person, act);
  }
  out.history.sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)) || String(a.id).localeCompare(String(b.id)));
  return out;
}

/**
 * The derived state of ONE declared line. Never stored, so a line cannot print
 * a consent the acts do not contain.
 *
 * The one subtle rule: an acknowledgement dated BEFORE the manager's acceptance
 * is not an acknowledgement of this acceptance. It answers a share that has
 * since been re-accepted on a new window, and treating it as current would let a
 * re-acceptance inherit consent nobody renewed.
 */
export function lineConsentState({ managerAct, personAct, today, currentSharePct = null }) {
  if (!managerAct) return { state: LINE_CONSENT_STATES.unanswered, reason: 'No manager-side act exists for this line. The share has been declared and nobody has answered it.' };
  if (managerAct.outcome === 'declined') {
    return { state: LINE_CONSENT_STATES.declined, reason: `The line's manager declined this share on ${managerAct.decidedOn} with a stated reason.` };
  }
  // A RETUNED SHARE IS NOT A CONSENTED SHARE. `managerAct.sharePct` is what the
  // manager accepted on that date; `currentSharePct` is what the declaration says
  // now. They are compared as integers against the null that means "no
  // allocation was declared", never coerced.
  const acceptedSharePct = Number.isInteger(managerAct.sharePct) ? managerAct.sharePct : null;
  const nowSharePct = Number.isInteger(currentSharePct) ? currentSharePct : null;
  if (acceptedSharePct !== nowSharePct) {
    return { state: LINE_CONSENT_STATES.changed, reason: `Accepted at ${acceptedSharePct === null ? 'an undeclared share' : `${acceptedSharePct}%`} on ${managerAct.decidedOn}; the line now declares ${nowSharePct === null ? 'no share' : `${nowSharePct}%`}. Consent to one number is not consent to another.` };
  }
  if (!managerAct.expiresOn || managerAct.expiresOn < today) {
    return { state: LINE_CONSENT_STATES.lapsed, reason: `Accepted on ${managerAct.decidedOn} for a window ending ${managerAct.expiresOn || 'on an undeclared date'}; that window has closed.` };
  }
  if (!personAct || personAct.decidedOn < managerAct.decidedOn) {
    return { state: LINE_CONSENT_STATES.awaitingPerson, reason: `Accepted by the line on ${managerAct.decidedOn}; the person whose hours it takes has not acknowledged it since.` };
  }
  return { state: LINE_CONSENT_STATES.accepted, reason: `Accepted by the line on ${managerAct.decidedOn} and acknowledged by the person on ${personAct.decidedOn}.` };
}

/* --------------------------------------------------------------- the report */

function personRows(matrix, personId, acts, { today, conv, declarationsById }) {
  const lines = (matrix.linesByPerson?.get?.(personId) || []).filter((l) => l && l.role !== 'primary');
  const home = (matrix.linesByPerson?.get?.(personId) || []).find((l) => l && l.role === 'primary') || null;
  const rows = lines.map((line) => {
    const declarationId = line.declarationId || line.id;
    const consent = consentActsFor(acts, declarationId);
    const sharePct = Number.isInteger(line.shareH) ? line.shareH : null;
    const derived = lineConsentState({ managerAct: consent.manager, personAct: consent.person, today, currentSharePct: sharePct });
    const raw = declarationsById.get(declarationId) || null;
    const askedOn = dayOf(raw?.declaredAt) || dayOf(line.fromISO) || null;
    return {
      declarationId,
      lineId: line.id,
      personId,
      personName: nameOf(matrix.nodes?.get?.(personId)?.name, personId),
      managerId: line.managerId,
      managerName: nameOf(matrix.nodes?.get?.(line.managerId)?.name, line.managerId),
      managerAltitude: matrix.nodes?.get?.(line.managerId)?.altitude || null,
      kind: line.kind,
      role: line.role,
      rights: Array.isArray(line.rights) ? [...line.rights] : [],
      fromISO: dayOf(line.fromISO),
      toISO: dayOf(line.toISO),
      sharePct,
      shareDeclared: sharePct !== null,
      shareDisplay: sharePct === null ? 'undeclared' : `${sharePct}%`,
      note: typeof line.note === 'string' ? line.note : '',
      state: derived.state,
      stateLabel: LINE_CONSENT_STATE_LABELS[derived.state] || derived.state,
      tone: LINE_CONSENT_STATE_TONES[derived.state] || 'neutral',
      reason: derived.reason,
      askedOn,
      daysWaiting: askedOn ? Math.max(0, daysBetween(askedOn, today) ?? 0) : null,
      acceptedOn: consent.manager?.outcome === 'accepted' ? consent.manager.decidedOn : null,
      acceptedSharePct: consent.manager?.outcome === 'accepted' && Number.isInteger(consent.manager.sharePct) ? consent.manager.sharePct : null,
      acceptanceExpiresOn: consent.manager?.outcome === 'accepted' ? consent.manager.expiresOn : null,
      acceptanceBasis: consent.manager?.outcome === 'accepted' ? consent.manager.basis || '' : '',
      acceptedBySeatId: consent.manager?.outcome === 'accepted' ? consent.manager.decidedBySeatId : null,
      acceptanceVia: consent.manager?.outcome === 'accepted' ? (consent.manager.via || 'operator') : null,
      declinedOn: consent.manager?.outcome === 'declined' ? consent.manager.decidedOn : null,
      declineReason: consent.manager?.outcome === 'declined' ? consent.manager.reason : '',
      acknowledgedOn: consent.person?.decidedOn || null,
      acknowledgedBySeatId: consent.person?.decidedBySeatId || null,
      acknowledgementVia: consent.person ? (consent.person.via || 'operator') : null,
      acknowledgementCounts: Boolean(consent.person && consent.manager && consent.person.decidedOn >= consent.manager.decidedOn),
      actCount: consent.history.length,
      // A declined line whose share is still declared is still CHARGED by the
      // ledger. Naming it on the row is the point of the register.
      chargedDespiteDecline: derived.state === LINE_CONSENT_STATES.declined && sharePct !== null && sharePct > 0,
    };
  });
  rows.sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.declarationId).localeCompare(String(b.declarationId)));

  const counts = {
    lines: rows.length,
    unanswered: rows.filter((r) => r.state === LINE_CONSENT_STATES.unanswered).length,
    declined: rows.filter((r) => r.state === LINE_CONSENT_STATES.declined).length,
    changed: rows.filter((r) => r.state === LINE_CONSENT_STATES.changed).length,
    lapsed: rows.filter((r) => r.state === LINE_CONSENT_STATES.lapsed).length,
    awaitingPerson: rows.filter((r) => r.state === LINE_CONSENT_STATES.awaitingPerson).length,
    accepted: rows.filter((r) => r.state === LINE_CONSENT_STATES.accepted).length,
    undeclared: rows.filter((r) => !r.shareDeclared).length,
    chargedDespiteDecline: rows.filter((r) => r.chargedDespiteDecline).length,
  };

  // INTEGER ARITHMETIC, ALL OR NOTHING. A partial sum across a person whose
  // other line has no declared share would understate the claim while looking
  // complete, so both totals are refused together with the reason.
  const allDeclared = counts.undeclared === 0;
  const declaredShareH = allDeclared ? rows.reduce((acc, r) => acc + (r.sharePct || 0), 0) : null;
  const acceptedShareH = allDeclared
    ? rows.filter((r) => r.state === LINE_CONSENT_STATES.accepted || r.state === LINE_CONSENT_STATES.awaitingPerson)
        .reduce((acc, r) => acc + (r.sharePct || 0), 0)
    : null;
  const acknowledgedShareH = allDeclared
    ? rows.filter((r) => r.state === LINE_CONSENT_STATES.accepted).reduce((acc, r) => acc + (r.sharePct || 0), 0)
    : null;
  const shareRefusedReason = allDeclared
    ? null
    : `${counts.undeclared} of this person's ${counts.lines} declared line(s) carry no allocation. A total over the declared lines only would understate the claim, so the total is refused rather than printed.`;

  const totals = {
    declaredShareH,
    acceptedShareH,
    acknowledgedShareH,
    shareRefused: !allDeclared,
    shareRefusedReason,
    overAccepted: acceptedShareH !== null && acceptedShareH > LINE_CONSENT_FULL_H,
    overAcceptedH: acceptedShareH !== null ? acceptedShareH - LINE_CONSENT_FULL_H : null,
  };

  // Verdict precedence is declared in the registry; this picks the worst.
  let verdict = 'consented';
  if (totals.overAccepted) verdict = 'over-accepted';
  else if (counts.declined) verdict = 'declined-line';
  else if (counts.changed) verdict = 'changed-share';
  else if (counts.lapsed) verdict = 'lapsed';
  else if (counts.unanswered) verdict = 'unanswered';
  else if (counts.awaitingPerson) verdict = 'awaiting-person';
  else if (!counts.lines) verdict = 'single-line';

  const meta = lineConsentVerdict(verdict) || lineConsentVerdict('consented');
  return {
    personId,
    personName: nameOf(matrix.nodes?.get?.(personId)?.name, personId),
    homeManagerId: home?.managerId || null,
    homeManagerName: home ? nameOf(matrix.nodes?.get?.(home.managerId)?.name, home.managerId) : null,
    rank: matrix.nodes?.get?.(personId)?.rank ?? null,
    altitude: matrix.nodes?.get?.(personId)?.altitude || null,
    lines: rows,
    counts,
    totals,
    verdict,
    verdictLabel: meta.label,
    verdictTone: meta.tone,
    verdictOpen: meta.open,
    verdictReason: meta.detail,
    conventions: conv,
  };
}

function scopeFilter(state, matrix, now, settings) {
  const built = buildSeats(state, {
    now,
    settings,
    lineScope: matrixLineScopeFor(state, { now, settings }),
  });
  const seat = activeSeat(built);
  if (seat.fullAccess) return { seat, visible: () => true, scopeLabel: 'the whole workspace' };
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
  };
}

/**
 * The whole register. Built under the acting seat: a scoped seat sees the people
 * it already reaches on the tree or a declared line, and the rest are COUNTED as
 * withheld — never silently dropped, and never widened sideways.
 */
export function buildLineConsent(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeLineConsentSettings(cfg);
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const acts = Array.isArray(state.lineConsents) ? state.lineConsents : [];
  const declarations = Array.isArray(state.reportingLines) ? state.reportingLines : [];
  const declarationsById = new Map(declarations.filter((d) => d && d.id).map((d) => [d.id, d]));
  const { seat, visible, scopeLabel } = scopeFilter(state, matrix, at, cfg);

  const multiLineIds = [...(matrix.linesByPerson?.keys?.() || [])]
    .filter((personId) => (matrix.linesByPerson.get(personId) || []).some((l) => l && l.role !== 'primary'));
  multiLineIds.sort((a, b) => String(a).localeCompare(String(b)));

  const persons = [];
  let withheldN = 0;
  for (const personId of multiLineIds) {
    if (!visible(personId)) { withheldN += 1; continue; }
    persons.push(personRows(matrix, personId, acts, { today, conv, declarationsById }));
  }
  persons.sort((a, b) => {
    const sa = lineConsentVerdict(a.verdict)?.severity ?? 9;
    const sb = lineConsentVerdict(b.verdict)?.severity ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.personName).localeCompare(String(b.personName));
  });

  const sumOrRefuse = (key) => {
    const refused = persons.filter((p) => p.totals.shareRefused);
    if (refused.length) {
      return {
        value: null,
        refused: true,
        reason: `${refused.length} person(s) in scope carry a declared line with no allocation. A workspace total over the rest would understate the claim, so it is refused.`,
      };
    }
    return { value: persons.reduce((acc, p) => acc + (p.totals[key] || 0), 0), refused: false, reason: null };
  };

  const declared = sumOrRefuse('declaredShareH');
  const accepted = sumOrRefuse('acceptedShareH');
  const acknowledged = sumOrRefuse('acknowledgedShareH');

  const stateCount = (key) => persons.reduce((acc, p) => acc + (p.counts[key] || 0), 0);

  const board = {
    peopleN: persons.length,
    linesN: stateCount('lines'),
    unansweredN: stateCount('unanswered'),
    declinedN: stateCount('declined'),
    changedN: stateCount('changed'),
    lapsedN: stateCount('lapsed'),
    awaitingPersonN: stateCount('awaitingPerson'),
    acceptedN: stateCount('accepted'),
    chargedDespiteDeclineN: stateCount('chargedDespiteDecline'),
    personsOverAcceptedN: persons.filter((p) => p.totals.overAccepted).length,
    personsUndeclaredN: persons.filter((p) => p.totals.shareRefused).length,
    personsConsentedN: persons.filter((p) => p.verdict === 'consented').length,
    withheldN,
    declaredShareH: declared.value,
    acceptedShareH: accepted.value,
    acknowledgedShareH: acknowledged.value,
    sharesRefused: declared.refused,
    sharesRefusedReason: declared.reason,
  };

  return {
    engineVersion: LINE_CONSENT_ENGINE_VERSION,
    generatedOn: today,
    conventions: conv,
    isMatrix: persons.length > 0 || withheldN > 0,
    seat: { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) },
    scopeLabel,
    method: LINE_CONSENT_METHOD,
    verdicts: LINE_CONSENT_VERDICTS,
    persons,
    board,
    queue: persons.filter((p) => p.verdictOpen).slice(0, LINE_CONSENT_LIMITS.board),
    singleChainNote: persons.length
      ? null
      : 'No person in scope reports to more than one manager, so there is no second share to accept. A single-chain workspace gains no row, no ask and no change.',
  };
}

/** The identity-free brief. Counts only: no person, no manager, no declaration. */
export function lineConsentBriefText(report) {
  if (!report) return '';
  const b = report.board;
  const lines = [];
  lines.push(`Matrix line consent — read from ${report.scopeLabel} on ${report.generatedOn}.`);
  if (!report.isMatrix) {
    lines.push('No person in scope holds a second reporting line; nothing in this workspace requires consent.');
    return lines.join(' ');
  }
  lines.push(`${b.peopleN} person(s) hold ${b.linesN} declared line(s): ${b.unansweredN} never answered, ${b.declinedN} declined, ${b.changedN} retuned after acceptance, ${b.lapsedN} lapsed, ${b.awaitingPersonN} accepted but not acknowledged, ${b.acceptedN} accepted and acknowledged.`);
  if (b.sharesRefused) {
    lines.push(`Share totals are refused: ${b.sharesRefusedReason}`);
  } else {
    lines.push(`${b.declaredShareH}% of a person is declared across these lines and ${b.acceptedShareH}% has been accepted by the managers; ${b.acknowledgedShareH}% has been acknowledged by the people themselves.`);
  }
  if (b.personsOverAcceptedN) lines.push(`${b.personsOverAcceptedN} person(s) have had more than 100% of themselves accepted.`);
  if (b.chargedDespiteDeclineN) lines.push(`${b.chargedDespiteDeclineN} declined line(s) are still charged because the declaration was never withdrawn.`);
  if (b.withheldN) lines.push(`${b.withheldN} person(s) on a second line sit outside this seat and are counted, not shown.`);
  return lines.join(' ');
}

/**
 * CSV scope #110 — aggregate only. One summary row plus one row per declared
 * line kind. No person, no name, no declaration id, no free text. A refused
 * share is a BLANK cell with the reason in its own column, never a zero.
 */
export function lineConsentCsvRows(report) {
  if (!report) return [];
  const b = report.board;
  const blank = (v) => (v === null || v === undefined ? '' : String(v));
  const rows = [{
    row_kind: 'workspace',
    line_kind: '',
    lines_n: blank(b.linesN),
    unanswered_n: blank(b.unansweredN),
    declined_n: blank(b.declinedN),
    lapsed_n: blank(b.lapsedN),
    changed_share_n: blank(b.changedN),
    awaiting_person_n: blank(b.awaitingPersonN),
    accepted_n: blank(b.acceptedN),
    declared_share_h: blank(b.declaredShareH),
    accepted_share_h: blank(b.acceptedShareH),
    persons_n: blank(b.peopleN),
    persons_over_accepted_n: blank(b.personsOverAcceptedN),
    persons_undeclared_n: blank(b.personsUndeclaredN),
    share_refused: b.sharesRefused ? 'true' : 'false',
    share_refused_reason: b.sharesRefused ? b.sharesRefusedReason || '' : '',
  }];

  const kinds = new Map();
  for (const person of report.persons) {
    for (const line of person.lines) {
      const key = line.kind || 'undeclared';
      if (!kinds.has(key)) {
        kinds.set(key, { kind: key, lines: 0, unanswered: 0, declined: 0, changed: 0, lapsed: 0, awaitingPerson: 0, accepted: 0, shareH: 0, undeclared: 0 });
      }
      const acc = kinds.get(key);
      acc.lines += 1;
      if (line.state === LINE_CONSENT_STATES.unanswered) acc.unanswered += 1;
      else if (line.state === LINE_CONSENT_STATES.declined) acc.declined += 1;
      else if (line.state === LINE_CONSENT_STATES.changed) acc.changed += 1;
      else if (line.state === LINE_CONSENT_STATES.lapsed) acc.lapsed += 1;
      else if (line.state === LINE_CONSENT_STATES.awaitingPerson) acc.awaitingPerson += 1;
      else if (line.state === LINE_CONSENT_STATES.accepted) acc.accepted += 1;
      if (line.sharePct === null) acc.undeclared += 1;
      else {
        acc.shareH += line.sharePct;
        if (line.state === LINE_CONSENT_STATES.accepted || line.state === LINE_CONSENT_STATES.awaitingPerson) {
          acc.acceptedShareH = (acc.acceptedShareH || 0) + line.sharePct;
        }
      }
    }
  }

  for (const acc of [...kinds.values()].sort((a, b) => String(a.kind).localeCompare(String(b.kind)))) {
    const refused = acc.undeclared > 0;
    rows.push({
      row_kind: 'line-kind',
      line_kind: acc.kind,
      lines_n: blank(acc.lines),
      unanswered_n: blank(acc.unanswered),
      declined_n: blank(acc.declined),
      lapsed_n: blank(acc.lapsed),
      changed_share_n: blank(acc.changed),
      awaiting_person_n: blank(acc.awaitingPerson),
      accepted_n: blank(acc.accepted),
      declared_share_h: refused ? '' : blank(acc.shareH),
      accepted_share_h: refused ? '' : blank(acc.acceptedShareH || 0),
      persons_n: '',
      persons_over_accepted_n: '',
      persons_undeclared_n: '',
      share_refused: refused ? 'true' : 'false',
      share_refused_reason: refused
        ? `${acc.undeclared} line(s) of this kind carry no allocation, so the kind's share total is refused rather than printed over a part.`
        : '',
    });
  }
  return rows;
}

/** Rows that need a human next, worst first. Used by the panel's queue. */
export function lineConsentAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildLineConsent(state, { now, settings });
  return report.persons.filter((p) => p.verdictOpen).length;
}
