/**
 * app/core/domain/voice.js — the ONE reader of the Employee Voice & Collective
 * Consultation Register (ADR-0243, Schema v197, `#/voice`).
 *
 * Every state, window, days-early figure, days-late figure, quorum finding and
 * count this module prints is derived here, on read, from stored declarations and
 * the injected clock. Nothing derived is stored anywhere, so the same workspace
 * read twice gives the same answer and a hand-edited file cannot carry a close day
 * that disagrees with the window beside it.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER ITEM: *was the body actually
 * consulted — told in writing, given the period its instrument declares, allowed
 * to advise, answered — BEFORE the decision this item feeds was taken?* The
 * answer is one of fourteen states, and each is a DIFFERENT fact:
 *
 *   breach-decided-before-advice   a decision on the record predates the close of
 *                                  the declared window. Unreachable through the
 *                                  door; kept when imported, printed permanently.
 *   breach-implemented-before-decision  the change is in place before the
 *                                  decision that authorised it.
 *   breach-body-lapsed             the item was put to a body after its term ended.
 *   implemented                    advice, decision and effect day all recorded.
 *   decided-departing              a decision that departs from the advice, with
 *                                  its own written reason.
 *   decided-without-advice         the window closed with nothing and a decision
 *                                  was taken anyway. Silence is not consent.
 *   decided                        a decision follows the advice on the record.
 *   reply-overdue                  the body advised and the reply is past its day.
 *   advice-replied                 advice answered in writing; the decision is owed.
 *   advised-late                   advice arrived after the window closed. Kept,
 *                                  with the exact days late.
 *   advised                        advice inside the window; reply and decision owed.
 *   advice-lapsed                  the window closed with no advice at all.
 *   advice-owed                    the window is running. Exact days left printed.
 *   notified                       an information item, where nothing is owed back.
 *
 * WHY THE BREACHES SURVIVE. The commands refuse to create a decision before the
 * window closes — that is the point of the register. But an imported or
 * hand-edited workspace can carry one, and a reader that quietly dropped it would
 * hide the single fact the screen exists to show. So the loader keeps it, the
 * reader prints it with the exact days early, and the rule asks a seat to answer
 * for it. Refusing to create a breach and refusing to hide one are the same
 * discipline.
 *
 * WHY SILENCE IS NOT CONSENT. `advice-lapsed` is printed as its own state, with
 * its own severity, and it is never rendered as a clean consultation. A body that
 * never came back told you nothing; a register that reads that as agreement would
 * manufacture the only fact a leader most wants to hear.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). An item names the reporting lines whose
 * work the change affects. The seat answerable for the item is the JOINT APEX
 * above those lines, computed through the one matrix engine — never the declaring
 * line, never one of two affected lines on the other's behalf, and never a body,
 * which is not a person and cannot be asked to answer for itself. A person is
 * counted ONCE in every people figure.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  VOI_ADVICE_COURSE_BY_KEY,
  VOI_DECISION_COURSE_BY_KEY,
  VOI_ENGINE_VERSION,
  VOI_ITEM_KIND_BY_KEY,
  VOI_SETTING_KEYS,
  VOI_SITTING_STATE_BY_KEY,
  VOI_STATE_BY_KEY,
  VOI_STATE_KEYS,
} from './voiceRegistry.js';
import {
  normalizeVoiceBodies,
  normalizeVoiceDecisions,
  normalizeVoiceItems,
  normalizeVoiceMarkers,
  normalizeVoiceMembers,
  normalizeVoiceResponses,
  normalizeVoiceSettings,
  normalizeVoiceSittings,
} from './voiceSchema.js';
import {
  daysToClose,
  earlyDays,
  lateDays,
  minutesDueOn,
  quorateAttendance,
  replyDueOn,
  voiceDay,
  windowClosesOn,
  withinTerm,
} from './voiceMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function voicePersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/** Members of a body in term on a day, representatives and chair, never observers. */
export function voiceMembersInTerm(members, bodyId, on) {
  return list(members).filter((row) => row && row.bodyId === bodyId && withinTerm(on, row.termStart, row.termEnd));
}

