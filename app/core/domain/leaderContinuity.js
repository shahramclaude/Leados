/**
 * app/core/domain/leaderContinuity.js — the Leader Continuity Drill
 * (Schema v45, ADR-0032).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * LeadOS models the resilience of services, vendors and stewards (Schema v29),
 * the capacity of the team (v15/v33), and the succession readiness of seats
 * (v9). It never modelled the single point of failure the whole workspace
 * depends on: *the leader*. If the person holding six undecided calls, four
 * overdue conversations, two veto stakeholders and a high-priority risk review
 * is ill for a fortnight, nothing in the product could say what stops, what
 * costs money, or who could hold it — because no surface had ever asked.
 *
 * Existing continuity drill thinking (ISO 22301 business-impact analysis,
 * ITIL/ISO 27031 continuity tests) is applied to an organisation's *services*.
 * Succession tools assess seats. Neither answers the manager's real question
 * before a holiday, a hospital stay or a sabbatical: "what breaks if I am not
 * there, and what is the smallest hand-over that prevents it?"
 *
 * NAMED, CITED IDEAS (product doctrine §0.2)
 * ------------------------------------------
 *  - Business-impact analysis (ISO 22301; ISO 27031): a demand inventory with
 *    an explicit maximum tolerable disruption and an owner, not a gut list.
 *  - DACI decision rights (Bain; used across LeadOS): the hand-over unit is a
 *    *right* (own / agree / recommend / act-inform), not a title.
 *  - Minimum set cover (Karp, 1972; Chvátal, 1979 greedy ln n + 1 bound):
 *    choose the smallest set of briefings that covers every critical item.
 *    Solved exactly by branch and bound on small instances, with the greedy
 *    solution and the optimality proof retained as the fallback.
 *  - Poisson-binomial convolution (Poisson, 1837; exact DP): with independent
 *    per-item stall probabilities the distribution of "how many things stall"
 *    is exact, not sampled. A seeded Monte Carlo is run alongside it for the
 *    aggregate money tail and the two are cross-checked in the test suite.
 *  - Coherent tail risk (Artzner et al., 1999; Rockafellar & Uryasev, 2000):
 *    expected shortfall at 90% per currency, never summed across currencies.
 *  - Brier (1950) score and Brier skill score (Murphy, 1973): the drill is the
 *    out-of-sample test of this module's own stall probabilities. A negative
 *    skill score is reported as such; it is not smoothed away.
 *  - Critical-chain buffer thinking (Goldratt, 1997): the plan is priced in
 *    *setup minutes*, the leader's scarcest resource before an absence.
 *
 * HONESTY BOUNDARIES ENFORCED IN CODE
 * -----------------------------------
 *  - The demand inventory is derived from dated records only. No calendar
 *    scraping, no message monitoring, no inferred "busy-ness".
 *  - Money is reported only where the workspace already records a currency
 *    amount. Unpriced items are counted and never assigned a synthetic value;
 *    the exposure total says which share of critical items it covers.
 *  - Deputy "fit" is recorded evidence (completed authority, readiness rating,
 *    a recorded relationship, current commitments). It is a cover-planning
 *    input, never a performance score, never exported, never compared across
 *    people in the UI.
 *  - Some work is deliberately NOT delegable (a 1:1 conversation, an
 *    irreversible high-value call). Those items are shown as "must move before
 *    you go or accept the stall" rather than covered on paper.
 *  - Stall probabilities are an explicit independence-based model of *coverage*,
 *    not a measured failure rate. Until drills are scored this is a scenario,
 *    and the UI says so. The drill ledger is what turns it into evidence.
 *  - A drill is scored against the probabilities frozen when it was opened.
 *    Observed stalls are a human record; the app never infers them.
 *
 * Pure module: no DOM, no storage, no network, no wall-clock globals. The
 * caller supplies `now`, `horizonDays` and the seed.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import { createSeededRng } from './simulation.js';
import { computeFmea, isCaseOpen } from './cases.js';
import { dueMeetings } from './oneonone.js';

export const CONTINUITY_ENGINE_VERSION = 'leader-continuity-2026.10-v2';
export const CONTINUITY_DEFAULT_HORIZON_DAYS = 14;
export const CONTINUITY_MIN_FIT_PCT = 50;
export const CONTINUITY_CRITICAL = 3;
export const CONTINUITY_SEED = 20261028;
export const CONTINUITY_TRIALS = 4000;
export const CONTINUITY_MIN_DRILLS = 3;
export const CONTINUITY_MIN_SCORED_ITEMS = 5;
export const CONTINUITY_MAX_PREDICTIONS = 60;
export const CONTINUITY_MAX_LINK_ITEMS = 6;
/** Schema v46 stress conventions. Printed next to every number they move. */
export const CONTINUITY_COMMON_CAUSE_PCT = 25;
export const CONTINUITY_SECOND_SHOCK_PCT = 10;
export const CONTINUITY_INDIVIDUAL_ABSENCE_PCT = 8;
export const CONTINUITY_BACKUP_FIT_DISCOUNT = 0.75;
export const CONTINUITY_MAX_STRESS_DEPUTIES = 3;

/** The stall classes. A class is *what the leader's presence is doing*. */
export const CONTINUITY_KINDS = Object.freeze(['decides', 'reviews', 'unblocks', 'converses', 'engages', 'guards']);

export const CONTINUITY_KIND_LABELS = Object.freeze({
  decides: 'Decide',
  reviews: 'Review',
  unblocks: 'Unblock',
  converses: 'Conversation',
  engages: 'Stakeholder contact',
  guards: 'Oversight',
});

export const CONTINUITY_DELEGABILITY_LABELS = Object.freeze({
  delegable: 'Delegable',
  shared: 'Shared',
  held: 'Held — cannot be delegated',
});

/** Setup minutes are an explicit convention, rendered in the UI. */
export const CONTINUITY_SETUP_MINUTES = Object.freeze({
  decides: 45,
  reviews: 25,
  unblocks: 15,
  converses: 30,
  engages: 20,
  guards: 30,
});

export const CONTINUITY_RULE_IDS = Object.freeze({
  COVER: 'RULE-LCS-01',
  DRILL: 'RULE-LCS-02',
  STRUCTURAL: 'RULE-LCS-03',
  EXECUTION: 'RULE-LCS-04',
});

export const CONTINUITY_RULES = Object.freeze([
  {
    id: 'RULE-LCS-01',
    name: 'Commissioned hand-over cover → authority decision, deputy delegations, typed links and blameless prompts',
    framework: 'DACI decision rights + minimum set cover (Karp, 1972; Chvátal, 1979)',
    trigger: 'continuity.cover.requested',
    targetModule: 'decisions / delegations / links / people',
    description:
      'Recomputes the cover plan from the draft, refuses a stale plan key, then opens exactly one DACI hand-over decision, up to four owned deputy delegations with explicit authority, typed links to every covered source record and at most one blameless prompt per deputy. Never rewrites or hides a source record.',
  },
  {
    id: 'RULE-LCS-02',
    name: 'Drill result → calibration decision when the stall model misses',
    framework: 'Brier (1950) score, Brier skill score (Murphy, 1973) and Deming PDCA',
    trigger: 'continuity.drill.closed',
    targetModule: 'decisions / links',
    description:
      'At three or more closed drills, a non-positive Brier skill score or an observed stall outside the frozen prediction opens at most one DACI decision offering rebase, re-scope, shorten the absence, or accept and record. The observed record is never altered.',
  },
  {
    id: 'RULE-LCS-03',
    name: 'Structural single-point-of-failure → one decision',
    framework: 'ISO 22301 business-impact analysis & critical-chain buffer thinking (Goldratt, 1997)',
    trigger: 'continuity.cover.requested / continuity.drill.closed / continuity.scan',
    targetModule: 'decisions / links',
    description:
      'Two or more critical items that convention says cannot be delegated, and no open structural decision, opens exactly one DACI decision about permanently moving decision rights, not about working harder during the absence.',
  },
  {
    id: 'RULE-LCS-04',
    name: 'Returned cover or implementation drop → backup deputy handoff, cover-gap escalation and AAR draft',
    framework: 'Principal-agent incomplete contracts (Holmström, 1979; Grossman & Hart, 1986), DoWhy causal mechanism separation & US Army AAR',
    trigger: 'delegation.returned / continuity.drill.closed / continuity.scan',
    targetModule: 'delegations / decisions / retros / people / links',
    description:
      'When a deputy returns a commissioned cover delegation, re-allocates the covered obligations to the next eligible deputy at the 75% fallback fit convention (or opens one DACI cover-gap decision when no deputy clears the floor). When a drill or window closes with implementation drops or paper-only completion, drafts one pre-filled After-Action Review and one owned ritual-fix delegation so execution drops are never misdiagnosed as probability-model error.',
  },
]);

/* ------------------------------------------------------------------ helpers */

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function sameName(a, b) {
  const x = lower(a);
  const y = lower(b);
  return Boolean(x) && x === y;
}

