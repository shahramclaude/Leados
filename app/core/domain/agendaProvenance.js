/**
 * app/core/domain/agendaProvenance.js — the 1:1 agenda provenance ledger
 * (`#/agenda`, ADR-0113, Session 153).
 *
 * THE DUTY THIS SERVES
 * --------------------
 * A frontline lead's most repeated act of leadership is not a decision. It is
 * the forty minutes before a 1:1: knowing what to raise, what the person asked
 * to raise, what you promised last week, and what you have already asked.
 * Fourteen rules on the shared spine push prompts onto a person's waiting list,
 * and the record shows them as one undifferentiated array. The person's own
 * topic is buried, the prompt the lead owed from last week is the first thing
 * `normalizeTalkingPoints` evicts, and "I asked them about that" leaves no
 * trace anywhere.
 *
 * THE THREE THINGS THIS LEDGER ADDS, AND NOTHING ELSE
 * ---------------------------------------------------
 * 1. PROVENANCE. Every line in the waiting list is classified by the declared
 *    family table (agendaProvenanceRegistry) into WHO owes it: the person
 *    (`self`), the leader's own span (`above`), a bilateral obligation
 *    (`both`), or honestly `unclassified`. The queue stops being one pile.
 *
 * 2. A COMMITTED LINE (the missing object). `agendaEntries` records the lead's
 *    own act: "I will raise THIS exact prompt with THIS person." It is written
 *    in the same transaction as the decision it came from and it carries a
 *    lineage edge to the source prompt. Nothing else in the product records
 *    the difference between a prompt that was queued and a prompt the lead
 *    actually put on a printed agenda.
 *
 * 3. A RECEIPT, DERIVED — NEVER TICKED. Whether a filed prompt was actually
 *    raised is read from the 1:1 record that the human already logged
 *    (`resolvedTopics` when the covered-topic box was confirmed, or a matching
 *    agenda line marked discussed). A missing later 1:1 is NOT a missed
 *    promise: it is `awaiting`. Only after a held conversation whose date is
 *    after the filing, in which the prompt was not raised, does the line read
 *    `dropped` — and the engine never writes that status, it derives it on read.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No score for a person. The unit is the line and the span's own queue
 * discipline. No auto-filing: a filed line always represents a human command.
 * No rewriting of `talkingPoints` — that collection belongs to its fourteen
 * writers, and this module only reads it.
 */

import { daysBetween, dayKey, weekKey } from '../time.js';
import {
  AGENDA_LIMITS, AGENDA_OWED, AGENDA_OWED_LABELS, agendaFamily, classifyTopic,
} from './agendaProvenanceRegistry.js';

const day = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Wilson (1927) score interval — refused, not printed, below the declared floor. */
export function wilsonInterval(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: clamp01(centre - half), high: clamp01(centre + half), p, n };
}

/**
 * Classify one person's waiting list. Pure: reads nothing but the person record.
 * Returns rows in queue order, with the eviction risk the lead cannot see today.
 */
export function personQueue(person) {
  const raw = Array.isArray(person?.talkingPoints) ? person.talkingPoints : [];
  const rows = raw.map((text, index) => {
    const info = classifyTopic(text);
    return {
      index,
      text: info.text,
      family: info.family,
      label: info.label,
      owedTo: info.owedTo,
      owedToLabel: AGENDA_OWED_LABELS[info.owedTo] || AGENDA_OWED_LABELS.unclassified,
      engine: info.engine,
      owner: info.owner,
      framework: info.framework || null,
      why: info.why || null,
      // The writers that cap at 12 push at the end; the queue is a FIFO that
      // silently drops its oldest member. Every position is priced.
      evictionRisk: index === 0 && raw.length >= AGENDA_LIMITS.queueCap,
      atCap: raw.length >= AGENDA_LIMITS.queueCap,
    };
  });
  const count = (owedTo) => rows.filter((r) => r.owedTo === owedTo).length;
  const personRaised = rows.filter((r) => !r.engine && r.family === 'person-raised').length;
  const engine = rows.length - personRaised;
  return {
    personId: person?.id || null,
    rows,
    total: rows.length,
    personRaised,
    engine,
    self: count(AGENDA_OWED.SELF),
    above: count(AGENDA_OWED.ABOVE),
    both: count(AGENDA_OWED.BOTH),
    unclassified: count(AGENDA_OWED.UNCLASSIFIED),
    atCap: rows.length >= AGENDA_LIMITS.queueCap,
    headroom: Math.max(0, AGENDA_LIMITS.queueCap - rows.length),
    // The share of the list that is not the person's own topic. This is the
    // number a lead needs and has never been shown.
    engineSharePct: rows.length ? Math.round((engine / rows.length) * 1000) / 10 : null,
  };
}