/**
 * THE ITEM KERNEL. Pure over (item, body, response, decision, nowDay, replyDays),
 * exported so the suite can pin every branch without a store and so the rule and
 * the screen cannot disagree about a state.
 *
 * `breaches` is ALWAYS returned as a list, even when `state` names only the
 * gravest one: a row that breaches two duties must not hide the second.
 */
export function deriveVoiceItem({ item, body, response = null, decision = null, nowDay, replyDays = 10 }) {
  const kind = VOI_ITEM_KIND_BY_KEY[item?.kind] || null;
  const opensOn = voiceDay(item?.openedOn);
  const closesOn = kind?.owesAdvice ? windowClosesOn(opensOn, item?.windowDays) : null;
  const breaches = [];

  const bodyLapsed = Boolean(body?.termEndsOn && opensOn && daysBetween(body.termEndsOn, opensOn) > 0);
  const decidedEarly = Boolean(decision && closesOn && daysBetween(decision.decidedOn, closesOn) > 0);
  // Implemented BEFORE the decision means a NEGATIVE offset from the decision day:
  // the change is in place on an earlier day than the act that authorised it. The
  // first draft of this line had the sign the wrong way round and printed a clean
  // implementation as a breach — the exact class of error the demo fixture caught.
  const implementedEarly = Boolean(decision?.implementedOn && daysBetween(decision.decidedOn, decision.implementedOn) < 0);

  if (decidedEarly) breaches.push({ key: 'decided-before-advice', earlyDays: earlyDays(decision.decidedOn, closesOn) });
  if (implementedEarly) breaches.push({ key: 'implemented-before-decision', earlyDays: earlyDays(decision.implementedOn, decision.decidedOn) });
  if (bodyLapsed) breaches.push({ key: 'body-lapsed', afterDays: lateDays(opensOn, body.termEndsOn) });

  const receivedOn = response ? voiceDay(response.receivedOn) : null;
  const adviceLateDays = response && closesOn ? lateDays(receivedOn, closesOn) : null;
  const adviceInTime = Boolean(response) && (closesOn === null || (receivedOn && daysBetween(receivedOn, closesOn) >= 0));
  const replyDue = response ? replyDueOn(receivedOn, replyDays) : null;
  const replyLate = response?.replyOn && replyDue ? lateDays(response.replyOn, replyDue) : null;
  const remaining = closesOn ? daysToClose(nowDay, closesOn) : null;
  const overdueReply = Boolean(response && !response.replyOn && replyDue && nowDay && daysBetween(replyDue, nowDay) > 0);
  const replyOverdueDays = overdueReply ? lateDays(nowDay, replyDue) : null;

  const base = {
    closesOn,
    opensOn,
    daysRemaining: remaining,
    adviceLateDays: adviceLateDays || 0,
    adviceInTime,
    replyDueOn: replyDue,
    replyLateDays: replyLate || 0,
    replyOverdueDays,
    breaches,
    bodyLapsed,
    decidedEarly,
    implementedEarly,
    adviceCourse: response?.advice ? VOI_ADVICE_COURSE_BY_KEY[response.advice] || null : null,
    decisionCourse: decision?.course ? VOI_DECISION_COURSE_BY_KEY[decision.course] || null : null,
  };
  const stateFor = (key) => ({ key, ...VOI_STATE_BY_KEY[key] });

  if (decidedEarly) return { ...base, state: stateFor('breach-decided-before-advice') };
  if (implementedEarly) return { ...base, state: stateFor('breach-implemented-before-decision') };
  if (bodyLapsed) return { ...base, state: stateFor('breach-body-lapsed') };

  if (decision) {
    if (decision.implementedOn) return { ...base, state: stateFor('implemented') };
    if (decision.course === 'departed') return { ...base, state: stateFor('decided-departing') };
    if (decision.course === 'proceeded-without-advice') return { ...base, state: stateFor('decided-without-advice') };
    return { ...base, state: stateFor('decided') };
  }

  // An information item owes nothing back. It is `notified` once the documents are
  // on the record, and the reader does not manufacture a consultation out of it.
  if (kind && !kind.owesAdvice) return { ...base, state: stateFor('notified') };

  if (response) {
    if (response.replyOn) return { ...base, state: stateFor('advice-replied') };
    if (overdueReply) return { ...base, state: stateFor('reply-overdue') };
    if (adviceInTime) return { ...base, state: stateFor('advised') };
    return { ...base, state: stateFor('advised-late') };
  }

  if (remaining === null) {
    // An unreadable window is not a licence to print "nothing is wrong".
    return { ...base, state: stateFor('advice-owed'), unreadableWindow: true };
  }
  // The body is entitled to the whole of the closing day, so a window closes into
  // `advice-lapsed` only on the day AFTER it.
  if (remaining < 0) return { ...base, state: stateFor('advice-lapsed') };
  return { ...base, state: stateFor('advice-owed') };
}