function titleOf(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function openDelegationCount(state, personId) {
  return (state.delegations || []).filter((row) => row.personId === personId && row.status === 'active').length;
}

function linksTouching(state, type, id) {
  const out = [];
  for (const link of state.links || []) {
    if (link.sourceType === type && link.sourceId === id) out.push({ type: link.targetType, id: link.targetId });
    else if (link.targetType === type && link.targetId === id) out.push({ type: link.sourceType, id: link.sourceId });
  }
  return out;
}

/* ------------------------------------------------------- demand inventory */

/**
 * One demand item = one thing the leader's presence is doing, with a dated
 * trigger inside the absence window. `key` is stable and is what a drill
 * freezes, so a closure can be scored later without copying titles.
 */
function item({ stallKind, sourceType, sourceId, title, route, dueOn, criticality, basis, delegability, holdReason = '', money = null, personId = null }) {
  return {
    key: `${stallKind}|${sourceType}|${sourceId}`,
    stallKind,
    sourceType,
    sourceId,
    title: titleOf(title),
    route,
    dueOn,
    criticality: clampInt(criticality, 1, 5, 2),
    criticalityBasis: basis.filter(Boolean),
    delegability,
    holdReason,
    money,
    personId,
  };
}

function decisionItems(state, { windowEnd, todayStr, settings, leaderName }) {
  const out = [];
  const bigBet = num(settings?.tempoBigBetValue) ?? 50000;
  for (const d of state.decisions || []) {
    if (!d || !d.id || !d.title) continue;
    const isOpen = !d.chosen;
    const pendingReview = Boolean(d.chosen) && !d.reviewedOn && d.reviewOn;
    if (!isOpen && !pendingReview) continue;
    const leaderDrives = sameName(d.driver, leaderName) || (!d.driver && isOpen);
    const leaderApproves = sameName(d.approver, leaderName);
    // Only the leader's own calls are in the leader's absence inventory. An
    // open decision driven by a deputy is the deputy's work, not a stall.
    if (!leaderDrives && !leaderApproves && !isOpen) continue;
    const reviewDays = num(settings?.decisionReviewDays) ?? 14;
    const rawDue = pendingReview ? d.reviewOn : d.reviewOn || addDays(d.date || todayStr, reviewDays);
    const dueOn = rawDue && rawDue < todayStr ? todayStr : rawDue;
    if (!dueOn || dueOn > windowEnd) continue;
    const moneyAmount = num(d.valueAtStakeOverride);
    const basis = [];
    let criticality = isOpen ? 2 : 1;
    if (d.reversibility === 'irreversible') { criticality += 1; basis.push('Recorded as irreversible'); }
    if (moneyAmount !== null && moneyAmount >= bigBet) {
      criticality += 1;
      basis.push(`Value at stake ${String(d.currency || 'USD')} ${moneyAmount.toLocaleString('en-US')} ≥ the ${bigBet.toLocaleString('en-US')} big-bet convention`);
    }
    const touched = linksTouching(state, 'decision', d.id);
    if (touched.length >= 2) { criticality += 1; basis.push(`${touched.length} typed links: other work depends on this call`); }
    if (isOpen) basis.push(`Undecided since ${d.date || 'an unrecorded date'}`);
    else basis.push(`Outcome review due ${dueOn}`);
    const held = isOpen && d.reversibility === 'irreversible' && moneyAmount !== null && moneyAmount >= bigBet;
    out.push(item({
      stallKind: isOpen ? 'decides' : 'reviews',
      sourceType: 'decision',
      sourceId: d.id,
      title: d.title,
      route: `#/decisions?decision=${encodeURIComponent(d.id)}`,
      dueOn,
      criticality,
      basis,
      delegability: held ? 'held' : d.reversibility === 'irreversible' ? 'shared' : 'delegable',
      holdReason: held ? 'Irreversible call above the big-bet threshold: the accountable human must choose.' : '',
      money: moneyAmount !== null && moneyAmount > 0 ? { currency: String(d.currency || 'USD'), amount: moneyAmount, basis: 'Recorded value at stake' } : null,
    }));
  }
  return out;
}

function caseItems(state, { windowEnd, todayStr }) {
  const out = [];
  for (const c of state.cases || []) {
    if (!c || !c.id || !isCaseOpen(c) || !c.reviewOn) continue;
    const dueOn = c.reviewOn < todayStr ? todayStr : c.reviewOn;
    if (dueOn > windowEnd) continue;
    const fmea = computeFmea(c.fmea || {});
    const rated = Boolean(c.fmea && Number.isFinite(Number(c.fmea.severity)));
    const ap = fmea.actionPriority;
    const money = num(c.financial?.mostLikely);
    const basis = [
      rated ? `FMEA action priority ${ap} (severity ${fmea.severity}/10)` : 'Risk not rated — no priority arithmetic is assumed',
      `Oversight review due ${c.reviewOn}`,
    ];
    const shared = Boolean(c.ownerId) || (c.involvedPersonIds || []).length > 0;
    out.push(item({
      stallKind: 'guards',
      sourceType: 'case',
      sourceId: c.id,
      title: c.title,
      route: `#/cases/${c.id}`,
      dueOn,
      criticality: ap === 'high' ? 4 : ap === 'medium' ? 3 : 2,
      basis,
      delegability: shared ? 'shared' : 'held',
      holdReason: shared ? '' : 'No second steward is recorded on this case.',
      money: money !== null && money > 0 ? { currency: String(c.financial?.currency || 'USD'), amount: money, basis: 'Recorded most-likely exposure' } : null,
    }));
  }
  return out;
}

function conversationItems(state, { now, windowEnd, todayStr, settings }) {
  const out = [];
  for (const row of dueMeetings(state, now, settings)) {
    const person = row.person;
    const c = row.cadence;
    const rawDue = c.lastHeldDate ? addDays(c.lastHeldDate, c.expectedDays) : todayStr;
    const dueOn = rawDue < todayStr ? todayStr : rawDue;
    if (dueOn > windowEnd) continue;
    const basis = [c.status === 'never' ? 'No 1:1 has ever been logged' : `Last held ${c.lastHeldDate} against a ${c.expectedDays}-day cadence`];
    if (c.skippedStreak >= 2) basis.push(`${c.skippedStreak} consecutive moves or skips`);
    out.push(item({
      stallKind: 'converses',
      sourceType: 'person',
      sourceId: person.id,
      title: `1:1 with ${person.name}`,
      route: `#/people/${person.id}`,
      dueOn,
      criticality: c.status === 'overdue' && c.skippedStreak >= 2 ? 3 : 2,
      basis,
      delegability: 'held',
      holdReason: 'A management conversation is not a briefing. It is held or it is missed; it cannot be handed to a colleague as a task.',
      personId: person.id,
    }));
  }
  return out;
}

function delegationItems(state, { windowEnd, todayStr, settings }) {
  const out = [];
  const checkinDays = num(settings?.delegationCheckinDays) ?? 7;
  for (const d of state.delegations || []) {
    if (!d || !d.id || d.status !== 'active') continue;
    const lastCheckin = (d.checkins || []).map((c) => c.date).filter(Boolean).sort().pop() || d.delegatedOn;
    const cadenceDue = lastCheckin ? addDays(lastCheckin, checkinDays) : null;
    const rawDue = d.dueOn || cadenceDue;
    if (!rawDue) continue;
    const dueOn = rawDue < todayStr ? todayStr : rawDue;
    if (dueOn > windowEnd) continue;
    const latest = (d.checkins || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const blocked = latest?.progress === 'blocked';
    const overdueDays = daysBetween(rawDue, todayStr) ?? 0;
    const basis = [blocked ? 'Latest check-in is blocked' : `Owner check-in due ${rawDue}`];
    if (overdueDays > 7) basis.push(`${overdueDays} days past the recorded due date`);
    out.push(item({
      stallKind: 'unblocks',
      sourceType: 'delegation',
      sourceId: d.id,
      title: d.title,
      route: `#/delegations?delegation=${encodeURIComponent(d.id)}`,
      dueOn,
      criticality: blocked || overdueDays > 7 ? 3 : 2,
      basis,
      delegability: 'shared',
      holdReason: '',
      personId: d.personId || null,
    }));
  }
  return out;
}

function stakeholderItems(state, { windowEnd, todayStr }) {
  const out = [];
  for (const s of state.stakeholders || []) {
    if (!s || !s.id || s.status === 'archived' || !s.nextContactOn) continue;
    const salience = clampInt(s.power, 1, 5, 3);
    if (!(s.vetoPlayer || salience >= 4)) continue;
    const dueOn = s.nextContactOn < todayStr ? todayStr : s.nextContactOn;
    if (dueOn > windowEnd) continue;
    const basis = [`Recorded power ${salience}/5${s.vetoPlayer ? ' and a veto gate' : ''}`, `Next contact ${s.nextContactOn}`];
    out.push(item({
      stallKind: 'engages',
      sourceType: 'stakeholder',
      sourceId: s.id,
      title: `Contact ${s.name}`,
      route: `#/stakeholders/${s.id}`,
      dueOn,
      criticality: s.vetoPlayer && salience >= 5 ? 5 : salience >= 4 ? 3 : 2,
      basis,
      delegability: 'shared',
      holdReason: '',
      personId: s.personId || null,
    }));
  }
  return out;
}

function goalItems(state, { windowEnd, todayStr, settings }) {
  const out = [];
  const cadence = num(settings?.goalCheckinDays) ?? 14;
  for (const g of state.goals || []) {
    if (!g || !g.id || g.status !== 'active') continue;
    const last = (g.checkins || []).map((c) => c.date).filter(Boolean).sort().pop() || g.createdAt;
    const rawDue = last ? addDays(last, cadence) : g.dueDate;
    if (!rawDue) continue;
    const dueOn = rawDue < todayStr ? todayStr : rawDue;
    if (dueOn > windowEnd) continue;
    out.push(item({
      stallKind: 'reviews',
      sourceType: 'goal',
      sourceId: g.id,
      title: g.title,
      route: '#/goals',
      dueOn,
      criticality: 2,
      basis: [`Goal check-in due ${rawDue} against a ${cadence}-day convention`],
      delegability: 'shared',
      holdReason: '',
      personId: g.ownerId || null,
    }));
  }
  return out;
}

/**
 * The demand inventory: every dated obligation inside the window that the
 * leader's presence currently satisfies. Deterministic and deduplicated by key.
 */
export function leaderDemandInventory(state = {}, { now = new Date(), horizonDays = CONTINUITY_DEFAULT_HORIZON_DAYS, leaderName = null } = {}) {
  const settings = state.settings || {};
  const todayStr = dayKey(now);
  const horizon = clampInt(horizonDays, 1, 90, CONTINUITY_DEFAULT_HORIZON_DAYS);
  const windowEnd = addDays(todayStr, horizon);
  const resolvedLeader = titleOf(leaderName ?? settings.leaderName, 120);
  const ctx = { now, windowEnd, todayStr, settings, leaderName: resolvedLeader };
  const collected = [
    ...decisionItems(state, ctx),
    ...caseItems(state, ctx),
    ...conversationItems(state, ctx),
    ...delegationItems(state, ctx),
    ...stakeholderItems(state, ctx),
    ...goalItems(state, ctx),
  ];
  const seen = new Set();
  const items = [];
  for (const row of collected) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    items.push({
      ...row,
      dueInDays: daysBetween(todayStr, row.dueOn) ?? 0,
      overdueDays: Math.max(0, daysBetween(row.dueOn, todayStr) ?? 0),
    });
  }
  items.sort((a, b) => (b.criticality - a.criticality) || String(a.dueOn).localeCompare(String(b.dueOn)) || a.key.localeCompare(b.key));
  const byKind = Object.fromEntries(CONTINUITY_KINDS.map((k) => [k, 0]));
  for (const row of items) byKind[row.stallKind] += 1;
  const critical = items.filter((row) => row.criticality >= CONTINUITY_CRITICAL);
  const priced = critical.filter((row) => row.money);
  return {
    windowStart: todayStr,
    windowEnd,
    horizonDays: horizon,
    leaderName: resolvedLeader,
    items,
    byKind,
    counts: {
      total: items.length,
      critical: critical.length,
      held: items.filter((row) => row.delegability === 'held').length,
      criticalHeld: critical.filter((row) => row.delegability === 'held').length,
      pricedCritical: priced.length,
      unpricedCritical: critical.length - priced.length,
      overdue: items.filter((row) => row.overdueDays > 0).length,
    },
  };
}

/* --------------------------------------------------------------- deputies */

const LEVEL_WEIGHT = { manager: 32, lead: 30, senior: 25, ic: 18 };

/**
 * Recorded cover evidence per active person. Explicitly NOT a performance
 * score: it is the evidence that this person could hold *this* item, printed
 * component by component so the leader can reject it.
 */
export function buildDeputyPool(state = {}) {
  const people = (state.people || []).filter((p) => p && p.status !== 'archived' && p.name);
  return people.map((person) => {
    const completed = (state.delegations || []).filter((d) => d.personId === person.id && d.status === 'done');
    const highAuthority = completed.filter((d) => ['own', 'act-inform'].includes(d.authority)).length;
    const sharedAuthority = completed.filter((d) => ['agree', 'recommend'].includes(d.authority)).length;
    const readiness = (state.readiness || []).filter((r) => r.personId === person.id);
    const readyNow = readiness.some((r) => r.rating === 'ready-now');
    const readyLater = readiness.some((r) => r.rating === 'ready-later');
    const open = openDelegationCount(state, person.id);
    return {
      personId: person.id,
      name: person.name,
      role: titleOf(person.role, 80),
      level: person.level || 'ic',
      team: titleOf(person.team, 60),
      roleSeats: readiness.map((r) => titleOf(r.seat, 60)).slice(0, 3),
      evidence: {
        completedDelegations: completed.length,
        highAuthorityCompletions: highAuthority,
        sharedAuthorityCompletions: sharedAuthority,
        readyNow,
        readyLater,
        openCommitments: open,
      },
      availability: round(1 - Math.min(0.5, Math.max(0, open - 1) * 0.1), 2),
    };
  });
}

/**
 * Fit is computed per item because a deputy who can hold a stakeholder cadence
 * may be the wrong person to hold a decision right. Components are returned so
 * the UI can print why.
 */
export function deputyFitForItem(itemRow, deputy, state = {}) {
  if (!itemRow || !deputy) return { fit: 0, components: [] };
  const components = [];
  const levelScore = LEVEL_WEIGHT[deputy.level] ?? 8;
  components.push({ label: 'Recorded level', value: levelScore, detail: deputy.level || 'not recorded' });
  const authorityScore = Math.min(24, deputy.evidence.highAuthorityCompletions * 12 + deputy.evidence.sharedAuthorityCompletions * 6);
  if (authorityScore) components.push({ label: 'Completed authority', value: authorityScore, detail: `${deputy.evidence.highAuthorityCompletions} high-authority, ${deputy.evidence.sharedAuthorityCompletions} shared-authority completions` });
  // A recorded decision driver/approver already holds decision rights in this
  // workspace. That is stronger evidence for a `decides` item than a title is.
  if (itemRow.stallKind === 'decides' || itemRow.stallKind === 'reviews') {
    const driven = (state.decisions || []).filter((d) => d && (sameName(d.driver, deputy.name) || sameName(d.approver, deputy.name))).length;
    if (driven) components.push({ label: 'Recorded decision rights', value: Math.min(25, 15 + (driven - 1) * 5), detail: `${driven} decision(s) record this person as driver or approver` });
  }
  if (itemRow.sourceType === 'case') {
    const source = (state.cases || []).find((c) => c && c.id === itemRow.sourceId);
    if (source && (source.ownerId === deputy.personId || (source.involvedPersonIds || []).includes(deputy.personId))) {
      components.push({ label: 'Recorded on the case', value: 25, detail: source.ownerId === deputy.personId ? 'Recorded case owner' : 'Recorded as involved in this case' });
    }
  }
  const readinessScore = deputy.evidence.readyNow ? 25 : deputy.evidence.readyLater ? 15 : 0;
  if (readinessScore) components.push({ label: 'Succession evidence', value: readinessScore, detail: deputy.evidence.readyNow ? 'Assessed ready now for a recorded seat' : 'Assessed ready later for a recorded seat' });
  if (itemRow.sourceType === 'stakeholder') {
    const stakeholder = (state.stakeholders || []).find((s) => s.id === itemRow.sourceId);
    // A person cannot cover contact with themselves. Without this rule the
    // stakeholder's own record made them the "best deputy" for their own
    // contact item, which is both absurd and invisible in the plan.
    if (stakeholder && deputy.personId && stakeholder.personId === deputy.personId) {
      return { fit: 0, components: [{ label: 'Is the stakeholder', value: 0, detail: 'A person cannot cover contact with themselves' }] };
    }
    // Otherwise relationship credit needs a *typed link* that was recorded
    // deliberately; a name appearing in a free-text field is not evidence.
    const linked = (state.links || []).some((link) => link
      && link.sourceType === 'stakeholder' && link.sourceId === itemRow.sourceId
      && link.targetType === 'person' && link.targetId === deputy.personId);
    if (linked) components.push({ label: 'Recorded relationship', value: 30, detail: 'A typed stakeholder → person link records this relationship' });
  }
  if (itemRow.personId && itemRow.personId === deputy.personId && itemRow.stallKind === 'unblocks') {
    components.push({ label: 'Owns the work', value: 15, detail: 'The stalled delegation is already theirs' });
  }
  if (itemRow.personId && itemRow.personId !== deputy.personId) {
    const subject = (state.people || []).find((p) => p.id === itemRow.personId);
    if (subject && deputy.team && subject.team && deputy.team === subject.team) {
      components.push({ label: 'Same team', value: 6, detail: 'Recorded on the same team' });
    }
  }
  const commitmentPenalty = Math.min(15, Math.max(0, deputy.evidence.openCommitments - 2) * 5);
  if (commitmentPenalty) components.push({ label: 'Current commitments', value: -commitmentPenalty, detail: `${deputy.evidence.openCommitments} active delegations already` });
  const raw = components.reduce((sum, c) => sum + c.value, 0);
  const fit = clampInt(raw, 0, 100, 0);
  return { fit, components };
}

/** Items convention says cannot be handed over are never given a deputy fit. */
export function eligibleDeputies(itemRow, deputies, { minFitPct = CONTINUITY_MIN_FIT_PCT, state = {} } = {}) {
  if (!itemRow || itemRow.delegability === 'held') return [];
  return deputies
    .map((deputy) => ({ deputy, ...deputyFitForItem(itemRow, deputy, state) }))
    .filter((row) => row.fit >= minFitPct)
    .sort((a, b) => b.fit - a.fit || a.deputy.personId.localeCompare(b.deputy.personId));
}

function bestCoverForItem(itemRow, deputies, minFitPct, state) {
  if (itemRow.delegability === 'held') return { pCover: 0, deputyId: null, fit: 0, availability: 0 };
  const eligible = eligibleDeputies(itemRow, deputies, { minFitPct, state });
  if (!eligible.length) return { pCover: 0, deputyId: null, fit: 0, availability: 0 };
  let best = { pCover: 0, deputyId: null, fit: 0, availability: 0 };
  for (const row of eligible) {
    const pCover = (row.fit / 100) * (row.deputy.availability ?? 1);
    if (pCover > best.pCover) best = { pCover, deputyId: row.deputy.personId, fit: row.fit, availability: row.deputy.availability };
  }
  return best;
}

/* ------------------------------------------------------------- simulation */

/** Exact Poisson-binomial distribution of the number of stalled items. */
export function stallCountDistribution(probabilities = []) {
  let dp = [1];
  for (const raw of probabilities) {
    const p = Math.min(1, Math.max(0, Number(raw) || 0));
    const next = new Array(dp.length + 1).fill(0);
    for (let k = 0; k < dp.length; k += 1) {
      next[k] += dp[k] * (1 - p);
      next[k + 1] += dp[k] * p;
    }
    dp = next;
  }
  return dp;
}

function quantileFromDistribution(dist, q) {
  const total = dist.reduce((s, v) => s + v, 0) || 1;
  let acc = 0;
  for (let k = 0; k < dist.length; k += 1) {
    acc += dist[k] / total;
    if (acc >= q - 1e-12) return k;
  }
  return dist.length - 1;
}

function tailFromSamples(values, alpha = 0.9) {
  if (!values.length) return { mean: 0, p90: 0, cvar90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(alpha * sorted.length) - 1)];
  const tailStart = Math.max(0, Math.floor(alpha * sorted.length));
  const tail = sorted.slice(tailStart);
  const cvar90 = tail.length ? tail.reduce((s, v) => s + v, 0) / tail.length : p90;
  return { mean: round(mean, 2), p90: round(p90, 2), cvar90: round(cvar90, 2) };
}

/**
 * What happens to the window if the leader is unavailable.
 *
 * Counts come from the exact Poisson-binomial convolution. Money is aggregated
 * by seeded Monte Carlo for the tail (expected shortfall), per currency, and
 * is *only* computed over items that record an amount. The independence
 * assumption is printed by the UI and is not a claim about real outages.
 */