/** True when an entry's exact prompt was actually raised in a held 1:1. */
function raisedIn(meeting, prompt) {
  if (!meeting || meeting.status !== 'held') return null;
  const key = String(prompt || '').toLowerCase();
  if (!key) return null;
  const resolved = (meeting.resolvedTopics || []).some((t) => String(t).toLowerCase() === key);
  if (resolved) return 'resolved-topic';
  const agenda = (meeting.agenda || []).find((a) => String(a.text || '').toLowerCase() === key);
  if (agenda && agenda.done) return 'agenda-discussed';
  return null;
}

/**
 * Re-derive one filed entry's status from the 1:1 record alone.
 *
 * `open`     filed, no held conversation has happened since the filing date
 * `raised`   a held conversation on/after the filing covered this exact prompt
 * `dropped`  a held conversation on/after the filing happened and did not
 * `stale`    still open, and the filing is older than the declared staleness
 * `closed`   the lead withdrew the filing (a human command, honoured as-is)
 */
export function entryStatus(entry, meetings, now) {
  const filedOn = day(entry?.filedOn) || day(entry?.createdAt?.slice?.(0, 10));
  if (entry?.status === 'withdrawn') {
    return { status: 'closed', raisedOn: null, raisedVia: null, meetingId: entry.withdrawnInMeetingId || null, days: filedOn ? daysBetween(filedOn, now) : null };
  }
  const later = (meetings || [])
    .filter((m) => m && m.status === 'held' && day(m.date) && filedOn && m.date >= filedOn)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  for (const meeting of later) {
    const via = raisedIn(meeting, entry.prompt);
    if (via) return { status: 'raised', raisedOn: meeting.date, raisedVia: via, meetingId: meeting.id, days: daysBetween(filedOn, meeting.date) };
  }
  const age = filedOn ? daysBetween(filedOn, now) : null;
  if (later.length) {
    const first = later[0];
    return { status: 'dropped', raisedOn: null, raisedVia: null, meetingId: first.id, days: daysBetween(filedOn, first.date) };
  }
  if (age !== null && age > AGENDA_LIMITS.staleAfterDays) {
    return { status: 'stale', raisedOn: null, raisedVia: null, meetingId: null, days: age };
  }
  return { status: 'open', raisedOn: null, raisedVia: null, meetingId: null, days: age };
}

const STATUS_TONES = Object.freeze({ raised: 'good', open: 'neutral', stale: 'bad', dropped: 'warn', closed: 'neutral' });
export const agendaStatusTone = (status) => STATUS_TONES[status] || 'neutral';

/**
 * The whole ledger for one seat, re-derived on read.
 *
 * `personIds` limits the read to the seat's own span; an empty list is never
 * silently treated as "everyone" — the caller passes the seat scope explicitly.
 */