/**
 * THE SITTING KERNEL. A sitting is a dated meeting; what it proves is attendance
 * against the body's own declared quorum, and whether a minute exists and when.
 */
export function deriveVoiceSitting({ sitting, body, members, nowDay, minutesDueDays = 10 }) {
  const due = minutesDueOn(sitting?.on, minutesDueDays);
  const attendance = quorateAttendance(sitting?.presentIds, list(members).filter((row) => row.bodyId === sitting?.bodyId), sitting?.on);
  const quorum = Number.isInteger(body?.quorumWhole) ? body.quorumWhole : null;
  const belowQuorum = quorum !== null ? attendance.count < quorum : null;
  const minutesLateDays = sitting?.minutesOn && due ? lateDays(sitting.minutesOn, due) : 0;
  const minutesOverdue = Boolean(!sitting?.minutesOn && due && nowDay && daysBetween(due, nowDay) > 0);
  const minutesOverdueDays = minutesOverdue ? lateDays(nowDay, due) : null;
  const future = Boolean(sitting?.on && nowDay && daysBetween(nowDay, sitting.on) > 0);

  const base = {
    minutesDueOn: due,
    minutesLateDays,
    minutesOverdueDays,
    attendanceN: attendance.count,
    liveMembersN: attendance.liveCount,
    quorum,
    belowQuorum,
    future,
  };
  const stateFor = (key) => ({ key, ...VOI_SITTING_STATE_BY_KEY[key] });

  // A sitting's minutes do not cure a quorum failure: a body that transacted below
  // its own constitution is `below-quorum` even with a perfect minute, because the
  // minute records who was in the room and the room was not enough.
  if (sitting?.minutesOn) {
    if (minutesLateDays > 0) return { ...base, state: stateFor('minutes-late') };
    if (belowQuorum) return { ...base, state: stateFor('below-quorum') };
    return { ...base, state: stateFor('minuted') };
  }
  if (future) return { ...base, state: stateFor('scheduled') };
  if (minutesOverdue) return { ...base, state: stateFor('minutes-lapsed') };
  if (belowQuorum) return { ...base, state: stateFor('below-quorum') };
  return { ...base, state: stateFor('minutes-owed') };
}

/**
 * The whole register, read once. `seat` narrows the disclosure ladder; `now` is
 * injected; nothing is read from the ambient clock.
 */