export function simulateLeaderAbsence(inventory, deputies, {
  minFitPct = CONTINUITY_MIN_FIT_PCT,
  seed = CONTINUITY_SEED,
  trials = CONTINUITY_TRIALS,
  state = {},
} = {}) {
  const items = inventory?.items || [];
  const windows = items.map((row) => ({ row, ...bestCoverForItem(row, deputies, minFitPct, state) }));
  const perItem = windows.map((w) => ({
    key: w.row.key,
    stallKind: w.row.stallKind,
    sourceType: w.row.sourceType,
    sourceId: w.row.sourceId,
    criticality: w.row.criticality,
    delegability: w.row.delegability,
    dueOn: w.row.dueOn,
    pStall: round(1 - w.pCover, 4),
    deputyId: w.deputyId,
    deputyFit: w.fit,
    exposed: Boolean(w.row.money),
    money: w.row.money,
  })).sort((a, b) => b.pStall - a.pStall || b.criticality - a.criticality || a.key.localeCompare(b.key));
  const probabilities = perItem.map((row) => row.pStall);
  const dist = stallCountDistribution(probabilities);
  const expected = perItem.reduce((s, row) => s + row.pStall, 0);
  const currencySet = [...new Set(perItem.filter((r) => r.money).map((r) => r.money.currency))].sort();
  const rng = createSeededRng(seed);
  const totals = Object.fromEntries(currencySet.map((c) => [c, []]));
  const stallCounts = [];
  for (let t = 0; t < trials; t += 1) {
    let count = 0;
    const byCurrency = Object.fromEntries(currencySet.map((c) => [c, 0]));
    for (const row of perItem) {
      if (rng() < row.pStall) {
        count += 1;
        if (row.money && byCurrency[row.money.currency] !== undefined) byCurrency[row.money.currency] += row.money.amount;
      }
    }
    stallCounts.push(count);
    for (const c of currencySet) totals[c].push(byCurrency[c]);
  }
  const expectedValue = {};
  for (const c of currencySet) expectedValue[c] = round(perItem.filter((r) => r.money?.currency === c).reduce((s, r) => s + r.money.amount * r.pStall, 0), 2);
  const tail = Object.fromEntries(currencySet.map((c) => [c, { ...tailFromSamples(totals[c]), expected: expectedValue[c] }]));
  const critical = perItem.filter((row) => row.criticality >= CONTINUITY_CRITICAL);
  return {
    engine: CONTINUITY_ENGINE_VERSION,
    seed,
    trials,
    minFitPct,
    perItem,
    probabilities,
    exact: {
      distribution: dist.map((p) => round(p, 6)),
      expectedStalled: round(expected, 2),
      p50: quantileFromDistribution(dist, 0.5),
      p80: quantileFromDistribution(dist, 0.8),
      p90: quantileFromDistribution(dist, 0.9),
      pNone: round(dist[0] ?? 0, 6),
    },
    monteCarlo: {
      mean: round(stallCounts.reduce((s, v) => s + v, 0) / Math.max(1, trials), 2),
      p50: [...stallCounts].sort((a, b) => a - b)[Math.min(trials - 1, Math.floor(trials * 0.5))] ?? 0,
      p90: [...stallCounts].sort((a, b) => a - b)[Math.min(trials - 1, Math.floor(trials * 0.9))] ?? 0,
    },
    tail,
    critical: {
      total: critical.length,
      expectedStalled: round(critical.reduce((s, row) => s + row.pStall, 0), 2),
      fullyUncovered: critical.filter((row) => row.pStall >= 0.999).length,
    },
    coveragePct: perItem.length ? round((perItem.reduce((s, row) => s + (1 - row.pStall), 0) / perItem.length) * 100, 1) : 0,
    assumptions: [
      'Items are treated as independent. A shared cause (one outage, one illness in a deputy) can stall several at once and is not modelled.',
      'Coverage is a model of deputy fit × recorded availability, not a measured historical failure rate.',
      'Only items with a recorded currency amount contribute to the money tail; the exposure line states how many critical items it covers.',
    ],
  };
}

/* ------------------------------------------------- correlated absence model */

/**
 * Annualising a one-window convention: an 8% chance of an individual absence in
 * a 14-day window compounds over a longer one. The exponent is the only place a
 * calendar appears, and it is the horizon the caller supplied.
 */
export function absenceProbability(horizonDays, basePct) {
  const base = Math.min(1, Math.max(0, Number(basePct) / 100 || 0));
  const spans = Math.max(1, Number(horizonDays) || 1) / CONTINUITY_DEFAULT_HORIZON_DAYS;
  return 1 - (1 - base) ** spans;
}

/**
 * The same absence, with the assumption the independent model cannot express:
 * a *shared cause* takes one recorded team offline at the same time, a deputy
 * may be away on their own, and when the primary deputy is gone the item falls
 * to the next-best eligible deputy at a discount rather than to nobody.
 *
 * Why the first fallback matters: without it the stress model reads
 * pCover = fit x availability, so one absent deputy is *better covered* than a
 * held item, and a "stress" test would report less exposure than the calm one.
 * Coverage here is fit x P(this deputy is at their desk), which behaves.
 *
 * This is a deterministic seeded Monte Carlo, not a measured outage or illness
 * rate. Its outputs are compared against the independent exact distribution so
 * the page can print how much *independence* is flattering the plan.
 */
export function simulateCorrelatedAbsence(inventory, deputies, {
  minFitPct = CONTINUITY_MIN_FIT_PCT,
  commonCausePct = CONTINUITY_COMMON_CAUSE_PCT,
  individualAbsencePct = CONTINUITY_INDIVIDUAL_ABSENCE_PCT,
  backupFitDiscount = CONTINUITY_BACKUP_FIT_DISCOUNT,
  seed = CONTINUITY_SEED,
  trials = CONTINUITY_TRIALS,
  state = {},
} = {}) {
  const items = inventory?.items || [];
  const q = Math.min(1, Math.max(0, Number(commonCausePct) / 100 || 0));
  const pIndividual = absenceProbability(inventory?.horizonDays, individualAbsencePct);
  const teams = [...new Set(deputies.map((d) => d.team).filter(Boolean))].sort();
  const eligibleByItem = items.map((item) => {
    if (item.delegability === 'held') return { item, eligible: [] };
    return { item, eligible: eligibleDeputies(item, deputies, { minFitPct, state }) };
  });
  const independentProbabilities = eligibleByItem.map(({ eligible }) => (eligible.length ? 1 - eligible[0].fit / 100 : 1));
  const independentDist = stallCountDistribution(independentProbabilities);
  const independentExpected = independentProbabilities.reduce((sum, p) => sum + p, 0);

  const rng = createSeededRng(seed ^ 0x5f356495);
  const currencySet = [...new Set(items.filter((row) => row.money).map((row) => row.money.currency))].sort();
  const stallCounts = [];
  const totals = Object.fromEntries(currencySet.map((c) => [c, []]));
  const stallHits = new Array(items.length).fill(0);
  let shockedTrials = 0;

  for (let t = 0; t < trials; t += 1) {
    const absent = new Set();
    if (deputies.length && rng() < q) {
      shockedTrials += 1;
      if (teams.length) {
        const team = teams[Math.floor(rng() * teams.length)];
        for (const deputy of deputies) if (deputy.team === team) absent.add(deputy.personId);
      } else {
        // No recorded teams: the only honest cluster is the whole deputy pool.
        for (const deputy of deputies) absent.add(deputy.personId);
      }
    }
    for (const deputy of deputies) if (rng() < pIndividual) absent.add(deputy.personId);
    let count = 0;
    const byCurrency = Object.fromEntries(currencySet.map((c) => [c, 0]));
    for (let i = 0; i < eligibleByItem.length; i += 1) {
      const { item, eligible } = eligibleByItem[i];
      let pStall = 1;
      if (eligible.length) {
        const primary = eligible[0];
        if (!absent.has(primary.deputy.personId)) {
          pStall = 1 - primary.fit / 100;
        } else {
          const backup = eligible.find((row) => !absent.has(row.deputy.personId));
          pStall = backup ? 1 - Math.min(100, backup.fit * backupFitDiscount) / 100 : 1;
        }
      }
      if (rng() < pStall) {
        count += 1;
        stallHits[i] += 1;
        if (item.money && byCurrency[item.money.currency] !== undefined) byCurrency[item.money.currency] += item.money.amount;
      }
    }
    stallCounts.push(count);
    for (const currency of currencySet) totals[currency].push(byCurrency[currency]);
  }

  const sorted = [...stallCounts].sort((a, b) => a - b);
  const at = (quantile) => sorted[Math.min(trials - 1, Math.floor(trials * quantile))] ?? 0;
  const mean = stallCounts.reduce((sum, v) => sum + v, 0) / Math.max(1, trials);
  const tail = Object.fromEntries(currencySet.map((currency) => {
    const sample = tailFromSamples(totals[currency]);
    return [currency, { ...sample, expected: round(items.filter((row) => row.money?.currency === currency).reduce((sum, row) => sum + row.money.amount * (stallHits[items.indexOf(row)] / Math.max(1, trials)), 0), 2) }];
  }));
  const lift = (after, before) => (before > 0 ? round(((after - before) / before) * 100, 1) : null);

  // A team-level shared cause is total when every deputy is on one team (or when
  // no team is recorded). Say that instead of letting a p90 equal to the item
  // count look like a modelling accident.
  const singleTeamPool = deputies.length > 0 && teams.length <= 1;
  return {
    engine: CONTINUITY_ENGINE_VERSION,
    seed,
    trials,
    cluster: {
      kind: teams.length ? 'team' : 'pool',
      teams: teams.length,
      singleTeamPool,
      label: singleTeamPool
        ? (teams.length ? `Every deputy is recorded on one team (${teams[0]}), so one shared cause removes all cover` : 'No deputy team is recorded, so one shared cause removes the whole pool')
        : `${teams.length} recorded teams; one of them is offline at a time`,
    },
    commonCausePct: round(q * 100, 1),
    individualAbsencePct: round(pIndividual * 100, 1),
    backupFitDiscount: round(backupFitDiscount * 100, 1),
    sharedShockTrials: shockedTrials,
    sharedShockPct: round((shockedTrials / Math.max(1, trials)) * 100, 1),
    mean: round(mean, 2),
    p50: at(0.5),
    p80: at(0.8),
    p90: at(0.9),
    pNone: round(stallCounts.filter((v) => v === 0).length / Math.max(1, trials), 4),
    tail,
    perItem: items.map((item, i) => ({
      key: item.key,
      stallRate: round(stallHits[i] / Math.max(1, trials), 4),
      independentPStall: round(independentProbabilities[i], 4),
    })),
    vsIndependent: {
      expectedStalled: round(independentExpected, 2),
      p50: quantileFromDistribution(independentDist, 0.5),
      p90: quantileFromDistribution(independentDist, 0.9),
      meanLiftPct: lift(mean, independentExpected),
      p90LiftPct: lift(at(0.9), quantileFromDistribution(independentDist, 0.9)),
    },
    assumptions: [
      `A shared cause takes one recorded team offline at once in ${round(q * 100, 1)}% of windows; this is a stress convention, not a measured outage rate.`,
      `An individual deputy is away for the whole window with probability ${round(pIndividual * 100, 1)}% on a ${inventory?.horizonDays ?? 14}-day horizon (8% per 14 days, compounded).`,
      `When the primary deputy is away, cover falls to the next eligible deputy at ${round(backupFitDiscount * 100, 1)}% of their recorded fit; with no second eligible deputy the item stalls.`,
      'The single-shock baseline models one team shared cause per window; the multi-shock & vendor common-mode contagion table extends this to two simultaneous shocks and cross-team dependency outages.',
      ...(singleTeamPool ? ['Because the whole deputy pool is recorded on one team, a shared cause here is total; use the deputy-unavailability stress to test a partial loss.'] : []),
    ],
  };
}

/**
 * Multi-shock & cross-team vendor/service dependency common-mode contagion
 * (ADR-0034).
 *
 * Extends the single-team correlated absence baseline to the two failure modes
 * left unmodelled in Session 68b:
 *   1. A second simultaneous independent shock (`secondShockPct`, default 10%)
 *      taking a second team (or highest-fit remaining deputy) offline inside
 *      the same absence window;
 *   2. A critical external vendor or upstream service dependency in
 *      `state.dependencies` (Schema v29) failing with a Simchi-Levi survival
 *      shortfall (`effectiveTTR > ttsDays`) and pulling every primary/backup
 *      steward in its downstream blast radius into incident recovery at once —
 *      cutting across team boundaries.
 *
 * Honesty boundary: active dependencies missing `annualFailureProb` or `ttrDays`
 * are never treated as 0% failure risk; they are surfaced in
 * `unmodeledDependencies`.
 */