export function buildAgendaLedger(state, { personIds = null, now = new Date(), settings = null } = {}) {
  const people = (state.people || []).filter((p) => p && p.status !== 'archived'
    && (!Array.isArray(personIds) || personIds.includes(p.id)));
  const allowed = new Set(people.map((p) => p.id));
  const queues = people.map((p) => personQueue(p));
  const queueById = new Map(queues.map((q) => [q.personId, q]));

  const meetingsByPerson = new Map();
  for (const meeting of state.oneOnOnes || []) {
    if (!allowed.has(meeting.personId)) continue;
    const list = meetingsByPerson.get(meeting.personId) || [];
    list.push(meeting);
    meetingsByPerson.set(meeting.personId, list);
  }

  const entries = (state.agendaEntries || [])
    .filter((e) => e && allowed.has(e.personId))
    .slice(0, AGENDA_LIMITS.scanCap)
    .map((entry) => {
      const meetings = meetingsByPerson.get(entry.personId) || [];
      const derived = entryStatus(entry, meetings, now);
      const person = people.find((p) => p.id === entry.personId) || null;
      return {
        id: entry.id,
        personId: entry.personId,
        personName: person?.name || 'Unknown person',
        prompt: entry.prompt,
        family: entry.family || classifyTopic(entry.prompt).family,
        owedTo: entry.owedTo || classifyTopic(entry.prompt).owedTo,
        filedOn: entry.filedOn || null,
        filedBySeatId: entry.filedBySeatId || null,
        sourceKind: entry.sourceKind || 'manual',
        sourceId: entry.sourceId || null,
        note: entry.note || '',
        status: derived.status,
        statusTone: agendaStatusTone(derived.status),
        raisedOn: derived.raisedOn,
        raisedVia: derived.raisedVia,
        meetingId: derived.meetingId,
        ageDays: derived.days,
        stillQueued: Boolean(queueById.get(entry.personId)?.rows.some((r) => r.text.toLowerCase() === String(entry.prompt).toLowerCase())),
      };
    })
    .sort((a, z) => String(z.filedOn || '').localeCompare(String(a.filedOn || '')) || String(a.id).localeCompare(String(z.id)));

  const countBy = (list, fn) => list.filter(fn).length;
  const open = entries.filter((e) => e.status === 'open' || e.status === 'stale');
  const raised = entries.filter((e) => e.status === 'raised');
  const dropped = entries.filter((e) => e.status === 'dropped');
  const closed = entries.filter((e) => e.status === 'closed');
  const receiptN = raised.length + dropped.length;
  const receipt = receiptN >= AGENDA_LIMITS.receiptFloor
    ? wilsonInterval(raised.length, receiptN)
    : null;

  const totals = {
    queue: queues.reduce((n, q) => n + q.total, 0),
    personRaised: queues.reduce((n, q) => n + q.personRaised, 0),
    engine: queues.reduce((n, q) => n + q.engine, 0),
    self: queues.reduce((n, q) => n + q.self, 0),
    above: queues.reduce((n, q) => n + q.above, 0),
    both: queues.reduce((n, q) => n + q.both, 0),
    unclassified: queues.reduce((n, q) => n + q.unclassified, 0),
    atCap: queues.filter((q) => q.atCap).map((q) => q.personId),
    filedOpen: countBy(entries, (e) => e.status === 'open'),
    filedStale: countBy(entries, (e) => e.status === 'stale'),
    filedRaised: raised.length,
    filedDropped: dropped.length,
    filedClosed: closed.length,
    receiptN,
    receiptRatePct: receipt ? Math.round(receipt.p * 1000) / 10 : null,
    receiptLowPct: receipt ? Math.round(receipt.low * 1000) / 10 : null,
    receiptHighPct: receipt ? Math.round(receipt.high * 1000) / 10 : null,
    receiptFloor: AGENDA_LIMITS.receiptFloor,
  };

  return { queues, entries, totals, personIds: people.map((p) => p.id), now: dayKey(now), week: weekKey(now) };
}

/**
 * The projected agenda for ONE person — the surface the lead actually reads
 * forty minutes before the conversation.
 *
 * Order is a declared policy, not a preference:
 *   1. their own topics (the thing the product was burying),
 *   2. obligations the leader owes THEM, oldest first,
 *   3. bilateral obligations,
 *   4. the leader's own span duties, LAST and visibly separated, with a printed
 *      instruction not to turn them into a performance conversation.
 *
 * Every line carries why it is here and what happens if it is skipped.
 */