export function buildVoice(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const asOf = dayKey(at);
  const cfg = normalizeVoiceSettings(settings || state.settings || {});
  const replyDays = cfg[VOI_SETTING_KEYS.replyDays];
  const minutesDueDays = cfg[VOI_SETTING_KEYS.minutesDueDays];
  const warnings = [];

  const bodies = normalizeVoiceBodies(state.voiceBodies, warnings);
  const members = normalizeVoiceMembers(state.voiceMembers, bodies, warnings);
  const items = normalizeVoiceItems(state.voiceItems, bodies, warnings);
  const sittings = normalizeVoiceSittings(state.voiceSittings, bodies, members, items, warnings);
  const responses = normalizeVoiceResponses(state.voiceResponses, items, warnings);
  const decisions = normalizeVoiceDecisions(state.voiceDecisions, items, warnings);
  const markers = normalizeVoiceMarkers(state.voiceMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...(state.settings || {}), activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read (${error?.message || 'unknown error'}), so no affected line and no joint seat can be resolved.`;
  }

  const bodyById = new Map(bodies.map((row) => [row.id, row]));
  const responseByItem = new Map(responses.map((row) => [row.itemId, row]));
  const decisionByItem = new Map(decisions.map((row) => [row.itemId, row]));

  const roster = new Set(list(state.people).filter((row) => row && row.id).map((row) => row.id));
  const graphIds = matrix?.nodes ? new Set(matrix.nodes.keys()) : new Set();
  const resolveHand = (personId) => (graphIds.has(personId) || personId === LEADER_ID || roster.has(personId)
    ? voicePersonLabel(matrix, personId)
    : null);

  /* ---------------------------------------------------------------- items */

  const rows = [];
  let unresolvedOwnerN = 0;
  for (const item of items) {
    const body = bodyById.get(item.bodyId) || null;
    const row = deriveVoiceItem({
      item,
      body,
      response: responseByItem.get(item.id) || null,
      decision: decisionByItem.get(item.id) || null,
      nowDay: asOf,
      replyDays,
    });
    const owners = item.ownerIds.map((ownerId) => {
      const name = resolveHand(ownerId);
      if (!name) unresolvedOwnerN += 1;
      return { id: ownerId, name, resolved: Boolean(name) };
    });
    let apex = { apexIds: [], ambiguous: false };
    if (matrix) {
      try {
        apex = matrixJointApex(matrix, item.ownerIds.filter((ownerId) => graphIds.has(ownerId)));
      } catch {
        apex = { apexIds: [], ambiguous: false, error: true };
      }
    }
    const apexNames = list(apex?.apexIds).map((apexId) => voicePersonLabel(matrix, apexId));
    rows.push({
      item,
      body,
      state: row.state,
      closesOn: row.closesOn,
      daysRemaining: row.daysRemaining,
      adviceLateDays: row.adviceLateDays,
      adviceInTime: row.adviceInTime,
      replyDueOn: row.replyDueOn,
      replyLateDays: row.replyLateDays,
      replyOverdueDays: row.replyOverdueDays,
      breaches: row.breaches,
      response: responseByItem.get(item.id) || null,
      decision: decisionByItem.get(item.id) || null,
      owners,
      ownersResolved: owners.every((owner) => owner.resolved),
      apex,
      apexNames,
      ambiguousApex: Boolean(apex?.ambiguous),
    });
  }

  /* -------------------------------------------------------------- sittings */

  const sittingRows = sittings.map((sitting) => {
    const body = bodyById.get(sitting.bodyId) || null;
    const derived = deriveVoiceSitting({ sitting, body, members, nowDay: asOf, minutesDueDays });
    const present = sitting.presentIds.map((memberId) => {
      const member = members.find((row) => row.id === memberId) || null;
      return { memberId, personId: member?.personId || null, name: member?.personId ? resolveHand(member.personId) : null };
    });
    return { sitting, body, ...derived, present };
  });

  /* ---------------------------------------------------------------- bodies */

  const bodyRows = bodies.map((body) => {
    const live = voiceMembersInTerm(members, body.id, asOf);
    const bodyItems = rows.filter((row) => row.item.bodyId === body.id);
    const bodySittings = sittingRows.filter((row) => row.sitting.bodyId === body.id);
    const termState = !body.termEndsOn
      ? 'term-unstated'
      : (asOf && daysBetween(body.termEndsOn, asOf) > 0 ? 'term-lapsed' : 'constituted');
    return {
      body,
      membersN: live.length,
      chairName: live.find((row) => row.role === 'chair')
        ? resolveHand(live.find((row) => row.role === 'chair').personId)
        : null,
      itemsN: bodyItems.length,
      lapsedN: bodyItems.filter((row) => row.state.key === 'advice-lapsed').length,
      adviceN: bodyItems.filter((row) => ['advised', 'advised-late', 'advice-replied', 'reply-overdue'].includes(row.state.key)).length,
      decidedN: bodyItems.filter((row) => ['decided', 'decided-departing', 'decided-without-advice', 'implemented'].includes(row.state.key)).length,
      sittingsN: bodySittings.length,
      belowQuorumN: bodySittings.filter((row) => row.belowQuorum).length,
      termState,
      termDaysLeft: body.termEndsOn && asOf ? daysBetween(asOf, body.termEndsOn) : null,
    };
  });

  /* ---------------------------------------------------------------- states */

  const states = {};
  for (const key of VOI_STATE_KEYS) states[key] = 0;
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;
  const stateTotal = Object.values(states).reduce((sum, n) => sum + n, 0);

  const itemIds = new Set(items.map((row) => row.id));
  const bodyIds = new Set(bodies.map((row) => row.id));
  const balances = {
    statesReconcile: stateTotal === items.length,
    responsesReconcile: responses.every((row) => itemIds.has(row.itemId)),
    decisionsReconcile: decisions.every((row) => itemIds.has(row.itemId)),
    sittingsReconcile: sittings.every((row) => bodyIds.has(row.bodyId)),
  };

  const breaches = rows.filter((row) => row.state.key.startsWith('breach'));
  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (unresolvedOwnerN) incompleteReasons.push(`${unresolvedOwnerN} affected line(s) name a hand that is not on the active reporting graph; their joint seat cannot be resolved and their duty cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the items they summarise.');
  if (!balances.responsesReconcile) incompleteReasons.push('An advice row is not attached to an item on the record.');
  if (!balances.decisionsReconcile) incompleteReasons.push('A decision row is not attached to an item on the record.');
  if (!balances.sittingsReconcile) incompleteReasons.push('A sitting is not attached to a body on the record.');

  /* -------------------------------------------------------------- line view */

  const byLine = new Map();
  for (const row of rows) {
    for (const owner of row.owners) {
      const entry = byLine.get(owner.id) || {
        managerId: owner.id,
        name: owner.name,
        itemsN: 0,
        openN: 0,
        lapsedN: 0,
        decidedN: 0,
        departedN: 0,
        breachN: 0,
        bodies: new Set(),
      };
      entry.itemsN += 1;
      if (row.state.key === 'advice-lapsed' || row.state.key === 'advice-owed') entry.openN += 1;
      if (row.state.key === 'advice-lapsed') entry.lapsedN += 1;
      if (row.decision) entry.decidedN += 1;
      if (row.decision?.course === 'departed') entry.departedN += 1;
      if (row.state.key.startsWith('breach')) entry.breachN += 1;
      if (row.body) entry.bodies.add(row.body.name);
      byLine.set(owner.id, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({ ...entry, bodiesN: entry.bodies.size, bodies: [...entry.bodies].sort() }))
    .sort((a, b) => String(a.name || a.managerId).localeCompare(String(b.name || b.managerId)) || String(a.managerId).localeCompare(String(b.managerId)));

  /* ---------------------------------------------------------------- totals */

  const totals = {
    bodies: bodies.length,
    liveMembers: bodyRows.reduce((sum, row) => sum + row.membersN, 0),
    members: members.length,
    items: items.length,
    consultations: items.filter((row) => row.kind === 'consultation').length,
    negotiations: items.filter((row) => row.kind === 'negotiation').length,
    information: items.filter((row) => row.kind === 'information').length,
    adviceOwedN: states['advice-owed'] || 0,
    adviceLapsedN: states['advice-lapsed'] || 0,
    advisedN: (states.advised || 0) + (states['advised-late'] || 0) + (states['advice-replied'] || 0) + (states['reply-overdue'] || 0),
    advisedLateN: rows.filter((row) => (row.adviceLateDays || 0) > 0).length,
    repliedN: rows.filter((row) => row.response?.replyOn).length,
    replyOverdueN: states['reply-overdue'] || 0,
    decisionsN: decisions.length,
    departedN: decisions.filter((row) => row.course === 'departed').length,
    withoutAdviceN: decisions.filter((row) => row.course === 'proceeded-without-advice').length,
    implementedN: decisions.filter((row) => row.implementedOn).length,
    sittingsN: sittings.length,
    belowQuorumN: sittingRows.filter((row) => row.belowQuorum).length,
    minutesLapsedN: sittingRows.filter((row) => row.state.key === 'minutes-lapsed').length,
    breachesN: breaches.length,
    ownersN: lineRows.length,
  };
  // `minutes-lapsed` is a SITTING state: it is counted from sittings and never
  // from the item state table, so the two vocabularies cannot be confused.

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Subjects, representatives and written advice are withheld above rank 3. What a named body advised about a named change is collective material belonging to the people in it, not executive reading.',
      rank: seat?.rank ?? null,
    };

  return {
    ok: true,
    engineVersion: VOI_ENGINE_VERSION,
    asOf,
    nowIso: at.toISOString(),
    matrix,
    matrixError,
    conventions: cfg,
    detailed: Boolean(detailed),
    disclosure,
    bodies,
    members,
    items,
    sittings,
    responses,
    decisions,
    markers,
    rows,
    sittingRows,
    bodyRows,
    warnings,
    unresolvedOwnerN,
    states,
    stateTotal,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    breaches,
    totals,
    lineRows,
    stateRows: VOI_STATE_KEYS.map((key) => ({ key, label: VOI_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    attention: {
      adviceLapsedN: totals.adviceLapsedN,
      replyOverdueN: totals.replyOverdueN,
      breachesN: totals.breachesN,
      minutesLapsedN: totals.minutesLapsedN,
      total: totals.adviceLapsedN + totals.replyOverdueN + totals.breachesN + totals.minutesLapsedN,
    },
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — a window that closed
 * with no advice, an advice nobody answered, a decision that preceded its window,
 * and minutes past their day — never every open item, so the badge reads as "work
 * owed now" rather than "things happening".
 */
export function voiceAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildVoice(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Four facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a person or a body.
 */
export function voiceSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildVoice(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Employee voice', route: '#/voice', ...signal });

  if (report.totals.adviceLapsedN) {
    add({
      ruleId: 'VOI-01',
      severity: 4,
      confidence: 'high',
      title: `${report.totals.adviceLapsedN} consultation window(s) closed with no advice on the record`,
      detail: 'The declared period ran out and the body never came back. The register does not read that as agreement: it prints the item as lapsed, counts it, and asks the joint apex above the affected lines to account for it. A decision taken afterwards is recorded as taken without advice.',
      action: { label: 'Open the consultation register', route: '#/voice?panel=items' },
      evidence: [`${report.totals.items} item(s) on the register`, `${report.balances.statesReconcile ? 'state counts reconcile' : 'state counts do not reconcile'}`],
    });
  }

  if (report.totals.replyOverdueN) {
    add({
      ruleId: 'VOI-02',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.replyOverdueN} item(s) where the body advised and the organisation has not replied`,
      detail: `The advice is on the record and the declared reply day has passed. A body that is consulted and never answered learns that consulting changes nothing, which is how a voice channel closes without anyone deciding to close it.`,
      action: { label: 'Answer the outstanding advice', route: '#/voice?panel=items' },
      evidence: [`${report.totals.repliedN} advice(s) already answered in writing`],
    });
  }

  if (report.totals.breachesN) {
    add({
      ruleId: 'VOI-03',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.breachesN} item(s) carry a decision or implementation out of order`,
      detail: 'A decision dated before the declared window closed, an implementation dated before the decision, or an item put to a body after its term. The commands cannot create these; they arrived in the record and the register keeps them rather than hiding them. Each one prints the exact days by which the act preceded the duty.',
      action: { label: 'See the breaches', route: '#/voice?panel=items' },
      evidence: [`${report.totals.decisionsN} decision(s) on the record`],
    });
  }

  if (report.totals.minutesLapsedN || report.totals.belowQuorumN) {
    add({
      ruleId: 'VOI-04',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.minutesLapsedN} sitting(s) with no minutes and ${report.totals.belowQuorumN} below the body’s own quorum`,
      detail: 'A sitting with no minute cannot be shown to have advised anything, and a sitting below the quorum its constitution declares did not transact. Both facts are printed against the body’s own declared rules rather than a default the software chose.',
      action: { label: 'Open the sittings', route: '#/voice?panel=sittings' },
      evidence: [`${report.totals.sittingsN} sitting(s) recorded`],
    });
  }

  return signals;
}