export function vendorCommonModeContagion(inventory, deputies = [], {
  minFitPct = CONTINUITY_MIN_FIT_PCT,
  commonCausePct = CONTINUITY_COMMON_CAUSE_PCT,
  secondShockPct = CONTINUITY_SECOND_SHOCK_PCT,
  vendorShockPct = null,
  individualAbsencePct = CONTINUITY_INDIVIDUAL_ABSENCE_PCT,
  backupFitDiscount = CONTINUITY_BACKUP_FIT_DISCOUNT,
  seed = CONTINUITY_SEED,
  trials = CONTINUITY_TRIALS,
  state = {},
} = {}) {
  const items = inventory?.items || [];
  const horizonDays = Math.max(1, Number(inventory?.horizonDays) || CONTINUITY_DEFAULT_HORIZON_DAYS);
  const q1 = Math.min(1, Math.max(0, Number(commonCausePct) / 100 || 0));
  const q2 = Math.min(1, Math.max(0, Number(secondShockPct) / 100 || 0));
  const vendorOverride = vendorShockPct !== null && vendorShockPct !== undefined && vendorShockPct !== ''
    && Number.isFinite(Number(vendorShockPct))
    ? Math.min(1, Math.max(0, Number(vendorShockPct) / 100))
    : null;
  const pIndividual = absenceProbability(horizonDays, individualAbsencePct);
  const teams = [...new Set(deputies.map((d) => d.team).filter(Boolean))].sort();
  const deputyById = new Map(deputies.map((d) => [d.personId, d]));

  const eligibleByItem = items.map((item) => {
    if (item.delegability === 'held') return { item, eligible: [] };
    return { item, eligible: eligibleDeputies(item, deputies, { minFitPct, state }) };
  });
  const independentProbabilities = eligibleByItem.map(({ eligible }) => (eligible.length ? 1 - eligible[0].fit / 100 : 1));
  const independentDist = stallCountDistribution(independentProbabilities);
  const independentExpected = independentProbabilities.reduce((sum, p) => sum + p, 0);

  const singleShock = simulateCorrelatedAbsence(inventory, deputies, {
    minFitPct,
    commonCausePct,
    individualAbsencePct,
    backupFitDiscount,
    seed,
    trials,
    state,
  });

  // Trace active service/vendor dependencies and their downstream blast radius.
  const activeDeps = (state.dependencies || []).filter((d) => d && d.id && d.status !== 'retired');
  const downstreamById = new Map(activeDeps.map((d) => [d.id, []]));
  for (const dep of activeDeps) {
    for (const upId of Array.isArray(dep.upstreamIds) ? dep.upstreamIds : []) {
      if (downstreamById.has(upId) && upId !== dep.id) {
        downstreamById.get(upId).push(dep);
      }
    }
  }

  const unmodeledDependencies = [];
  const nodes = [];
  for (const root of activeDeps) {
    const ttr = num(root.ttrDays);
    const annualProb = num(root.annualFailureProb);
    const modelled = ttr !== null && ttr > 0 && annualProb !== null && annualProb >= 0;
    if (!modelled) {
      unmodeledDependencies.push({
        id: root.id,
        name: titleOf(root.name, 80),
        kind: root.kind || 'service',
        criticality: root.criticality || 'supporting',
        missing: ttr === null || ttr <= 0 ? 'ttrDays' : 'annualFailureProb',
      });
    }
    const baseOutage = Math.max(0, ttr ?? 0);
    // BFS over downstream dependents unless buffered by dual-active redundancy.
    const visited = new Set([root.id]);
    const queue = [root];
    const impactedNodes = [];
    let maxShortfallDays = 0;
    while (queue.length) {
      const curr = queue.shift();
      const sub = curr.substitutability || 'none';
      const warmDays = num(curr.warmSwitchDays);
      const effectiveOutage = sub === 'dual-active'
        ? 0
        : (sub === 'warm-standby' && warmDays !== null ? Math.min(baseOutage, Math.max(0, warmDays)) : baseOutage);
      const tts = Math.max(0, num(curr.ttsDays) ?? 0);
      const shortfall = Math.max(0, effectiveOutage - tts);
      if (shortfall > maxShortfallDays) maxShortfallDays = shortfall;
      if (shortfall > 0 || (curr.id === root.id && effectiveOutage > 0 && curr.criticality === 'critical')) {
        impactedNodes.push({ dep: curr, effectiveOutage, shortfall });
      }
      if (effectiveOutage > 0) {
        for (const child of downstreamById.get(curr.id) || []) {
          if (!visited.has(child.id)) {
            visited.add(child.id);
            queue.push(child);
          }
        }
      }
    }

    const stewardIdSet = new Set();
    for (const { dep } of impactedNodes) {
      for (const s of Array.isArray(dep.stewards) ? dep.stewards : []) {
        if (s && s.personId && (s.role === 'primary' || s.role === 'backup') && deputyById.has(s.personId)) {
          stewardIdSet.add(s.personId);
        }
      }
    }
    const stewardDeputies = [...stewardIdSet]
      .map((id) => deputyById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const stewardTeams = [...new Set(stewardDeputies.map((d) => d.team).filter(Boolean))].sort();
    const coveredItems = eligibleByItem
      .filter(({ eligible }) => eligible.length > 0 && stewardIdSet.has(eligible[0].deputy.personId))
      .map(({ item }) => item);
    const criticalItemsAtRisk = coveredItems.filter((item) => item.criticality >= CONTINUITY_CRITICAL);

    const pAnnual = modelled ? Math.min(0.999, Math.max(0, annualProb / 100)) : 0;
    const pWindow = modelled ? (1 - (1 - pAnnual) ** (horizonDays / 365)) : 0;

    nodes.push({
      dependencyId: root.id,
      name: titleOf(root.name, 90),
      kind: root.kind || 'service',
      criticality: root.criticality || 'supporting',
      modelled,
      ttsDays: num(root.ttsDays),
      ttrDays: ttr,
      annualFailureProb: annualProb,
      windowFailureProbPct: modelled ? round(pWindow * 100, 2) : null,
      pWindow,
      maxShortfallDays: round(maxShortfallDays, 1),
      impactedServiceIds: impactedNodes.map((n) => n.dep.id),
      impactedServiceNames: impactedNodes.map((n) => titleOf(n.dep.name, 70)),
      stewardDeputyIds: stewardDeputies.map((d) => d.personId),
      stewardNames: stewardDeputies.map((d) => d.name),
      teamsAffected: stewardTeams,
      spansMultipleTeams: stewardTeams.length >= 2,
      spansMultipleDeputies: stewardDeputies.length >= 2,
      coveredObligationKeys: coveredItems.map((i) => i.key),
      obligationsAtRisk: coveredItems.length,
      criticalObligationsAtRisk: criticalItemsAtRisk.length,
      criticalTitles: criticalItemsAtRisk.slice(0, 4).map((i) => i.title),
    });
  }

  const chokePoints = nodes
    .filter((n) => n.stewardDeputyIds.length > 0 && n.maxShortfallDays > 0 && n.obligationsAtRisk > 0)
    .sort((a, b) => (
      b.criticalObligationsAtRisk - a.criticalObligationsAtRisk
      || b.stewardDeputyIds.length - a.stewardDeputyIds.length
      || b.maxShortfallDays - a.maxShortfallDays
      || a.dependencyId.localeCompare(b.dependencyId)
    ));
  const crossTeamChokePoints = chokePoints.filter((n) => n.spansMultipleTeams || n.spansMultipleDeputies);
  const shockableNodes = nodes.filter((n) => n.stewardDeputyIds.length > 0 && n.maxShortfallDays > 0 && (n.modelled || vendorOverride !== null));

  const rng = createSeededRng(seed ^ 0x3c6ef372);
  const currencySet = [...new Set(items.filter((row) => row.money).map((row) => row.money.currency))].sort();
  const stallCounts = [];
  const totals = Object.fromEntries(currencySet.map((c) => [c, []]));
  const stallHits = new Array(items.length).fill(0);
  let primaryShockTrials = 0;
  let dualShockTrials = 0;
  let vendorShockTrials = 0;

  for (let t = 0; t < trials; t += 1) {
    const absent = new Set();
    let firstTeam = null;
    if (deputies.length && rng() < q1) {
      primaryShockTrials += 1;
      if (teams.length) {
        firstTeam = teams[Math.floor(rng() * teams.length)];
        for (const deputy of deputies) if (deputy.team === firstTeam) absent.add(deputy.personId);
      } else {
        for (const deputy of deputies) absent.add(deputy.personId);
      }
    }
    if (deputies.length && rng() < q2) {
      dualShockTrials += 1;
      const remainingTeams = teams.filter((tm) => tm !== firstTeam);
      if (remainingTeams.length) {
        const secondTeam = remainingTeams[Math.floor(rng() * remainingTeams.length)];
        for (const deputy of deputies) if (deputy.team === secondTeam) absent.add(deputy.personId);
      } else {
        const remaining = deputies.filter((d) => !absent.has(d.personId));
        if (remaining.length) absent.add(remaining[Math.floor(rng() * remaining.length)].personId);
      }
    }
    let anyVendorShock = false;
    for (const node of shockableNodes) {
      const pNode = vendorOverride !== null ? vendorOverride : node.pWindow;
      if (pNode > 0 && rng() < pNode) {
        anyVendorShock = true;
        for (const depId of node.stewardDeputyIds) absent.add(depId);
      }
    }
    if (anyVendorShock) vendorShockTrials += 1;
    for (const deputy of deputies) if (rng() < pIndividual) absent.add(deputy.personId);

    let count = 0;
    const byCurrency = Object.fromEntries(currencySet.map((c) => [c, 0]));
    for (let i = 0; i < eligibleByItem.length; i += 1) {
      const { item, eligible } = eligibleByItem[i];
      let pStall = 1;
      if (eligible.length) {
        const primary = eligible[0];
        if (!absent.has(primary.deputy.personId)) {
          pStall = 1 - primary.fit / 100;
        } else {
          const backup = eligible.find((row) => !absent.has(row.deputy.personId));
          pStall = backup ? 1 - Math.min(100, backup.fit * backupFitDiscount) / 100 : 1;
        }
      }
      if (rng() < pStall) {
        count += 1;
        stallHits[i] += 1;
        if (item.money && byCurrency[item.money.currency] !== undefined) byCurrency[item.money.currency] += item.money.amount;
      }
    }
    stallCounts.push(count);
    for (const currency of currencySet) totals[currency].push(byCurrency[currency]);
  }

  const sorted = [...stallCounts].sort((a, b) => a - b);
  const at = (quantile) => sorted[Math.min(trials - 1, Math.floor(trials * quantile))] ?? 0;
  const mean = stallCounts.reduce((sum, v) => sum + v, 0) / Math.max(1, trials);
  const tail = Object.fromEntries(currencySet.map((currency) => {
    const sample = tailFromSamples(totals[currency]);
    return [currency, {
      ...sample,
      expected: round(items.filter((row) => row.money?.currency === currency).reduce((sum, row) => sum + row.money.amount * (stallHits[items.indexOf(row)] / Math.max(1, trials)), 0), 2),
    }];
  }));
  const lift = (after, before) => (before > 0 ? round(((after - before) / before) * 100, 1) : null);

  return {
    engine: CONTINUITY_ENGINE_VERSION,
    seed,
    trials,
    commonCausePct: round(q1 * 100, 1),
    secondShockPct: round(q2 * 100, 1),
    vendorShockOverridePct: vendorOverride === null ? null : round(vendorOverride * 100, 1),
    individualAbsencePct: round(pIndividual * 100, 1),
    backupFitDiscount: round(backupFitDiscount * 100, 1),
    primaryShockTrials,
    dualShockTrials,
    dualShockPct: round((dualShockTrials / Math.max(1, trials)) * 100, 1),
    vendorShockTrials,
    vendorShockPct: round((vendorShockTrials / Math.max(1, trials)) * 100, 1),
    mean: round(mean, 2),
    p50: at(0.5),
    p80: at(0.8),
    p90: at(0.9),
    pNone: round(stallCounts.filter((v) => v === 0).length / Math.max(1, trials), 4),
    tail,
    chokePoints,
    crossTeamChokePoints,
    unmodeledDependencies,
    vsIndependent: {
      expectedStalled: round(independentExpected, 2),
      p50: quantileFromDistribution(independentDist, 0.5),
      p90: quantileFromDistribution(independentDist, 0.9),
      meanLiftPct: lift(mean, independentExpected),
      p90LiftPct: lift(at(0.9), quantileFromDistribution(independentDist, 0.9)),
    },
    vsSingleShock: {
      expectedStalled: singleShock.mean,
      p50: singleShock.p50,
      p90: singleShock.p90,
      meanLiftPct: lift(mean, singleShock.mean),
      p90LiftPct: lift(at(0.9), singleShock.p90),
    },
    assumptions: [
      `Primary team shared cause fires in ${round(q1 * 100, 1)}% of windows; a second simultaneous shock fires in ${round(q2 * 100, 1)}% of windows, removing a second team (or next available deputy).`,
      vendorOverride !== null
        ? `Vendor/dependency shock override is set to ${round(vendorOverride * 100, 1)}% per dependency with a survival shortfall (TTR > TTS).`
        : `Vendor/dependency outage probabilities are prorated to the ${horizonDays}-day absence window from each dependency’s recorded annual failure probability where effective TTR exceeds TTS.`,
      `When a dependency suffers a survival shortfall, its primary and backup stewards in the deputy pool are pulled into incident recovery at once — cutting across team boundaries.`,
      unmodeledDependencies.length
        ? `${unmodeledDependencies.length} active dependency record(s) have no recorded annual failure probability or TTR and are listed as unmodelled rather than treated as 0% risk.`
        : 'Every active dependency in the workspace has a recorded annual failure probability and recovery time.',
    ],
  };
}

/**
 * Who is the only person who could hold this item? Concentration is measured on
 * the *eligible* pool at the evidence floor, independently of which deputy the
 * plan happened to pick, because a plan that nominates one of three equally
 * eligible deputies is not concentrated even if it names only one.
 */
export function coverConcentration(inventory, deputies, { minFitPct = CONTINUITY_MIN_FIT_PCT, state = {} } = {}) {
  const rows = (inventory?.items || []).map((item) => {
    const eligible = item.delegability === 'held' ? [] : eligibleDeputies(item, deputies, { minFitPct, state });
    return {
      key: item.key,
      title: item.title,
      stallKind: item.stallKind,
      criticality: item.criticality,
      delegability: item.delegability,
      eligibleCount: eligible.length,
      onlyDeputyId: eligible.length === 1 ? eligible[0].deputy.personId : null,
      eligibleDeputyIds: eligible.map((row) => row.deputy.personId),
    };
  });
  const critical = rows.filter((row) => row.criticality >= CONTINUITY_CRITICAL);
  return {
    rows,
    critical,
    singlePoint: rows.filter((row) => row.eligibleCount === 1),
    criticalSinglePoint: critical.filter((row) => row.eligibleCount === 1),
    noCover: rows.filter((row) => row.eligibleCount === 0),
    minFitPct,
    note: 'Concentration counts distinct eligible deputies at the stated evidence floor, not the plan’s nomination.',
  };
}

/* -------------------------------------------------- deputy unavailability */

/**
 * Zero-write stress test: what a named set of deputies being unavailable does to
 * the same window. Coverage is re-derived per item from the remaining pool; the
 * primary deputy loss is reported separately because a plan that leans on one
 * person is a different risk from a plan that is merely thin.
 */
export function stressAbsence(inventory, deputies, {
  unavailableDeputyIds = [],
  minFitPct = CONTINUITY_MIN_FIT_PCT,
  state = {},
} = {}) {
  const unavailable = new Set((unavailableDeputyIds || []).filter(Boolean));
  const available = deputies.filter((deputy) => !unavailable.has(deputy.personId));
  const rows = (inventory?.items || []).map((item) => {
    const before = item.delegability === 'held'
      ? { pCover: 0, deputyId: null, fit: 0 }
      : bestCoverForItem(item, deputies, minFitPct, state);
    const after = item.delegability === 'held'
      ? { pCover: 0, deputyId: null, fit: 0 }
      : bestCoverForItem(item, available, minFitPct, state);
    return {
      key: item.key,
      title: item.title,
      stallKind: item.stallKind,
      criticality: item.criticality,
      delegability: item.delegability,
      money: item.money,
      beforeDeputyId: before.deputyId,
      beforePStall: round(1 - before.pCover, 4),
      afterDeputyId: after.deputyId,
      afterPStall: round(1 - after.pCover, 4),
    };
  });
  const lost = rows.filter((row) => row.afterPStall > row.beforePStall + 1e-9);
  const lostCritical = lost.filter((row) => row.criticality >= CONTINUITY_CRITICAL);
  const newlyUncovered = rows.filter((row) => row.beforePStall < 0.999 && row.afterPStall >= 0.999);
  const moneyAfter = {};
  for (const row of rows) {
    if (!row.money) continue;
    moneyAfter[row.money.currency] = round((moneyAfter[row.money.currency] || 0) + row.money.amount * row.afterPStall, 2);
  }
  const beforeExpected = rows.reduce((sum, row) => sum + row.beforePStall, 0);
  const afterExpected = rows.reduce((sum, row) => sum + row.afterPStall, 0);
  return {
    unavailableDeputyIds: [...unavailable],
    availableDeputies: available.length,
    rows,
    lost,
    lostCritical,
    newlyUncovered,
    beforeExpectedStalled: round(beforeExpected, 2),
    afterExpectedStalled: round(afterExpected, 2),
    deltaStalled: round(afterExpected - beforeExpected, 2),
    moneyAfter,
    note: 'Coverage is re-derived from the remaining deputy pool at the same evidence floor. No record is written and no plan is commissioned by a stress test.',
  };
}

/* --------------------------------------------------------------- cover plan */

function setupMinutesFor(kind, size = 1) {
  const base = CONTINUITY_SETUP_MINUTES[kind] ?? 20;
  return base + Math.max(0, size - 1) * 5;
}

/**
 * Build candidate cover actions. A bundle is one deputy holding one stall
 * class; a single is used only when a critical item has no eligible bundle.
 */
export function coverCandidates(inventory, deputies, { minFitPct = CONTINUITY_MIN_FIT_PCT, state = {} } = {}) {
  const items = (inventory?.items || []).filter((row) => row.criticality >= CONTINUITY_CRITICAL && row.delegability !== 'held');
  const bundles = new Map();
  for (const row of items) {
    for (const candidate of eligibleDeputies(row, deputies, { minFitPct, state })) {
      const id = `${candidate.deputy.personId}|${row.stallKind}`;
      const entry = bundles.get(id) || {
        id,
        deputyId: candidate.deputy.personId,
        deputyName: candidate.deputy.name,
        stallKind: row.stallKind,
        itemKeys: [],
        fitSum: 0,
        kind: 'bundle',
      };
      if (!entry.itemKeys.includes(row.key)) {
        entry.itemKeys.push(row.key);
        entry.fitSum += candidate.fit;
      }
      bundles.set(id, entry);
    }
  }
  const candidates = [...bundles.values()].map((entry) => ({
    ...entry,
    itemKeys: entry.itemKeys.sort(),
    avgFit: round(entry.fitSum / Math.max(1, entry.itemKeys.length), 1),
    setupMinutes: setupMinutesFor(entry.stallKind, entry.itemKeys.length),
  }));
  // A critical item with no eligible bundle can still be handed to its single
  // best-fit deputy if one exists at all — otherwise it stays uncovered and is
  // reported as such, never silently covered on paper.
  const bundledKeys = new Set(candidates.flatMap((c) => c.itemKeys));
  for (const row of items) {
    if (bundledKeys.has(row.key)) continue;
    const eligible = eligibleDeputies(row, deputies, { minFitPct, state });
    if (!eligible.length) continue;
    const best = eligible[0];
    candidates.push({
      id: `${best.deputy.personId}|single|${row.key}`,
      deputyId: best.deputy.personId,
      deputyName: best.deputy.name,
      stallKind: row.stallKind,
      itemKeys: [row.key],
      avgFit: best.fit,
      setupMinutes: setupMinutesFor(row.stallKind, 1),
      kind: 'single',
    });
  }
  return { candidates, uncovered: items.filter((row) => !candidates.some((c) => c.itemKeys.includes(row.key))) };
}

function evaluateSelection(selection, candidates, weightByKey) {
  const covered = new Set();
  let minutes = 0;
  for (const candidate of selection) {
    minutes += candidate.setupMinutes;
    for (const key of candidate.itemKeys) covered.add(key);
  }
  let coveredWeight = 0;
  for (const key of covered) coveredWeight += weightByKey.get(key) || 0;
  return { covered, minutes, coveredWeight };
}

/** Compare selections: more covered criticality wins, then fewer minutes, then fewer actions. */
function better(a, b) {
  if (!b) return true;
  if (a.coveredWeight !== b.coveredWeight) return a.coveredWeight > b.coveredWeight;
  if (a.minutes !== b.minutes) return a.minutes < b.minutes;
  return a.selection.length < b.selection.length;
}

/**
 * Weighted minimum set cover. Exact branch-and-bound with a node cap on small
 * instances (≤ 18 candidates); otherwise the Chvátal greedy heuristic, whose
 * ln(n) + 1 bound is stated in the UI rather than implied to be optimal.
 */
export function buildCoverPlan(inventory, deputies, {
  minFitPct = CONTINUITY_MIN_FIT_PCT,
  maxActions = 6,
  nodeCap = 120000,
  state = {},
} = {}) {
  const { candidates, uncovered } = coverCandidates(inventory, deputies, { minFitPct, state });
  const criticalItems = (inventory?.items || []).filter((row) => row.criticality >= CONTINUITY_CRITICAL);
  const weightByKey = new Map((inventory?.items || []).map((row) => [row.key, row.criticality]));
  const universe = [...new Set(candidates.flatMap((c) => c.itemKeys))];
  const actionable = candidates
    .map((c) => ({ ...c, criticality: c.itemKeys.reduce((s, key) => s + (weightByKey.get(key) || 0), 0) }))
    .sort((a, b) => (b.criticality / b.setupMinutes) - (a.criticality / a.setupMinutes) || a.id.localeCompare(b.id));

  // Greedy: value density over uncovered criticality.
  const greedy = [];
  const coveredByGreedy = new Set();
  while (greedy.length < maxActions) {
    let bestCandidate = null;
    let bestDensity = -1;
    for (const c of actionable) {
      const fresh = c.itemKeys.filter((key) => !coveredByGreedy.has(key));
      if (!fresh.length) continue;
      const value = fresh.reduce((s, key) => s + (weightByKey.get(key) || 0) * (c.avgFit / 100), 0);
      const density = value / c.setupMinutes;
      if (density > bestDensity + 1e-9) { bestDensity = density; bestCandidate = { candidate: c, fresh }; }
    }
    if (!bestCandidate) break;
    greedy.push(bestCandidate.candidate);
    for (const key of bestCandidate.fresh) coveredByGreedy.add(key);
  }
  const greedyEval = evaluateSelection(greedy, candidates, weightByKey);

  // Exact branch and bound, bounded by a node cap. The cap is reported.
  let best = null;
  let nodes = 0;
  let exhausted = false;
  const ordered = actionable.slice();
  const suffixWeight = new Array(ordered.length + 1).fill(0);
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const keys = new Set(ordered[i].itemKeys);
    suffixWeight[i] = suffixWeight[i + 1];
    for (const key of keys) {
      if (!ordered.slice(i + 1).some((c) => c.itemKeys.includes(key))) suffixWeight[i] += weightByKey.get(key) || 0;
    }
  }
  function dfs(index, selection, covered, coveredWeight, minutes) {
    nodes += 1;
    if (nodes > nodeCap) { exhausted = true; return; }
    // Copy the active selection: the DFS mutates `selection` in place, so
    // holding a reference here would silently empty the best plan on unwind.
    const current = { selection: [...selection], covered: new Set(covered), coveredWeight, minutes };
    if (better(current, best)) best = current;
    if (index >= ordered.length || selection.length >= maxActions) return;
    if (coveredWeight + suffixWeight[index] < (best?.coveredWeight ?? 0)) return;
    if (minutes > (best?.minutes ?? Infinity) && coveredWeight <= (best?.coveredWeight ?? -1)) return;
    const candidate = ordered[index];
    const fresh = candidate.itemKeys.filter((key) => !covered.has(key));
    if (fresh.length) {
      const nextCovered = new Set(covered);
      for (const key of fresh) nextCovered.add(key);
      const nextWeight = coveredWeight + fresh.reduce((s, key) => s + (weightByKey.get(key) || 0), 0);
      selection.push(candidate);
      dfs(index + 1, selection, nextCovered, nextWeight, minutes + candidate.setupMinutes);
      selection.pop();
    }
    dfs(index + 1, selection, covered, coveredWeight, minutes);
  }
  dfs(0, [], new Set(), 0, 0);
  const useExact = Boolean(best) && !exhausted;
  const chosen = useExact ? best.selection : greedy;
  const evaluated = useExact ? best : greedyEval;
  const actions = chosen.map((c) => ({
    id: c.id,
    deputyId: c.deputyId,
    deputyName: c.deputyName,
    stallKind: c.stallKind,
    kind: c.kind,
    itemKeys: [...c.itemKeys],
    avgFit: c.avgFit,
    setupMinutes: c.setupMinutes,
    criticalityCovered: c.itemKeys.reduce((s, key) => s + (weightByKey.get(key) || 0), 0),
  })).sort((a, b) => b.criticalityCovered - a.criticalityCovered || a.id.localeCompare(b.id));
  const coveredKeys = [...evaluated.covered].sort();
  const totalMinutes = evaluated.minutes;
  // Coverage is measured against EVERY critical item, not only the coverable
  // subset. Dividing by the subset would let a plan that ignores half the
  // critical work report 100%.
  const totalCriticality = criticalItems.reduce((s, row) => s + row.criticality, 0);
  const coveredCriticality = criticalItems.filter((row) => evaluated.covered.has(row.key)).reduce((s, row) => s + row.criticality, 0);
  const uncoveredDetail = criticalItems
    .filter((row) => !evaluated.covered.has(row.key))
    .map((row) => ({
      key: row.key,
      title: row.title,
      stallKind: row.stallKind,
      criticality: row.criticality,
      reason: row.delegability === 'held'
        ? 'held-by-convention'
        : uncovered.some((u) => u.key === row.key) ? 'no-deputy-above-floor' : 'left-out-by-plan',
    }))
    .sort((a, b) => b.criticality - a.criticality || a.key.localeCompare(b.key));
  return {
    actions,
    coveredKeys,
    uncoveredKeys: uncoveredDetail.map((row) => row.key),
    uncoveredDetail,
    heldKeys: criticalItems.filter((row) => row.delegability === 'held').map((row) => row.key),
    coveragePct: totalCriticality ? round((coveredCriticality / totalCriticality) * 100, 1) : 100,
    totalMinutes,
    criticalityCovered: coveredCriticality,
    criticalityTotal: totalCriticality,
    method: useExact ? 'exact-branch-and-bound' : 'greedy-chvatal',
    nodesVisited: nodes,
    nodeCap,
    greedyMinutes: greedyEval.minutes,
    greedyCriticality: greedyEval.coveredWeight,
    bound: useExact ? null : `Greedy set cover is within ln(n)+1 of the optimum; n=${universe.length} items, ${actionable.length} candidate actions.`,
    maxActions,
  };
}