export function buildAgendaPlan(state, personId, { now = new Date(), settings = null } = {}) {
  const person = (state.people || []).find((p) => p.id === personId) || null;
  if (!person) return { missing: true };
  const queue = personQueue(person);
  const ledger = buildAgendaLedger(state, { personIds: [personId], now, settings });
  const meetings = (state.oneOnOnes || []).filter((m) => m.personId === personId);
  const lastHeld = meetings.filter((m) => m.status === 'held')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;

  const filedForPerson = ledger.entries.filter((e) => e.personId === personId);
  const filedByPrompt = new Map(filedForPerson.map((e) => [String(e.prompt).toLowerCase(), e]));

  const lines = queue.rows.map((row) => {
    const filed = filedByPrompt.get(String(row.text).toLowerCase()) || null;
    const group = !row.engine ? 'theirs'
      : row.owedTo === AGENDA_OWED.SELF ? 'owed-them'
        : row.owedTo === AGENDA_OWED.BOTH ? 'bilateral'
          : row.owedTo === AGENDA_OWED.ABOVE ? 'yours'
            : 'unclassified';
    return {
      ...row,
      group,
      filed,
      willBeEvicted: row.evictionRisk,
      line: row.text,
    };
  });

  const GROUP_ORDER = { theirs: 0, 'owed-them': 1, bilateral: 2, unclassified: 3, yours: 4 };
  const GROUP_LABEL = {
    theirs: 'They raised it',
    'owed-them': 'You owe them this',
    bilateral: 'You both owe this',
    unclassified: 'Untagged — provenance unknown',
    yours: 'Your own span duty (not their conversation)',
  };
  const GROUP_NOTE = {
    theirs: 'Their agenda comes first. This is the line that the engine prompts were burying.',
    'owed-them': 'A conversation you owe them. Oldest first: the prompt most at risk of eviction is the one you have been carrying longest.',
    bilateral: 'A commitment between you. Both sides carry the obligation.',
    unclassified: 'This ledger cannot classify this prompt. It is counted in the queue, not silently treated as theirs.',
    yours: 'Owed by you to your own span. Keep it out of the performance conversation — the framework this family names is a structural reading, not a judgement of them.',
  };

  const ordered = lines.slice().sort((a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || (a.index - b.index));
  const groups = ['theirs', 'owed-them', 'bilateral', 'unclassified', 'yours']
    .map((key) => ({
      key,
      label: GROUP_LABEL[key],
      note: GROUP_NOTE[key],
      rows: ordered.filter((r) => r.group === key),
    }))
    .filter((g) => g.rows.length);

  const evictable = lines.filter((r) => r.willBeEvicted);
  return {
    person,
    queue,
    groups,
    ordered: ordered.slice(0, AGENDA_LIMITS.planCap),
    lastHeldOn: lastHeld?.date || null,
    evictable,
    atCap: queue.atCap,
    // The printed warning the lead has never seen: what the cap is about to eat.
    capWarning: queue.atCap
      ? `This list is at its ${AGENDA_LIMITS.queueCap}-prompt cap. The engine truncates from the OLDEST end, so “${(queue.rows[0]?.text || '').slice(0, 80)}” is the line about to disappear without anyone deciding it should.`
      : null,
    filedCount: filedForPerson.length,
    openFiled: filedForPerson.filter((e) => e.status === 'open' || e.status === 'stale').length,
    totals: ledger.totals,
  };
}

/**
 * The span's own queue discipline: how much of the leader's detail boundary is
 * a pile of engine prompts no human ever looked at.
 *
 * Two measures, both refusal-honest:
 *  - QUEUE PRESSURE: engine prompts / total queue. This is the share of the
 *    span's 1:1 preparation that the leader did not author.
 *  - RECEIPT RATE: filed lines that were actually raised / filed lines that
 *    have had a fair chance. Refused below the floor rather than printed on two.
 */
export function agendaSpanReading(state, { personIds, now = new Date(), settings = null } = {}) {
  const ledger = buildAgendaLedger(state, { personIds, now, settings });
  const t = ledger.totals;
  const pressure = wilsonInterval(t.engine, t.queue);
  const byPerson = ledger.queues.map((q) => ({
    personId: q.personId,
    total: q.total,
    theirs: q.personRaised,
    engine: q.engine,
    owedThem: q.self,
    yours: q.above,
    unclassified: q.unclassified,
    atCap: q.atCap,
  }));
  return {
    span: (personIds || []).length,
    reading: {
      queueN: t.queue,
      personRaisedN: t.personRaised,
      engineN: t.engine,
      owedSelfN: t.self,
      owedAboveN: t.above,
      owedBothN: t.both,
      unclassifiedN: t.unclassified,
      atCapN: t.atCap.length,
      pressurePct: pressure ? Math.round(pressure.p * 1000) / 10 : null,
      pressureLowPct: pressure ? Math.round(pressure.low * 1000) / 10 : null,
      pressureHighPct: pressure ? Math.round(pressure.high * 1000) / 10 : null,
      filedOpenN: t.filedOpen,
      filedStaleN: t.filedStale,
      filedRaisedN: t.filedRaised,
      filedDroppedN: t.filedDropped,
      receiptN: t.receiptN,
      receiptRatePct: t.receiptRatePct,
      receiptLowPct: t.receiptLowPct,
      receiptHighPct: t.receiptHighPct,
      receiptFloor: t.receiptFloor,
    },
    byPerson,
    refusals: [
      pressure ? null : { code: 'pressure-empty', reason: 'No prompt stands on any waiting list in this span, so there is no share to print. An empty queue is not a clean queue: it may mean nobody has written one down.' },
      t.receiptN >= AGENDA_LIMITS.receiptFloor ? null
        : { code: 'receipt-thin', reason: `${t.receiptN} filed line(s) have had a fair chance to be raised; ${AGENDA_LIMITS.receiptFloor} are required before a receipt rate is printed. Refused rather than faked.` },
    ].filter(Boolean),
  };
}

/**
 * What the leader's OWN leader sees. Identity-bearing below director rank and
 * counts only above it — the discipline the rest of the product already keeps.
 */
export function agendaRollUp(state, { personIds, rank, now = new Date(), settings = null } = {}) {
  const span = agendaSpanReading(state, { personIds, now, settings });
  const identityFree = Number(rank) >= 4;
  return {
    identityFree,
    rank,
    reading: span.reading,
    refusals: span.refusals,
    rows: identityFree ? [] : span.byPerson,
    byPerson: identityFree ? null : span.byPerson,
    note: identityFree
      ? 'Above director rank this reading is identity-free: counts, shares and refusals only. No prompt text, no person and no conversation detail travels up — a 1:1 waiting list is individual detail, and the quarterly report it becomes must never carry one.'
      : 'Inside your own detail boundary: prompts and people are named, because you are the leader who will hold the conversation.',
  };
}

/** The upward one-paragraph brief, identity-free by construction. */
export function agendaBrief(state, { personIds, now = new Date(), settings = null } = {}) {
  const span = agendaSpanReading(state, { personIds, now, settings });
  const r = span.reading;
  const pct = (v) => (v === null ? 'refused' : `${v}%`);
  const lines = [
    `1:1 agenda discipline for this span, ${dayKey(now)}: ${r.queueN} prompt(s) stand on ${span.span} waiting list(s).`,
    `${r.personRaisedN} were raised by the people themselves; ${r.engineN} are engine-authored prompts (${pct(r.pressurePct)}, 95% Wilson ${pct(r.pressureLowPct)}–${pct(r.pressureHighPct)}).`,
    `Of the engine prompts, ${r.owedSelfN} are owed to the person, ${r.owedBothN} are bilateral and ${r.owedAboveN} are the leader's own span duties filed on a person who owes nothing.`,
  ];
  if (r.unclassifiedN) lines.push(`${r.unclassifiedN} prompt(s) could not be classified and are counted, not credited.`);
  if (r.atCapN) lines.push(`${r.atCapN} waiting list(s) sit at the 12-prompt cap, where the engine truncates from the oldest end.`);
  if (r.receiptRatePct === null) lines.push(`Receipt rate ${pct(r.receiptRatePct)}: ${span.refusals.find((x) => x.code === 'receipt-thin')?.reason || 'not enough filed lines with a fair chance yet.'}`);
  else lines.push(`Receipt rate ${r.receiptRatePct}% (95% Wilson ${r.receiptLowPct}–${r.receiptHighPct}%): of ${r.receiptN} filed prompts that had a fair chance to be raised, ${r.filedRaisedN} were actually raised in a held 1:1 and ${r.filedDroppedN} were not.`);
  return lines.join(' ');
}

/** Aggregate-only CSV rows. BLANK, never zero, where a figure is refused. */
export function agendaCsvRows(state, { personIds, rank, now = new Date(), settings = null } = {}) {
  const span = agendaSpanReading(state, { personIds, now, settings });
  const r = span.reading;
  const n = (v) => (v === null || v === undefined ? '' : String(v));
  return [{
    row_kind: 'agenda-span',
    scope: Number(rank) >= 4 ? 'aggregate' : 'span',
    queue_n: n(r.queueN),
    person_raised_n: n(r.personRaisedN),
    engine_n: n(r.engineN),
    owed_self_n: n(r.owedSelfN),
    owed_above_n: n(r.owedAboveN),
    owed_both_n: n(r.owedBothN),
    unclassified_n: n(r.unclassifiedN),
    filed_open_n: n(r.filedOpenN),
    filed_overdue_n: '',
    filed_stale_n: n(r.filedStaleN),
    filed_raised_n: n(r.filedRaisedN),
    filed_dropped_n: n(r.filedDroppedN),
    receipt_rate_pct: n(r.receiptRatePct),
    receipt_low_pct: n(r.receiptLowPct),
    receipt_high_pct: n(r.receiptHighPct),
    queue_pressure_pct: n(r.pressurePct),
    queue_pressure_low_pct: n(r.pressureLowPct),
    queue_pressure_high_pct: n(r.pressureHighPct),
    withheld: span.refusals.map((x) => x.code).join('|'),
  }];
}

/**
 * Attention count for the sidebar badge: stale filed lines plus spans at the
 * queue cap. Deliberately small — a badge that always shows a number is noise.
 */
export function agendaAttentionCount(state, { personIds = null, now = new Date() } = {}) {
  const ledger = buildAgendaLedger(state, { personIds, now });
  return ledger.totals.filedStale + ledger.totals.atCap.length;
}