/** Stable key for a commissioned plan, so a retry cannot quietly change it. */
export function coverPlanKey(plan, inventory) {
  const sig = (plan?.actions || [])
    .map((a) => `${a.deputyId}:${a.stallKind}:${a.itemKeys.slice().sort().join(',')}`)
    .sort()
    .join('|');
  let hash = 2166136261;
  const raw = `${inventory?.windowStart || ''}|${(inventory?.items || []).length}|${sig}`;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `lcs-${(hash >>> 0).toString(16)}`;
}

/**
 * Expected stalls after the commissioned cover is assumed to work. This is a
 * scenario, and it says so: it re-uses the same fit × availability model.
 */
export function residualAfterCover(inventory, simulation, plan, deputies, state = {}) {
  const assigned = new Map();
  for (const action of plan?.actions || []) {
    const deputy = deputies.find((d) => d.personId === action.deputyId);
    if (!deputy) continue;
    for (const key of action.itemKeys) assigned.set(key, { deputy, action });
  }
  const items = inventory?.items || [];
  let expected = 0;
  let expectedCritical = 0;
  const value = {};
  for (const row of items) {
    const baseline = simulation?.perItem?.find((r) => r.key === row.key)?.pStall ?? 1;
    const assignment = assigned.get(row.key);
    let pStall = baseline;
    if (assignment) {
      // A commissioned briefing is assumed to raise effective coverage by a
      // stated convention: explicit authority plus the budgeted setup minutes.
      // It is not a measured improvement, so the UI prints the uplift beside
      // the number instead of presenting the gap as evidence.
      const briefedUplift = Math.min(15, 5 + (assignment.action.setupMinutes || 0) / 6);
      const fit = Math.min(95, deputyFitForItem(row, assignment.deputy, state).fit + briefedUplift);
      pStall = 1 - (fit / 100) * (assignment.deputy.availability ?? 1);
    }
    expected += pStall;
    if (row.criticality >= CONTINUITY_CRITICAL) expectedCritical += pStall;
    if (row.money) value[row.money.currency] = round((value[row.money.currency] || 0) + row.money.amount * pStall, 2);
  }
  return {
    expectedStalled: round(expected, 2),
    expectedCriticalStalled: round(expectedCritical, 2),
    expectedValue: value,
    briefedUpliftPoints: 15,
    briefedUpliftNote: 'Commissioned cover adds up to 15 fit points for explicit authority and briefing time. It is a stated convention, not a measured improvement.',
  };
}

/* ------------------------------------------------------------ drill scoring */

function wilson(successes, n, z = 1.645) {
  if (!n) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: round(Math.max(0, centre - half) * 100, 1), high: round(Math.min(1, centre + half) * 100, 1) };
}

/**
 * Grade whether a single covered source record (`decision`, `case`, `delegation`,
 * `stakeholder`, `goal`, `person`) has dated evidence of progress on or after
 * `windowStart` (ADR-0034).
 *
 * A cover delegation closed as `done` while zero linked source records moved is
 * a paper completion, not an executed hand-over.
 */
export function gradeCoveredSourceProgress(state = {}, sourceType, sourceId, { windowStart = null, windowEnd = null } = {}) {
  const start = String(windowStart || '');
  const end = String(windowEnd || '');
  if (sourceType === 'decision') {
    const row = (state.decisions || []).find((d) => d && d.id === sourceId);
    if (!row) return { sourceType, sourceId, exists: false, title: sourceId, route: '#/decisions', moved: false, movedOn: null, evidence: 'Source decision no longer exists' };
    const title = titleOf(row.title || row.question, 90);
    if (row.chosen && row.decidedOn && (!start || row.decidedOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: `#/decisions?decision=${row.id}`, moved: true, movedOn: row.decidedOn, evidence: `Decided on ${row.decidedOn} (“${titleOf(row.chosen, 40)}”)` };
    }
    if (row.reviewedOn && (!start || row.reviewedOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: `#/decisions?decision=${row.id}`, moved: true, movedOn: row.reviewedOn, evidence: `Outcome reviewed on ${row.reviewedOn} (${row.outcome || 'recorded'})` };
    }
    return {
      sourceType,
      sourceId,
      exists: true,
      title,
      route: `#/decisions?decision=${row.id}`,
      moved: false,
      movedOn: null,
      evidence: row.chosen ? 'Decided before window; outcome review still pending' : 'Still undecided with no call recorded in the window',
    };
  }
  if (sourceType === 'case') {
    const row = (state.cases || []).find((c) => c && c.id === sourceId);
    if (!row) return { sourceType, sourceId, exists: false, title: sourceId, route: '#/cases', moved: false, movedOn: null, evidence: 'Source case no longer exists' };
    const title = titleOf(row.title, 90);
    if (row.resolvedOn && (!start || row.resolvedOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: `#/cases?case=${row.id}`, moved: true, movedOn: row.resolvedOn, evidence: `Case ${row.status} on ${row.resolvedOn}` };
    }
    if (row.actuals?.settledOn && (!start || row.actuals.settledOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: `#/cases?case=${row.id}`, moved: true, movedOn: row.actuals.settledOn, evidence: `Case actuals settled on ${row.actuals.settledOn}` };
    }
    if (row.reviewOn && end && row.reviewOn > end) {
      return { sourceType, sourceId, exists: true, title, route: `#/cases?case=${row.id}`, moved: true, movedOn: row.reviewOn, evidence: `Oversight review date advanced to ${row.reviewOn}` };
    }
    return {
      sourceType,
      sourceId,
      exists: true,
      title,
      route: `#/cases?case=${row.id}`,
      moved: false,
      movedOn: null,
      evidence: `Case remains ${row.status || 'open'} (review due ${row.reviewOn || 'unscheduled'})`,
    };
  }
  if (sourceType === 'delegation') {
    const row = (state.delegations || []).find((d) => d && d.id === sourceId);
    if (!row) return { sourceType, sourceId, exists: false, title: sourceId, route: '#/delegations', moved: false, movedOn: null, evidence: 'Source delegation no longer exists' };
    const title = titleOf(row.title, 90);
    if (row.status === 'done' && row.completedOn && (!start || row.completedOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: '#/delegations', moved: true, movedOn: row.completedOn, evidence: `Completed on ${row.completedOn}` };
    }
    const windowCheckins = (Array.isArray(row.checkins) ? row.checkins : [])
      .filter((c) => c && c.date && (!start || c.date >= start) && c.progress !== 'blocked')
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (windowCheckins.length) {
      return { sourceType, sourceId, exists: true, title, route: '#/delegations', moved: true, movedOn: windowCheckins[0].date, evidence: `Check-in logged on ${windowCheckins[0].date} (${windowCheckins[0].progress || 'on-track'})` };
    }
    return {
      sourceType,
      sourceId,
      exists: true,
      title,
      route: '#/delegations',
      moved: false,
      movedOn: null,
      evidence: 'No unblocking check-in or completion recorded on or after window start',
    };
  }
  if (sourceType === 'stakeholder') {
    const row = (state.stakeholders || []).find((s) => s && s.id === sourceId);
    if (!row) return { sourceType, sourceId, exists: false, title: sourceId, route: '#/stakeholders', moved: false, movedOn: null, evidence: 'Source stakeholder no longer exists' };
    const title = titleOf(row.name, 90);
    if (row.lastContactOn && (!start || row.lastContactOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: '#/stakeholders', moved: true, movedOn: row.lastContactOn, evidence: `Contact logged on ${row.lastContactOn}` };
    }
    const touches = (Array.isArray(row.stanceHistory) ? row.stanceHistory : [])
      .filter((h) => h && h.date && (!start || h.date >= start))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (touches.length) {
      return { sourceType, sourceId, exists: true, title, route: '#/stakeholders', moved: true, movedOn: touches[0].date, evidence: `Stance touch recorded on ${touches[0].date}` };
    }
    if (row.nextContactOn && end && row.nextContactOn > end) {
      return { sourceType, sourceId, exists: true, title, route: '#/stakeholders', moved: true, movedOn: row.nextContactOn, evidence: `Next contact date advanced to ${row.nextContactOn}` };
    }
    return {
      sourceType,
      sourceId,
      exists: true,
      title,
      route: '#/stakeholders',
      moved: false,
      movedOn: null,
      evidence: `No contact logged since ${row.lastContactOn || 'record creation'}`,
    };
  }
  if (sourceType === 'goal') {
    const row = (state.goals || []).find((g) => g && g.id === sourceId);
    if (!row) return { sourceType, sourceId, exists: false, title: sourceId, route: '#/goals', moved: false, movedOn: null, evidence: 'Source goal no longer exists' };
    const title = titleOf(row.title, 90);
    if (row.completedOn && (!start || row.completedOn >= start)) {
      return { sourceType, sourceId, exists: true, title, route: '#/goals', moved: true, movedOn: row.completedOn, evidence: `Goal completed on ${row.completedOn}` };
    }
    const goalCheckins = (Array.isArray(row.checkins) ? row.checkins : [])
      .filter((c) => c && c.date && (!start || c.date >= start))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (goalCheckins.length) {
      return { sourceType, sourceId, exists: true, title, route: '#/goals', moved: true, movedOn: goalCheckins[0].date, evidence: `Goal check-in recorded on ${goalCheckins[0].date}` };
    }
    return {
      sourceType,
      sourceId,
      exists: true,
      title,
      route: '#/goals',
      moved: false,
      movedOn: null,
      evidence: 'No goal check-in or completion recorded on or after window start',
    };
  }
  if (sourceType === 'person') {
    const row = (state.people || []).find((p) => p && p.id === sourceId);
    const title = titleOf(row?.name || sourceId, 90);
    const meetings = (state.oneOnOnes || [])
      .filter((m) => m && m.personId === sourceId && m.date && (!start || m.date >= start))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (meetings.length) {
      return { sourceType, sourceId, exists: Boolean(row), title, route: `#/people/${sourceId}`, moved: true, movedOn: meetings[0].date, evidence: `1:1 logged on ${meetings[0].date}` };
    }
    return {
      sourceType,
      sourceId,
      exists: Boolean(row),
      title,
      route: `#/people/${sourceId}`,
      moved: false,
      movedOn: null,
      evidence: 'No 1:1 meeting logged on or after window start',
    };
  }
  return { sourceType, sourceId, exists: false, title: sourceId, route: '#/handover', moved: false, movedOn: null, evidence: 'Unrecognised source type' };
}

/**
 * Grade commissioned hand-over implementation across three separate dimensions
 * (ADR-0034):
 *   1. Pre-window briefing acknowledgement (check-in recorded);
 *   2. Cover-delegation execution (`completed-verified`, `paper-only`,
 *      `active-executing`, `blocked`, `returned`, `unexecuted`);
 *   3. Underlying covered source-record movement (`sourcesMoved / sourcesTotal`).
 */
export function handoverImplementation(state = {}, { now = new Date(), windowStart = null } = {}) {
  const today = dayKey(now);
  const decisions = (state.decisions || []).filter((row) => row && typeof row.question === 'string');
  const commissioned = decisions.filter((row) => row.question.includes('[LCS-WINDOW:'));
  let decision = null;
  if (windowStart) {
    const token = `[LCS-WINDOW:${windowStart}]`;
    decision = commissioned.find((row) => row.question.includes(token)) || null;
  }
  if (!decision) {
    decision = commissioned
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  }
  if (!decision) {
    return {
      found: false,
      decisionId: null,
      decisionChosen: false,
      windowStart: null,
      windowEnd: null,
      daysToAbsence: null,
      windowPhase: 'none',
      planned: 0,
      briefed: 0,
      completedVerified: 0,
      paperOnly: 0,
      activeExecuting: 0,
      blocked: 0,
      returned: 0,
      returnedRecovered: 0,
      unexecuted: 0,
      sourcesTotal: 0,
      sourcesMoved: 0,
      sourcesStatic: 0,
      sourceMovePct: null,
      executionPct: null,
      rows: [],
      verdict: { id: 'none', label: 'No hand-over commissioned', detail: 'Commission a cover plan to grade briefing, delegation execution and covered-record movement.' },
    };
  }

  const match = decision.question.match(/Window (\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/);
  const start = match ? match[1] : windowStart;
  const end = match ? match[2] : null;
  const daysToAbsence = start ? (daysBetween(today, start) ?? 0) : null;
  const windowPhase = !start || today < start
    ? 'pre-window'
    : (end && today > end ? 'post-window' : 'in-window');

  const peopleById = new Map((state.people || []).filter(Boolean).map((p) => [p.id, p]));
  const allLinks = Array.isArray(state.links) ? state.links.filter(Boolean) : [];
  const linkedIds = new Set(allLinks
    .filter((link) => link.sourceType === 'decision' && link.sourceId === decision.id && link.targetType === 'delegation')
    .map((link) => link.targetId));
  const allDelegations = (state.delegations || []).filter(Boolean);
  const coverDelegations = allDelegations
    .filter((row) => linkedIds.has(row.id) || String(row.support || '').includes(`LCS-WINDOW:${start}`));

  const rows = coverDelegations.map((del) => {
    const checkins = Array.isArray(del.checkins) ? del.checkins.filter(Boolean) : [];
    const preWindowCheckins = checkins.filter((c) => c.date && (!start || c.date <= start)).length;
    const windowCheckins = checkins.filter((c) => c.date && start && c.date >= start).length;
    const latestCheckin = checkins.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
    const briefed = checkins.length > 0 || del.status === 'done';

    const sourceLinks = allLinks.filter((l) => (
      l.sourceType === 'delegation'
      && l.sourceId === del.id
      && !(l.targetType === 'decision' && l.targetId === decision.id)
    ));
    const sourceRows = sourceLinks.map((l) => gradeCoveredSourceProgress(state, l.targetType, l.targetId, { windowStart: start, windowEnd: end }));
    const sourcesTotal = sourceRows.length;
    const sourcesMoved = sourceRows.filter((s) => s.moved).length;
    const sourcesStatic = sourcesTotal - sourcesMoved;

    const backupDel = del.supersededByDelegationId
      ? allDelegations.find((d) => d.id === del.supersededByDelegationId) || null
      : allDelegations.find((d) => d.priorDelegationId === del.id || String(d.support || '').includes(`[LCS-BACKUP:${del.id}]`)) || null;

    let executionState = 'unexecuted';
    if (del.status === 'returned') {
      executionState = 'returned';
    } else if (del.status === 'done') {
      executionState = sourcesTotal > 0 && sourcesMoved === 0 ? 'paper-only' : 'completed-verified';
    } else if (latestCheckin?.progress === 'blocked') {
      executionState = 'blocked';
    } else if (windowCheckins > 0 || sourcesMoved > 0) {
      executionState = 'active-executing';
    }

    const person = peopleById.get(del.personId);
    return {
      id: del.id,
      personId: del.personId,
      deputyName: person?.name || del.personId || 'Unassigned',
      title: del.title,
      status: del.status,
      dueOn: del.dueOn,
      briefed,
      preWindowCheckins,
      windowCheckins,
      latestProgress: latestCheckin?.progress || null,
      executionState,
      returnReason: del.returnReason || '',
      returnedOn: del.returnedOn || null,
      supersededByDelegationId: backupDel?.id || del.supersededByDelegationId || null,
      backupDeputyName: backupDel ? (peopleById.get(backupDel.personId)?.name || backupDel.personId) : null,
      sourcesTotal,
      sourcesMoved,
      sourcesStatic,
      sources: sourceRows,
    };
  });

  const planned = rows.length;
  const briefed = rows.filter((r) => r.briefed).length;
  const completedVerified = rows.filter((r) => r.executionState === 'completed-verified').length;
  const paperOnly = rows.filter((r) => r.executionState === 'paper-only').length;
  const activeExecuting = rows.filter((r) => r.executionState === 'active-executing').length;
  const blocked = rows.filter((r) => r.executionState === 'blocked').length;
  const returned = rows.filter((r) => r.executionState === 'returned').length;
  const returnedRecovered = rows.filter((r) => r.executionState === 'returned' && r.supersededByDelegationId).length;
  const unexecuted = rows.filter((r) => r.executionState === 'unexecuted').length;

  // Deduplicate covered sources across delegations (including backup delegations)
  const uniqueSources = new Map();
  for (const row of rows) {
    for (const s of row.sources) {
      const key = `${s.sourceType}:${s.sourceId}`;
      const prev = uniqueSources.get(key);
      if (!prev || (!prev.moved && s.moved)) uniqueSources.set(key, s);
    }
  }
  const sourcesTotal = uniqueSources.size;
  const sourcesMoved = [...uniqueSources.values()].filter((s) => s.moved).length;
  const sourcesStatic = sourcesTotal - sourcesMoved;
  const sourceMovePct = sourcesTotal > 0 ? round((sourcesMoved / sourcesTotal) * 100, 1) : null;
  const activePlanned = Math.max(0, planned - returnedRecovered);
  const executionPct = activePlanned > 0 ? round(((completedVerified + activeExecuting) / activePlanned) * 100, 1) : null;

  let verdict;
  if (!planned) {
    verdict = { id: 'no-cover', label: 'No cover delegation survived', detail: 'The hand-over decision exists on the record, but no cover delegation is linked to it.' };
  } else if (returned > returnedRecovered) {
    verdict = {
      id: 'returned-unrecovered',
      label: `${returned - returnedRecovered} cover delegation(s) returned without backup`,
      detail: 'A deputy returned their cover delegation and no eligible backup deputy cleared the evidence floor.',
    };
  } else if (paperOnly > 0) {
    verdict = {
      id: 'paper-completion',
      label: `${paperOnly} cover delegation(s) closed on paper with 0 source records moved`,
      detail: 'The cover delegation was marked done, but none of its linked source obligations has a dated decision, resolution or touch in the window.',
    };
  } else if (!decision.chosen) {
    verdict = {
      id: 'unchosen',
      label: 'The hand-over decision has not been approved',
      detail: 'Cover delegations were drafted, but the parent DACI hand-over decision is still undecided.',
    };
  } else if (blocked > 0) {
    verdict = {
      id: 'blocked',
      label: `${blocked} cover delegation(s) blocked in window`,
      detail: 'A deputy logged a blocked check-in on a commissioned cover delegation.',
    };
  } else if (windowPhase !== 'pre-window' && unexecuted > 0) {
    verdict = {
      id: 'unexecuted',
      label: `${unexecuted} cover delegation(s) have zero in-window execution or source progress`,
      detail: 'The absence window has started, but neither an in-window check-in nor any covered source-record progress is recorded.',
    };
  } else if (activePlanned > 0 && completedVerified + activeExecuting === activePlanned) {
    verdict = {
      id: 'verified-execution',
      label: 'All active cover delegations show verified execution or source progress',
      detail: `${sourcesMoved}/${sourcesTotal} covered source record(s) have dated progress in the window.`,
    };
  } else if (windowPhase === 'pre-window') {
    verdict = {
      id: 'pre-window',
      label: briefed === planned ? 'Briefed ahead of window' : `${planned - briefed} cover delegation(s) awaiting pre-window briefing`,
      detail: `${briefed}/${planned} cover delegation(s) acknowledged before the window opens.`,
    };
  } else {
    verdict = {
      id: 'partial-execution',
      label: `${completedVerified + activeExecuting}/${activePlanned} active cover delegation(s) executing`,
      detail: `${sourcesMoved}/${sourcesTotal} covered source record(s) moved so far.`,
    };
  }

  return {
    found: true,
    decisionId: decision.id,
    decisionChosen: Boolean(decision.chosen),
    windowStart: start,
    windowEnd: end,
    daysToAbsence,
    windowPhase,
    planned,
    briefed,
    completedVerified,
    paperOnly,
    activeExecuting,
    blocked,
    returned,
    returnedRecovered,
    unexecuted,
    sourcesTotal,
    sourcesMoved,
    sourcesStatic,
    sourceMovePct,
    executionPct,
    rows,
    verdict,
  };
}

/**
 * Decompose closed-drill outcomes into four orthogonal causal mechanisms
 * (ADR-0034; Imbens & Angrist 1994 ITT vs TOT; DoWhy mechanism attribution):
 *   - `model-miss`: obligation was predicted covered (`pStall < 0.5`) or had an
 *     actively executed cover delegation (`completed-verified` / `active-executing`),
 *     yet stalled anyway — true forecast/coverage model error;
 *   - `implementation-drop`: obligation was covered by a commissioned cover
 *     delegation that was never approved, never briefed, returned, left
 *     unexecuted, blocked, or closed on paper (`paper-only`), and stalled —
 *     execution failure, not probability-model failure;
 *   - `predicted-stall`: obligation was predicted to stall (`pStall >= 0.5`,
 *     not dropped by a commissioned cover delegation) and stalled as predicted;
 *   - `unmodelled-resilience`: obligation was predicted to stall (`pStall >= 0.5`)
 *     yet did not stall;
 *   - `clean-cover`: obligation was predicted covered (`pStall < 0.5`) and held.
 */
export function attributeDrillOutcomes(drill, state = null, { now = new Date() } = {}) {
  if (!drill || !Array.isArray(drill.predictions)) return null;
  const predictions = drill.predictions.filter((p) => p && typeof p.key === 'string' && Number.isFinite(Number(p.pStall)));
  if (!predictions.length) return null;
  const observed = new Set(Array.isArray(drill.observedKeys) ? drill.observedKeys : []);
  const impl = state ? handoverImplementation(state, { now, windowStart: drill.startOn || null }) : null;
  const coverBySource = new Map();
  if (impl?.found && impl.windowStart === drill.startOn) {
    for (const delRow of impl.rows || []) {
      for (const s of delRow.sources || []) {
        const sKey = `${s.sourceType}|${s.sourceId}`;
        const prev = coverBySource.get(sKey);
        // Prefer an active/replacement delegation over a returned one when both link the same source.
        if (!prev || (prev.executionState === 'returned' && delRow.executionState !== 'returned')) {
          coverBySource.set(sKey, delRow);
        }
      }
    }
  }

  const modelMissKeys = [];
  const implementationDropKeys = [];
  const predictedStallKeys = [];
  const unmodelledResilienceKeys = [];
  const cleanCoverKeys = [];

  const rows = predictions.map((p) => {
    const outcome = observed.has(p.key) ? 1 : 0;
    const prob = Math.min(1, Math.max(0, Number(p.pStall)));
    const flag = prob >= 0.5;
    const parts = String(p.key).split('|');
    const sourceKey = parts.length >= 3 ? `${parts[1]}|${parts.slice(2).join('|')}` : '';
    const coverDel = coverBySource.get(sourceKey) || null;
    const coverDropped = Boolean(
      coverDel && (
        !impl.decisionChosen
        || !coverDel.briefed
        || ['returned', 'unexecuted', 'paper-only', 'blocked'].includes(coverDel.executionState)
      ),
    );
    const coverExecuted = Boolean(
      coverDel && impl.decisionChosen && coverDel.briefed
      && ['completed-verified', 'active-executing'].includes(coverDel.executionState),
    );

    let mechanism = 'clean-cover';
    if (outcome === 1) {
      if (coverDropped) {
        mechanism = 'implementation-drop';
        implementationDropKeys.push(p.key);
      } else if (!flag || coverExecuted) {
        mechanism = 'model-miss';
        modelMissKeys.push(p.key);
      } else {
        mechanism = 'predicted-stall';
        predictedStallKeys.push(p.key);
      }
    } else if (flag) {
      mechanism = 'unmodelled-resilience';
      unmodelledResilienceKeys.push(p.key);
    } else {
      mechanism = 'clean-cover';
      cleanCoverKeys.push(p.key);
    }

    return {
      key: p.key,
      pStall: round(prob, 4),
      outcome,
      flagged: flag,
      mechanism,
      coverDelegationId: coverDel?.id || null,
      coverExecutionState: coverDel?.executionState || null,
    };
  });

  // Execution-conditioned Brier & skill: evaluate the probability model on the
  // subset of obligations where a commissioned cover was NOT dropped in execution.
  const conditionedRows = rows.filter((r) => r.mechanism !== 'implementation-drop');
  const conditionedN = conditionedRows.length;
  const conditionedHits = conditionedRows.reduce((s, r) => s + r.outcome, 0);
  const conditionedBrierSum = conditionedRows.reduce((s, r) => s + (r.pStall - r.outcome) ** 2, 0);
  const conditionedBaseRate = conditionedN > 0 ? conditionedHits / conditionedN : null;
  const executionConditionedBrier = conditionedN > 0 ? round(conditionedBrierSum / conditionedN, 4) : null;
  const executionConditionedSkill = conditionedN >= CONTINUITY_MIN_SCORED_ITEMS && conditionedBaseRate > 0
    ? round(1 - (conditionedBrierSum / conditionedN) / conditionedBaseRate, 4)
    : null;

  let dominantStallCause = 'none';
  const totalStalls = modelMissKeys.length + implementationDropKeys.length + predictedStallKeys.length;
  if (totalStalls > 0) {
    if (implementationDropKeys.length > modelMissKeys.length && implementationDropKeys.length >= predictedStallKeys.length) {
      dominantStallCause = 'implementation-drop';
    } else if (modelMissKeys.length > implementationDropKeys.length && modelMissKeys.length >= predictedStallKeys.length) {
      dominantStallCause = 'model-miss';
    } else if (predictedStallKeys.length > modelMissKeys.length && predictedStallKeys.length > implementationDropKeys.length) {
      dominantStallCause = 'predicted-structural';
    } else {
      dominantStallCause = 'mixed';
    }
  }

  return {
    handoverCommissioned: Boolean(impl?.found && impl.windowStart === drill.startOn),
    decisionId: impl?.windowStart === drill.startOn ? impl.decisionId : null,
    modelMissKeys,
    implementationDropKeys,
    predictedStallKeys,
    unmodelledResilienceKeys,
    cleanCoverKeys,
    conditionedN,
    executionConditionedBrier,
    executionConditionedSkill,
    dominantStallCause,
    rows,
  };
}

/**
 * Score a closed drill against the probabilities frozen when it opened.
 *
 * The outcome is a human record: which of the predicted items actually stalled.
 * "Unexpected" stalls are counted separately and are never turned into a lower
 * Brier score, because they were not in the denominator.
 */
export function scoreDrillRecord(drill, { state = null, now = new Date() } = {}) {
  if (!drill || !Array.isArray(drill.predictions)) return null;
  const predictions = drill.predictions.filter((p) => p && typeof p.key === 'string' && Number.isFinite(Number(p.pStall)));
  if (!predictions.length) return null;
  const observed = new Set(Array.isArray(drill.observedKeys) ? drill.observedKeys : []);
  const n = predictions.length;
  let brierSum = 0;
  let hits = 0;
  let truePos = 0;
  let falsePos = 0;
  let falseNeg = 0;
  const attribution = attributeDrillOutcomes(drill, state, { now });
  const mechanismByKey = new Map((attribution?.rows || []).map((r) => [r.key, r.mechanism]));
  const rows = predictions.map((p) => {
    const outcome = observed.has(p.key) ? 1 : 0;
    const prob = Math.min(1, Math.max(0, Number(p.pStall)));
    brierSum += (prob - outcome) ** 2;
    if (outcome) hits += 1;
    const flag = prob >= 0.5;
    if (flag && outcome) truePos += 1;
    else if (flag && !outcome) falsePos += 1;
    else if (!flag && outcome) falseNeg += 1;
    return {
      key: p.key,
      pStall: round(prob, 4),
      outcome,
      flagged: flag,
      mechanism: mechanismByKey.get(p.key) || (outcome ? (flag ? 'predicted-stall' : 'model-miss') : (flag ? 'unmodelled-resilience' : 'clean-cover')),
    };
  });
  const baseRate = hits / n;
  const brier = brierSum / n;
  const skill = baseRate > 0 ? 1 - brier / baseRate : null;
  const unexpected = Math.max(0, Math.round(Number(drill.unexpectedStalls) || 0));
  const observedTotal = hits + unexpected;
  return {
    n,
    hits,
    unexpected,
    brier: round(brier, 4),
    baseRate: round(baseRate, 4),
    skill: skill === null ? null : round(skill, 4),
    precisionPct: truePos + falsePos > 0 ? round((truePos / (truePos + falsePos)) * 100, 1) : null,
    recallPct: truePos + falseNeg > 0 ? round((truePos / (truePos + falseNeg)) * 100, 1) : null,
    observedCoveragePct: observedTotal > 0 ? round(((hits) / observedTotal) * 100, 1) : 100,
    countsOnly: n < CONTINUITY_MIN_SCORED_ITEMS,
    rows,
    falseNegatives: rows.filter((r) => r.outcome === 1 && !r.flagged).map((r) => r.key),
    falsePositives: rows.filter((r) => r.outcome === 0 && r.flagged).map((r) => r.key),
    onTimeInterval: wilson(truePos, truePos + falsePos),
    attribution,
  };
}

/** Aggregate skill across closed drills. Counts-only below the drill floor. */
export function drillCalibration(drills) {
  const closed = (drills || []).filter((d) => d && d.status === 'closed' && d.score);
  const n = closed.length;
  const predictions = closed.reduce((s, d) => s + d.score.n, 0);
  const brier = n ? closed.reduce((s, d) => s + d.score.brier, 0) / n : null;
  const skill = n ? closed.reduce((s, d) => s + (d.score.skill ?? 0), 0) / n : null;
  const unexpected = closed.reduce((s, d) => s + d.score.unexpected, 0);
  const modelMisses = closed.reduce((s, d) => s + (d.score.attribution?.modelMissKeys?.length || 0), 0);
  const implementationDrops = closed.reduce((s, d) => s + (d.score.attribution?.implementationDropKeys?.length || 0), 0);
  const predictedStalls = closed.reduce((s, d) => s + (d.score.attribution?.predictedStallKeys?.length || 0), 0);
  const unmodelledResilience = closed.reduce((s, d) => s + (d.score.attribution?.unmodelledResilienceKeys?.length || 0), 0);
  const condScored = closed.filter((d) => d.score.attribution?.executionConditionedBrier !== null && d.score.attribution?.executionConditionedBrier !== undefined);
  const executionConditionedBrier = condScored.length
    ? round(condScored.reduce((s, d) => s + d.score.attribution.executionConditionedBrier, 0) / condScored.length, 4)
    : null;
  const condSkillRows = closed.filter((d) => d.score.attribution?.executionConditionedSkill !== null && d.score.attribution?.executionConditionedSkill !== undefined);
  const executionConditionedSkill = n >= CONTINUITY_MIN_DRILLS && condSkillRows.length
    ? round(condSkillRows.reduce((s, d) => s + d.score.attribution.executionConditionedSkill, 0) / condSkillRows.length, 4)
    : null;
  return {
    drills: n,
    predictions,
    brier: brier === null ? null : round(brier, 4),
    skill: skill === null ? null : round(skill, 4),
    unexpectedStalls: unexpected,
    modelMisses,
    implementationDrops,
    predictedStalls,
    unmodelledResilience,
    executionConditionedBrier,
    executionConditionedSkill,
    countsOnly: n < CONTINUITY_MIN_DRILLS,
    verdict: n < CONTINUITY_MIN_DRILLS
      ? `Counts only: ${n} closed drill(s), ${predictions} scored prediction(s). No skill score is reported below ${CONTINUITY_MIN_DRILLS} drills.`
      : skill !== null && skill < 0
        ? (implementationDrops > modelMisses
          ? `Raw skill is negative (${round(skill, 4)}), driven primarily by ${implementationDrops} dropped hand-over implementation(s) vs ${modelMisses} model fit miss(es).`
          : 'The stall model is worse than a constant base rate on your own drills.')
        : skill !== null && skill < 0.25
          ? 'The stall model barely beats a constant base rate on your own drills.'
          : 'The stall model beats a constant base rate on your own drills.',
  };
}

/* ----------------------------------------------------------------- report */

function signal({ ruleId, title, detail, severity, evidence, route, confidence = 'medium' }) {
  return {
    ruleId,
    domain: 'Leader continuity',
    title,
    detail,
    severity,
    confidence,
    evidence,
    action: { label: 'Open leader continuity', route },
  };
}

/**
 * Has the commissioned hand-over actually been briefed?
 *
 * The only evidence this workspace keeps that a deputy engaged with a cover
 * delegation is a recorded check-in on that delegation (or the delegation being
 * completed). Nothing here infers acknowledgement from a title, a message or a
 * calendar. Readiness is therefore a *count of recorded acknowledgements against
 * the number of cover delegations*, and the signal fires on proximity to the
 * window, not on a score.
 */
export function handoverReadiness(state = {}, { now = new Date(), windowStart = null } = {}) {
  const today = dayKey(now);
  const decisions = (state.decisions || []).filter((row) => row && typeof row.question === 'string');
  const commissioned = decisions.filter((row) => row.question.includes('[LCS-WINDOW:'));
  let decision = null;
  if (windowStart) {
    const token = `[LCS-WINDOW:${windowStart}]`;
    decision = commissioned.find((row) => row.question.includes(token)) || null;
  }
  if (!decision) {
    // Fall back to the newest commissioned hand-over: a plan for a future
    // window is exactly the one that needs briefing, and hiding it because the
    // page happens to be previewing today would be the wrong way round.
    decision = commissioned
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  }
  if (!decision) {
    return {
      found: false, decisionId: null, windowStart: null, windowEnd: null, daysToAbsence: null,
      planned: 0, acknowledged: 0, returned: 0, completed: 0, open: 0, rows: [],
      pctAcknowledged: null, verdict: { id: 'none', label: 'No hand-over commissioned' },
    };
  }
  const match = decision.question.match(/Window (\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/);
  const start = match ? match[1] : windowStart;
  const end = match ? match[2] : null;
  const daysToAbsence = start ? (daysBetween(today, start) ?? 0) : null;
  const linkedIds = new Set((state.links || [])
    .filter((link) => link && link.sourceType === 'decision' && link.sourceId === decision.id && link.targetType === 'delegation')
    .map((link) => link.targetId));
  const rows = (state.delegations || [])
    .filter((row) => row && (linkedIds.has(row.id) || String(row.support || '').includes(`LCS-WINDOW:${start}`)))
    .map((row) => ({
      id: row.id,
      personId: row.personId,
      title: row.title,
      status: row.status,
      dueOn: row.dueOn,
      checkins: Array.isArray(row.checkins) ? row.checkins.length : 0,
      acknowledged: (Array.isArray(row.checkins) && row.checkins.length > 0) || row.status === 'done',
    }));
  const planned = rows.length;
  const acknowledged = rows.filter((row) => row.acknowledged).length;
  const open = rows.filter((row) => row.status === 'active').length;
  const completed = rows.filter((row) => row.status === 'done').length;
  const returned = rows.filter((row) => row.status === 'returned').length;
  const pctAcknowledged = planned ? round((acknowledged / planned) * 100, 1) : null;
  const verdict = !planned
    ? { id: 'no-cover', label: 'The decision exists but no cover delegation survived' }
    : !decision.chosen
      ? { id: 'unchosen', label: 'The hand-over decision has not been approved' }
      : daysToAbsence !== null && daysToAbsence < 0
        ? { id: 'past-window', label: 'The window has already started' }
        : acknowledged < planned
          ? { id: 'unbriefed', label: `${planned - acknowledged} cover delegation(s) have no recorded acknowledgement` }
          : { id: 'briefed', label: 'Every deputy has a recorded check-in on the cover' };
  return {
    found: true,
    decisionId: decision.id,
    decisionChosen: Boolean(decision.chosen),
    windowStart: start,
    windowEnd: end,
    daysToAbsence,
    planned,
    acknowledged,
    open,
    completed,
    returned,
    rows,
    pctAcknowledged,
    verdict,
  };
}

export function continuitySignals(report) {
  if (!report || !report.ok) return [];
  const out = [];
  const { inventory, simulation, coverPlan, calibration } = report;
  const uncoveredCritical = coverPlan.uncoveredKeys.length;
  if (uncoveredCritical > 0) {
    out.push(signal({
      ruleId: 'LCS-01',
      title: `A ${inventory.horizonDays}-day absence leaves ${uncoveredCritical} critical item(s) with no cover`,
      detail: 'These are critical obligations inside the window that either cannot be delegated by convention or have no deputy with enough recorded evidence. Move them before the absence or accept the stall explicitly.',
      severity: 4,
      evidence: [`${inventory.counts.critical} critical item(s) in the window`, coverPlan.method === 'exact-branch-and-bound' ? 'Exact minimum cover exhausted the candidate set' : coverPlan.bound],
      route: '#/handover',
      confidence: 'high',
    }));
  }
  const p80 = simulation.exact.p80;
  if (inventory.counts.critical > 0 && p80 >= Math.max(1, Math.ceil(inventory.counts.critical / 3))) {
    out.push(signal({
      ruleId: 'LCS-02',
      title: `An 80% absence scenario stalls ${p80} item(s), including critical work`,
      detail: 'Under the stated independence and coverage conventions, four windows in five lose at least this many items. Commission a cover plan before the window opens rather than discovering it during.',
      severity: 3,
      evidence: [`P50 ${simulation.exact.p50}, P80 ${p80}, P90 ${simulation.exact.p90}`, `Expected ${simulation.exact.expectedStalled} stalls`],
      route: '#/handover',
    }));
  }
  if (inventory.counts.criticalHeld >= 2) {
    out.push(signal({
      ruleId: 'LCS-03',
      title: `${inventory.counts.criticalHeld} critical item(s) cannot be delegated at all`,
      detail: 'A management conversation or an irreversible high-value call can only be moved earlier or accepted. Two or more in one short window is a structural single point of failure in the role, not a scheduling problem.',
      severity: 3,
      evidence: inventory.items.filter((r) => r.delegability === 'held' && r.criticality >= CONTINUITY_CRITICAL).slice(0, 3).map((r) => `${r.title} (${CONTINUITY_KIND_LABELS[r.stallKind]})`),
      route: '#/handover',
    }));
  }
  if (!calibration.countsOnly && calibration.skill !== null && calibration.skill < 0) {
    out.push(signal({
      ruleId: 'LCS-04',
      title: `Drill skill score is negative (${calibration.skill}) across ${calibration.drills} drills`,
      detail: 'The stall model has been worse than a constant base rate on this workspace’s own drills. Treat the simulation as a checklist, not a forecast, until the model is rebased.',
      severity: 3,
      evidence: [`Mean Brier ${calibration.brier}`, `${calibration.predictions} scored predictions`, `${calibration.unexpectedStalls} unpredicted stall(s)`],
      route: '#/handover',
    }));
  }
  // LCS-05: a commissioned hand-over that was never briefed is worse than no
  // plan, because the leader believes it exists. Fires only inside 7 days.
  const readiness = report.readiness;
  if (readiness?.found && readiness.daysToAbsence !== null && readiness.daysToAbsence >= 0
    && readiness.daysToAbsence <= 7 && readiness.acknowledged < readiness.planned) {
    out.push(signal({
      ruleId: 'LCS-05',
      title: `Hand-over for ${readiness.windowStart} has ${readiness.planned - readiness.acknowledged} unbriefed cover delegation(s)`,
      detail: 'A cover delegation exists on the record, but the deputy has no recorded check-in acknowledging it, and the window opens within a week. An unacknowledged hand-over is a document, not a plan.',
      severity: 4,
      evidence: [`${readiness.acknowledged}/${readiness.planned} acknowledged`, `${readiness.daysToAbsence} day(s) until the window`, `Window ${readiness.windowStart} → ${readiness.windowEnd}`],
      route: '#/handover',
      confidence: 'high',
    }));
  }
  // LCS-06: a commissioned hand-over has a returned cover delegation without a
  // backup deputy, or a cover delegation closed on paper while 0 covered source
  // records moved.
  const impl = report.implementation;
  if (impl?.found && (impl.returned > impl.returnedRecovered || impl.paperOnly > 0)) {
    const unrecovered = Math.max(0, impl.returned - impl.returnedRecovered);
    out.push(signal({
      ruleId: 'LCS-06',
      title: unrecovered > 0
        ? `Hand-over for ${impl.windowStart} has ${unrecovered} returned cover delegation(s) with no backup deputy`
        : `Hand-over for ${impl.windowStart} has ${impl.paperOnly} paper-only completion(s) with 0 covered records moved`,
      detail: unrecovered > 0
        ? 'A deputy returned a commissioned cover delegation and no eligible backup deputy cleared the evidence floor. Re-assign cover or pull the obligations forward before the absence window.'
        : 'A cover delegation was closed as done, but none of the underlying obligations linked to it has a dated decision, resolution or contact in the window.',
      severity: 4,
      evidence: [
        `Window ${impl.windowStart} → ${impl.windowEnd}`,
        `Verified execution ${impl.completedVerified}/${impl.planned}, paper-only ${impl.paperOnly}, returned ${impl.returned}`,
        `Covered source records moved: ${impl.sourcesMoved}/${impl.sourcesTotal}`,
      ],
      route: '#/handover',
      confidence: 'high',
    }));
  }
  // LCS-07: a service or vendor dependency with a survival shortfall (TTR > TTS)
  // pulls two or more deputies (or deputies across multiple teams) into incident
  // recovery at once while those deputies hold critical absence-window work.
  const contagion = report.vendorContagion;
  const crossChokes = (contagion?.crossTeamChokePoints || []).filter((c) => c.criticalObligationsAtRisk > 0);
  if (crossChokes.length > 0) {
    const top = crossChokes[0];
    out.push(signal({
      ruleId: 'LCS-07',
      title: `${crossChokes.length} vendor/service dependency choke point(s) pull multiple cover deputies into simultaneous recovery`,
      detail: `An outage on “${top.name}” (${top.maxShortfallDays}d survival shortfall) pulls ${top.stewardNames.join(', ')} into incident recovery at the same time while they are the primary cover for ${top.criticalObligationsAtRisk} critical absence-window obligation(s).`,
      severity: 3,
      evidence: [
        `${top.name}: TTR ${top.ttrDays}d vs TTS ${top.ttsDays ?? 0}d (${top.maxShortfallDays}d shortfall)`,
        `Stewards in deputy pool: ${top.stewardNames.join(', ')} (${top.teamsAffected.join(', ') || 'unassigned team'})`,
        `${top.criticalObligationsAtRisk} critical obligation(s) at risk in window`,
      ],
      route: '#/handover',
      confidence: 'medium',
    }));
  }
  return out;
}

export function buildLeaderContinuityReport(state = {}, {
  now = new Date(),
  horizonDays = null,
  leaderName = null,
  minFitPct = null,
  commonCausePct = null,
  secondShockPct = null,
  vendorShockPct = null,
  seed = CONTINUITY_SEED,
  trials = CONTINUITY_TRIALS,
} = {}) {
  const settings = state.settings || {};
  const horizon = clampInt(horizonDays ?? settings.continuityHorizonDays, 1, 90, CONTINUITY_DEFAULT_HORIZON_DAYS);
  const fitFloor = clampInt(minFitPct ?? settings.continuityMinFitPct, 1, 100, CONTINUITY_MIN_FIT_PCT);
  const commonCause = clampInt(commonCausePct ?? settings.continuityCommonCausePct, 0, 100, CONTINUITY_COMMON_CAUSE_PCT);
  const secondShock = clampInt(secondShockPct ?? settings.continuitySecondShockPct, 0, 100, CONTINUITY_SECOND_SHOCK_PCT);
  const inventory = leaderDemandInventory(state, { now, horizonDays: horizon, leaderName });
  const deputies = buildDeputyPool(state);
  const simulation = simulateLeaderAbsence(inventory, deputies, { minFitPct: fitFloor, seed, trials, state });
  const correlated = simulateCorrelatedAbsence(inventory, deputies, {
    minFitPct: fitFloor, commonCausePct: commonCause, seed, trials, state,
  });
  const vendorContagion = vendorCommonModeContagion(inventory, deputies, {
    minFitPct: fitFloor,
    commonCausePct: commonCause,
    secondShockPct: secondShock,
    vendorShockPct,
    seed,
    trials,
    state,
  });
  simulation.correlated = correlated;
  simulation.vendorContagion = vendorContagion;
  // The independent model's own text said shared causes were "not modelled".
  // From v46 they are, in a stated stress convention, so say which is which.
  simulation.assumptions = [
    'The exact count distribution below still assumes independent items; the correlated stress model and multi-shock/vendor contagion model remove that assumption.',
    ...simulation.assumptions.slice(1),
  ];
  const coverPlan = buildCoverPlan(inventory, deputies, { minFitPct: fitFloor, state });
  const concentration = coverConcentration(inventory, deputies, { minFitPct: fitFloor, state });
  const residual = residualAfterCover(inventory, simulation, coverPlan, deputies, state);
  const drills = (state.continuityDrills || []).map((drill) => ({
    ...drill,
    score: drill.status === 'closed' ? scoreDrillRecord(drill, { state, now }) : null,
  }));
  const calibration = drillCalibration(drills);
  const openDrill = drills.find((d) => d.status === 'open') || null;
  const readiness = handoverReadiness(state, { now, windowStart: inventory.windowStart });
  const implementation = handoverImplementation(state, { now, windowStart: inventory.windowStart });
  const verdict = !inventory.items.length
    ? { id: 'nothing-in-window', label: 'Nothing falls due', detail: `No dated obligation requires your presence in the next ${horizon} days.` }
    : coverPlan.uncoveredKeys.length > 0
      ? { id: 'thin-cover', label: 'Thin cover', detail: `${coverPlan.uncoveredKeys.length} critical item(s) have no cover. The plan covers ${coverPlan.coveragePct}% of critical weight.` }
      : inventory.counts.criticalHeld >= 2
        ? { id: 'structural-single-point', label: 'Structural single point', detail: `${inventory.counts.criticalHeld} critical items cannot be delegated by convention. Move or accept them; do not cover them on paper.` }
        : { id: 'coverable', label: 'Coverable', detail: `A ${coverPlan.totalMinutes}-minute hand-over covers every critical item in the window.` };
  const report = {
    ok: true,
    engine: CONTINUITY_ENGINE_VERSION,
    asOf: dayKey(now),
    inventory,
    deputies,
    simulation,
    vendorContagion,
    coverPlan,
    concentration,
    residual,
    planKey: coverPlanKey(coverPlan, inventory),
    drills,
    openDrill,
    calibration,
    readiness,
    implementation,
    verdict,
  };
  return { ...report, signals: continuitySignals(report) };
}

/* ------------------------------------------------------------------- brief */

export function continuityBrief(state = {}, options = {}) {
  const report = buildLeaderContinuityReport(state, options);
  const { inventory, simulation, vendorContagion, coverPlan, calibration, verdict } = report;
  const lines = [];
  lines.push(`LEADER CONTINUITY — ${report.asOf}`);
  lines.push(`Identity: ${inventory.leaderName || 'leader not recorded'} · window ${inventory.windowStart} → ${inventory.windowEnd} (${inventory.horizonDays} days)`);
  lines.push(`Verdict: ${verdict.label}. ${verdict.detail}`);
  lines.push('');
  lines.push(`Demand: ${inventory.counts.total} obligations · ${inventory.counts.critical} critical · ${inventory.counts.criticalHeld} critical and non-delegable · ${inventory.counts.unpricedCritical} critical without a recorded amount.`);
  lines.push(`Stalls: expected ${simulation.exact.expectedStalled} · P50 ${simulation.exact.p50} · P80 ${simulation.exact.p80} · P90 ${simulation.exact.p90}. Exact Poisson-binomial count distribution; independence assumed.`);
  const currencies = Object.keys(simulation.tail).sort();
  if (currencies.length) {
    for (const c of currencies) {
      const t = simulation.tail[c];
      lines.push(`Exposure ${c}: expected ${t.expected.toLocaleString('en-US')} · P90 ${t.p90.toLocaleString('en-US')} · expected shortfall(90) ${t.cvar90.toLocaleString('en-US')} over the priced subset only.`);
    }
  } else {
    lines.push('Exposure: no critical item records a currency amount. No synthetic value is assigned.');
  }
  lines.push('');
  lines.push(`Cover plan (${coverPlan.method === 'exact-branch-and-bound' ? 'exact minimum' : 'greedy heuristic'}; ${coverPlan.totalMinutes} setup minutes):`);
  for (const action of coverPlan.actions) {
    lines.push(`  - ${action.deputyName}: hold ${CONTINUITY_KIND_LABELS[action.stallKind]} for ${action.itemKeys.length} item(s) · avg fit ${action.avgFit} · ${action.setupMinutes} min`);
  }
  if (!coverPlan.actions.length) lines.push('  - No cover action is possible with the recorded evidence.');
  if (coverPlan.uncoveredKeys.length) lines.push(`Uncovered critical items: ${coverPlan.uncoveredKeys.length}.`);
  lines.push(`Modelled residual after cover: expected ${report.residual.expectedStalled} stall(s), ${report.residual.expectedCriticalStalled} critical.`);
  lines.push(`Concentration: ${report.concentration.criticalSinglePoint.length} of ${report.concentration.critical.length} critical item(s) have exactly one eligible deputy at the ${report.concentration.minFitPct}% evidence floor; ${report.concentration.critical.filter((row) => row.eligibleCount === 0).length} have none.`);
  lines.push(`Correlated stress (${simulation.correlated.commonCausePct}% shared cause, ${simulation.correlated.individualAbsencePct}% individual absence): mean ${simulation.correlated.mean} stalls · P50 ${simulation.correlated.p50} · P90 ${simulation.correlated.p90}, versus ${simulation.correlated.vsIndependent.expectedStalled} under independence (mean lift ${simulation.correlated.vsIndependent.meanLiftPct ?? 'n/a'}%, P90 lift ${simulation.correlated.vsIndependent.p90LiftPct ?? 'n/a'}%). One recorded team is offline at a time.`);
  if (vendorContagion) {
    lines.push(`Multi-shock & vendor contagion (${vendorContagion.commonCausePct}% primary team shock, ${vendorContagion.secondShockPct}% second shock, ${vendorContagion.chokePoints.length} dependency choke point(s)): mean ${vendorContagion.mean} stalls · P50 ${vendorContagion.p50} · P90 ${vendorContagion.p90} (${vendorContagion.crossTeamChokePoints.length} cross-team/multi-deputy choke point(s)).`);
  }
  const readiness = report.readiness;
  const impl = report.implementation;
  if (readiness?.found) {
    lines.push(`Hand-over briefing: ${readiness.acknowledged}/${readiness.planned} cover delegation(s) acknowledged by a recorded check-in; window ${readiness.windowStart} → ${readiness.windowEnd}, ${readiness.daysToAbsence} day(s) away. ${readiness.verdict.label}.`);
    if (impl?.found) {
      lines.push(`Hand-over execution & source movement: ${impl.completedVerified} verified done · ${impl.activeExecuting} active executing · ${impl.paperOnly} paper-only · ${impl.returned} returned (${impl.returnedRecovered} recovered) · ${impl.sourcesMoved}/${impl.sourcesTotal} covered source record(s) moved. ${impl.verdict.label}.`);
    }
  } else {
    lines.push('Hand-over briefing: no cover plan has been commissioned for a window starting today.');
  }
  lines.push('');
  lines.push(`Drills: ${calibration.drills} closed · ${calibration.predictions} scored predictions · Brier ${calibration.brier ?? 'not reported'} · skill ${calibration.skill ?? 'not reported'} · model misses ${calibration.modelMisses} · implementation drops ${calibration.implementationDrops} · execution-conditioned Brier ${calibration.executionConditionedBrier ?? 'not reported'}. ${calibration.verdict}`);
  lines.push('');
  lines.push('Boundaries: coverage is a model of recorded fit and availability, not a measured failure rate. The exact distribution assumes independence; the correlated and multi-shock models use stated stress conventions and recorded dependency failure probabilities. Money appears only where the workspace records it. Non-delegable work is listed, never covered on paper. Drill attribution separates dropped hand-over implementation from stall-model fit misses using recorded check-ins and covered-source dates.');
  return lines.join('\n');
}
