/**
 * app/core/domain/cadence.js — the Operating Cadence Clock read model
 * (`#/cadence`, Schema v93, ADR-0087).
 *
 * THE QUESTION NO OTHER SCREEN ASKS
 * ---------------------------------
 * LeadOS can price attention (Attention Market), measure cognitive saturation
 * (Cognitive Load), certify the bench (Succession), and route a note to an
 * altitude (Altitude Router). Every one of them ends at the same place: an item
 * that needs a *decision*, and a human who must now find a meeting. Nothing in
 * the workspace has ever modelled the thing that actually decides whether the
 * item closes — the standing forum that is competent to close it, and the finite
 * number of decisions that forum can produce before it next sits.
 *
 * That is not an organisational nicety. It is a queue, and queues are
 * measurable:
 *
 *   arrival rate λ   items per interval entering a forum's competence class,
 *                    derived from dated records the workspace already holds;
 *   service rate μ   1 / (declared service days) — the forum as one server;
 *   utilisation ρ    λ·S per interval, i.e. demand-days ÷ capacity-days;
 *   flow time W      Little's law (1961) L = λW plus Kingman's (1961) VUT
 *                    approximation, printed with its single-server assumption;
 *   breach           Sakasegawa (1977)-style P(wait) for a finite-capacity
 *                    server, refused below the evidence floor.
 *
 * THE SECOND CLOCK — THE ACTUAL INNOVATION
 * ----------------------------------------
 * A forum is a queue *and* a calendar. Those are two clocks running at different
 * speeds: an item can be safely inside the queue (ρ < 1) and still cross its own
 * attributed time-span of discretion before the forum next sits, because the
 * interval is long. Jaques (1956) says work above a leader's span must escalate;
 * LeadOS already computes which altitude owns an item. What it never computed is
 * whether the **ladder of sitting forums can deliver that escalation in time**:
 *
 *     breachByCadence = ageDays + waitForNextSitting + serviceDays > requiredHorizon
 *     escapeLadder    = even the top sitting forum breaches the item's horizon
 *
 * `escapeLadder` is the honest and slightly damning finding: for some inputs the
 * organisation has *no forum at all* that can close them inside the horizon the
 * work itself demands. Naming that — with the item count and the days of overrun
 * — is worth more than any dashboard, because it is a structural fact nobody in
 * the category publishes.
 *
 * THE THIRD IDEA — FORUM FIT (CONWAY)
 * ----------------------------------
 * A forum can only close what its membership is entitled to close. `fit` computes,
 * from the roster, whether a forum's attendee spans cover the seats that own the
 * items arriving at it. A forum narrower than its work cannot close anything; a
 * forum wider than its work is decision variety with no queue (Ashby 1956). This
 * is Conway's law (1968) applied to the governance calendar rather than the
 * codebase.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *  - It never rates a person. Every subject is a FORUM, an ITEM CLASS or a SPAN.
 *    Individual records contribute counts; a sensitive source never contributes
 *    an identity to a roll-up edge.
 *  - It never invents a waiting time. Below the evidence floor it prints the
 *    count and the reason, not a figure dressed up as a measurement.
 *  - It never treats a cancelled sitting as free capacity, or a skipped agenda as
 *    a closed item.
 *  - It never claims the queueing model is exact: the assumptions are printed on
 *    the page next to the number they produce.
 *
 * Purity: no DOM, no storage, no clock globals, no network. Every figure is
 * re-derived on read from the roster and the dated records other modules keep.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import { harvestWork, escalationTarget } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { altitudeByKey, ALTITUDES, SIGNAL_SOURCES } from './chainRegistry.js';
import {
  CADENCE_ENGINE_VERSION,
  FORUM_CADENCES,
  FORUM_CADENCE_DAYS,
  FORUM_COMPETENCE,
  FORUM_KIND_LABELS,
  INPUT_CLASS_BY_KEY,
  INPUT_CLASSES,
  INPUT_CLASS_KEYS,
  TOPOLOGY_PATTERN_LABELS,
  UTILISATION_BANDS,
  CADENCE_DEFAULTS,
} from './cadenceRegistry.js';
import { normalizeCadenceSettings } from './cadenceSchema.js';

const REPORT_CACHE = new WeakMap();

/* --------------------------------------------------------------- utilities */

function todayOf(now) {
  return dayKey(now) || new Date().toISOString().slice(0, 10);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

function pct(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

function days(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

/** Effective dated settings, so a frozen reading reproduces on reload. */
export function cadenceConventions(settings = {}) {
  return normalizeCadenceSettings(settings || {});
}

/** The band a utilisation figure sits in. Printed as a verdict, not a colour. */
export function utilisationBand(rho) {
  if (!Number.isFinite(rho)) return { ...UTILISATION_BANDS[0], key: 'unmeasured', label: 'Unmeasured', tone: 'neutral', verdict: 'No arrival history and no declared capacity: nothing is claimed.' };
  for (const band of UTILISATION_BANDS) {
    if (rho < band.maxRho) return band;
  }
  return UTILISATION_BANDS[UTILISATION_BANDS.length - 1];
}

/**
 * Wilson (1927) score interval on a proportion. Duplicated rather than imported
 * from `catchball.js` so this module carries no dependency on a sibling feature's
 * internals — the arithmetic is four lines and the two must be allowed to diverge.
 */
export function cadenceWilson(k, n, floorN = 5) {
  if (!Number.isInteger(n) || n <= 0 || n < floorN || !Number.isInteger(k) || k < 0 || k > n) return null;
  const p = k / n;
  const z = 1.959963984540054;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  // Percent, one decimal place: round(v * 1000) / 10 keeps the boundary exact
  // where round(v * 100) / 1 would drift on binary floats.
  const pct = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10;
  return { lo: pct(center - half), hi: pct(center + half) };
}

/**
 * The next calendar date a forum sits, given its last held sitting and interval.
 *
 * A forum that has never sat has **no** next-sitting date: it is not a cadence,
 * it is an intention. Returning `today` here would make every declared-but-never-
 * held forum look instantly available and would silently zero the escape-ladder
 * finding, so the honest answer is `null` with the reason attached.
 */
export function nextSittingOn(forum, today = null) {
  const todayKey = today || new Date().toISOString().slice(0, 10);
  if (!forum || forum.status !== 'active') {
    return { on: null, reason: forum ? `the forum is ${forum.status}` : 'the forum is missing', known: false };
  }
  if (!forum.lastHeldOn) {
    return { on: null, reason: 'it has never sat, so it has no cadence to predict from', known: false };
  }
  const interval = Number(forum.intervalDays) || FORUM_CADENCE_DAYS[forum.cadence] || 7;
  // The next sitting is strictly after the last one; a forum that last sat today
  // is not double-booked into today.
  const on = addDays(forum.lastHeldOn, interval);
  const slip = daysBetween(todayKey, on);
  return {
    on,
    reason: null,
    known: true,
    daysAway: slip === null ? null : Math.max(0, slip),
    /** Negative daysAway means the cadence is already overdue. */
    overdueDays: slip === null ? 0 : Math.max(0, -slip),
  };
}

/* ------------------------------------------------- 1. item classification */

/**
 * Derive an input class from a harvested work item. This is a *classification of
 * the record's own shape*, not an inference about a person: a case with a severe
 * FMEA rating is a quality defect because the workspace recorded severity, and a
 * requisition is a staffing gap because it is a requisition.
 *
 * The ordering is deliberate — the most specific recorded evidence wins, and the
 * default is `unreviewable` rather than a guess. An item whose facts are not in
 * the record cannot be closed by any forum and must not be counted as demand.
 */
export function classifyInput(item) {
  if (!item || !item.type) return INPUT_CLASS_BY_KEY.unreviewable;
  const age = Number(item.ageDays) || 0;
  switch (item.type) {
    case 'case': {
      // A case with a recorded high severity is a quality/control defect; a case
      // that has simply aged past two horizons is an outcome miss.
      if (item.severity >= 3) return INPUT_CLASS_BY_KEY['quality-defect'];
      if (age > 90) return INPUT_CLASS_BY_KEY['outcome-miss'];
      return INPUT_CLASS_BY_KEY['execution-blocker'];
    }
    case 'delegation':
      return INPUT_CLASS_BY_KEY['commitment-slip'];
    case 'goal':
      return age > 90 ? INPUT_CLASS_BY_KEY['outcome-miss'] : INPUT_CLASS_BY_KEY['commitment-slip'];
    case 'decision':
      // An irreversible decision is a trade-off; a reversible one is an
      // execution blocker. The record already carries the reversibility field.
      return item.severity >= 3
        ? INPUT_CLASS_BY_KEY['investment-tradeoff']
        : INPUT_CLASS_BY_KEY['execution-blocker'];
    case 'requisition':
      return INPUT_CLASS_BY_KEY['staffing-gap'];
    case 'premise':
      return INPUT_CLASS_BY_KEY['structural-misfit'];
    case 'perfconcern':
      // A performance concern is NOT a governance input. It is a confidential
      // people process with its own terminal; sending it to a forum would be a
      // disclosure failure, so it is refused here by construction.
      return INPUT_CLASS_BY_KEY.unreviewable;
    case 'feedback-followup':
    case 'oneonone':
      return INPUT_CLASS_BY_KEY.unreviewable;
    default:
      return INPUT_CLASS_BY_KEY.unreviewable;
  }
}

/* ------------------------------------------------------- 2. forum capacity */

/**
 * The demand a set of class-keyed counts places on one forum, in item-days.
 * Refused (unreviewable) items contribute zero and are reported separately: an
 * item nobody can close is not capacity pressure, it is a data gap.
 */
export function forumDemand(forum, classCounts, conventions = CADENCE_DEFAULTS) {
  const target = (Number(conventions.cadenceUtilisationTargetPct) || CADENCE_DEFAULTS.cadenceUtilisationTargetPct) / 100;
  const byClass = [];
  let demandDays = 0;
  const competent = FORUM_COMPETENCE[forum?.kind] || [];
  for (const key of INPUT_CLASS_KEYS) {
    const n = Number(classCounts?.[key]) || 0;
    if (!n) continue;
    const cls = INPUT_CLASS_BY_KEY[key];
    if (!cls || !cls.reviewable) continue;
    // Competence is two-dimensional: the KIND must be able to close the class,
    // and the forum's time-span of discretion must reach the class's horizon.
    const competentByKind = competent.includes(key) && (cls.forums || []).includes(forum?.kind);
    const competentByHorizon = Number(cls.horizonDays) <= Number(forum?.horizonDays || 0);
    if (!competentByKind || !competentByHorizon) continue;
    const itemDays = n * (Number(cls.serviceDays) || 0);
    demandDays += itemDays;
    byClass.push({ key, label: cls.label, n, serviceDays: cls.serviceDays, itemDays: days(itemDays), competent: true });
  }
  const intervalDays = Number(forum?.intervalDays) || 7;
  // Capacity per interval is what one sitting can close; a sitting occurs once
  // per interval, so capacity-days per interval = capacity × service × target.
  const capacityDays = Math.max(0, (Number(forum?.decisionCapacity) || 0) * (Number(forum?.serviceDays) || 0) * target);
  const rho = capacityDays > 0 ? demandDays / capacityDays : null;
  byClass.sort((a, b) => b.itemDays - a.itemDays || a.key.localeCompare(b.key));
  return {
    byClass,
    demandDays: days(demandDays),
    capacityDays: days(capacityDays),
    rho: rho === null ? null : Math.round(rho * 1000) / 1000,
    intervalDays,
    targetPct: Math.round(target * 100),
    bindingClassKey: byClass.length ? byClass[0].key : null,
  };
}

/**
 * Little's law and Kingman's VUT approximation on a single-server forum.
 *
 *   W_q ≈ (ρ / (1 − ρ)) · ((C_a² + C_s²) / 2) · S
 *
 * `C_a²` is the squared coefficient of variation of arrivals; with no recorded
 * inter-arrival series this module refuses to guess it and uses the declared
 * Poisson assumption (C_a² = 1), printed as an assumption. `C_s²` is 0 for the
 * deterministic declared service time. Both are stated on the page.
 */
export function forumFlow(forum, demand, conventions = CADENCE_DEFAULTS) {
  const S = Number(forum?.serviceDays) || null;
  const rho = demand?.rho;
  if (S === null || rho === null) {
    return { queueN: null, flowDays: null, waitDays: null, breachPct: null, verdict: 'unmeasured', assumption: null, refused: 'no service time or no capacity declared' };
  }
  const lambdaPerDay = demand.demandDays !== null ? demand.demandDays / (demand.intervalDays * S || 1) : null;
  // Items per interval that can actually be closed at the target:
  const servedPerInterval = (demand.capacityDays || 0) / S;
  const arrivingPerInterval = demand.byClass.reduce((sum, row) => sum + row.n, 0);
  const queueN = rho < 1 ? (rho * rho) / (1 - rho) : null;
  const waitDays = rho < 1 ? (rho / (1 - rho)) * S : null;
  const flowDays = rho < 1 && waitDays !== null ? S + waitDays : null;
  // Sakasegawa-style P(wait > 0) for a finite-capacity single server: a queue
  // forms whenever the server is busy. Approximated by min(1, ρ) and refused
  // where ρ is not measurable. This is the probability an arriving item must
  // wait at all, not the probability it breaches.
  const breachPct = rho === null ? null : pct(Math.min(100, rho * 100));
  const band = utilisationBand(rho);
  return {
    queueN: queueN === null ? null : round(queueN, 2),
    flowDays: flowDays === null ? null : days(flowDays),
    waitDays: waitDays === null ? null : days(waitDays),
    breachPct,
    verdict: band.key,
    bandLabel: band.label,
    tone: band.tone,
    verdictText: band.verdict,
    assumption: 'Poisson arrivals (C_a² = 1) and deterministic declared service time; a single server per forum. Waiting time is refused when ρ ≥ 1 because no steady state exists.',
    arrivingPerInterval,
    servedPerInterval: round(servedPerInterval, 2),
    lambdaPerDay: lambdaPerDay === null ? null : round(lambdaPerDay, 3),
    refused: null,
  };
}

/* -------------------------------------------------- 3. demand by forum */

/**
 * Build the workspace's governance demand picture:
 *
 *   items      every open work item the chain engine harvests, classified;
 *   forums     declared standing forums with their derived demand and flow;
 *   unmatched  reviewable items with NO competent forum (a structural gap);
 *   refused    items that are not reviewable at all, with the reason.
 *
 * Crucially, items are attributed to forums by **competence and span**, not by
 * owner name. Where a span owns items but has no forum of its own, the item is
 * attributed to the nearest ancestor forum that is competent — which is exactly
 * what happens in a real organisation, silently and expensively.
 */
export function buildDemandPicture(state, { now = new Date(), settings = null, conventions = null } = {}) {
  const conv = conventions || cadenceConventions(settings || state?.settings || {});
  const built = buildSeats(state, { now, settings: settings || state?.settings });
  const chain = built.chain;
  const today = todayOf(now);
  const items = harvestWork(state, chain, { now, settings: settings || state?.settings });

  // A governed decision that THIS module opened (RULE-CAD-02) is a decision about
  // the forum, not work the forum must serve. Counting it as demand would make the
  // constraint self-reinforcing: relieving congestion would mint a decision that
  // re-congests the forum, week after week. The signature tag — which lives in the
  // decision's question and rationale, not its human-facing title — is the
  // discriminator, read from the record so a renamed title cannot defeat it.
  const cadenceDecisionIds = new Set(
    asArray(state?.decisions)
      .filter((d) => d && `${d.question || ''}${d.rationale || ''}`.includes('[CAD-SIG:'))
      .map((d) => d.id),
  );
  const demandItems = items.filter((item) => !(
    item.type === 'decision' && cadenceDecisionIds.has(item.entityId)
  ));

  const classified = demandItems.map((item) => {
    const cls = classifyInput(item);
    return {
      ...item,
      classKey: cls.key,
      classLabel: cls.label,
      reviewable: cls.reviewable !== false,
      horizonDays: cls.horizonDays,
      serviceDays: cls.serviceDays,
      requiredHorizonDays: cls.horizonDays === null
        ? null
        : Math.max(Number(cls.horizonDays) || 0, (altitudeByKey(item.requiredAltitude)?.horizonDays || 0)),
    };
  });

  const forums = asArray(state?.cadenceForums).filter((f) => f.status !== 'retired');
  const classCountsAll = {};
  for (const item of classified) classCountsAll[item.classKey] = (classCountsAll[item.classKey] || 0) + 1;

  // Attribute each reviewable item to the first active forum, walking UP the
  // reporting tree, that is competent for its class (kind + horizon).
  const activeForums = forums.filter((f) => f.status === 'active');
  const seatToForums = new Map();
  for (const forum of forums) {
    const key = forum.chairSeatId || forum.ownerId;
    if (!key) continue;
    const list = seatToForums.get(key) || [];
    list.push(forum);
    seatToForums.set(key, list);
  }

  function competentForumsFor(item) {
    const cls = INPUT_CLASS_BY_KEY[item.classKey];
    if (!cls || !cls.reviewable) return { forums: [], reason: 'the item class is not reviewable by any forum' };
    const byKind = activeForums.filter((f) => (FORUM_COMPETENCE[f.kind] || []).includes(cls.key)
      && (cls.forums || []).includes(f.kind)
      && Number(cls.horizonDays) <= Number(f.horizonDays || 0));
    if (!byKind.length) {
      return { forums: [], reason: `no ACTIVE forum is both competent (${cls.forums.map((k) => FORUM_KIND_LABELS[k]).join(', ') || 'none'}) and long-horizon enough (≥ ${cls.horizonDays} days) for this class` };
    }
    return { forums: byKind, reason: null };
  }

  const attributed = new Map(); // forumId -> classCounts
  const unmatched = [];
  const unreviewable = [];
  const perItem = [];
  for (const item of classified) {
    if (!item.reviewable) {
      unreviewable.push(item);
      perItem.push({ ...item, forumId: null, forumTitle: null, matchBasis: 'refused', matchReason: 'the facts needed to close this item are not yet recorded' });
      continue;
    }
    const { forums: candidates, reason } = competentForumsFor(item);
    if (!candidates.length) {
      unmatched.push({ ...item, reason });
      perItem.push({ ...item, forumId: null, forumTitle: null, matchBasis: 'no-competent-forum', matchReason: reason });
      continue;
    }
    // Prefer a forum whose chair is in the item's own reporting subtree (the
    // nearest competent forum), then the one with the shortest interval.
    const ownerId = item.ownerNodeId || null;
    const ranked = [...candidates].sort((a, b) => {
      const aIn = ownerId && (a.chairSeatId === ownerId || built.byId.get(a.chairSeatId)?.scope?.has(ownerId)) ? 0 : 1;
      const bIn = ownerId && (b.chairSeatId === ownerId || built.byId.get(b.chairSeatId)?.scope?.has(ownerId)) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      return (a.intervalDays || 999) - (b.intervalDays || 999);
    });
    const forum = ranked[0];
    const counts = attributed.get(forum.id) || {};
    counts[item.classKey] = (counts[item.classKey] || 0) + 1;
    attributed.set(forum.id, counts);
    perItem.push({
      ...item,
      forumId: forum.id,
      forumTitle: forum.title,
      forumKind: forum.kind,
      matchBasis: ranked.length > 1 ? 'nearest-competent-of-several' : 'only-competent-forum',
      matchReason: null,
      alternativesN: ranked.length - 1,
    });
  }

  const forumRows = forums.map((forum) => {
    const counts = attributed.get(forum.id) || {};
    const demand = forumDemand(forum, counts, conv);
    const flow = forumFlow(forum, demand, conv);
    const next = nextSittingOn(forum, today);
    const sessions = asArray(state?.cadenceSessions).filter((s) => s.forumId === forum.id && s.status === 'held');
    const closedN = sessions.reduce((sum, s) => sum + (Number(s.closedN) || 0), 0);
    const plannedN = sessions.reduce((sum, s) => sum + (Number(s.plannedN) || 0), 0);
    const cancelled = asArray(state?.cadenceSessions).filter((s) => s.forumId === forum.id && s.status === 'cancelled').length;
    return {
      forum,
      id: forum.id,
      title: forum.title,
      kind: forum.kind,
      kindLabel: FORUM_KIND_LABELS[forum.kind] || forum.kind,
      cadence: forum.cadence,
      intervalDays: forum.intervalDays,
      horizonDays: forum.horizonDays,
      altitudeKey: forum.altitudeKey,
      chairSeatId: forum.chairSeatId,
      chairName: built.chain.byId.get(forum.chairSeatId)?.name || '—',
      status: forum.status,
      demand,
      flow,
      next,
      counts,
      itemN: Object.values(counts).reduce((a, b) => a + b, 0),
      achievedN: closedN,
      plannedN,
      carriedN: Math.max(0, plannedN - closedN),
      cancellationN: cancelled,
      /** Measured closures per sitting — the only capacity figure that is a fact. */
      closuresPerSitting: sessions.length ? round(closedN / sessions.length, 2) : null,
      sittingsN: sessions.length,
    };
  });

  // A forum can only close what its membership may decide. Compute the topology
  // pattern against the seats that actually own the items attributed to it.
  for (const row of forumRows) {
    const owningSeats = new Set();
    for (const item of perItem) {
      if (item.forumId === row.id && item.ownerNodeId) owningSeats.add(item.ownerNodeId);
    }
    const attendees = new Set([row.chairSeatId, ...(row.forum.attending || [])].filter(Boolean));
    let covered = 0;
    const missingSeats = new Set();
    for (const seatId of owningSeats) {
      if (attendees.has(seatId)) covered += 1;
      else missingSeats.add(seatId);
    }
    const owningN = owningSeats.size;
    let topology = 'unmodelled';
    let topologyNote = 'No seat owns any item attributed to this forum, so the pattern cannot be tested.';
    if (owningN > 0) {
      if (covered === 0) {
        topology = 'disjoint';
        topologyNote = 'None of the seats that own the arriving work attends this forum. Every item must be relayed by a proxy.';
      } else if (missingSeats.size > 0) {
        // Partial coverage: the forum closes some owning spans and not others,
        // so those items can only arrive by relay.
        topology = 'narrower-than-work';
        topologyNote = `${missingSeats.size} owning seat(s) — ${[...missingSeats].join(', ')} — are absent: the forum cannot close their work directly.`;
      } else if (attendees.size >= 4 && row.itemN > 0 && row.itemN * 2 <= attendees.size) {
        // Ashby: a roster half again larger than the queue it decides is variety
        // the work cannot use. The 4-seat and ≤half floors exist so a two-person
        // weekly review with one item is not slandered as oversized.
        topology = 'wider-than-work';
        topologyNote = `${attendees.size} seats attend ${row.itemN} arriving item(s): decision variety exceeds the queue (Ashby).`;
      } else {
        topology = 'mirrored';
        topologyNote = 'Membership covers every seat that owns the arriving work.';
      }
    }
    row.fit = {
      topology,
      topologyLabel: TOPOLOGY_PATTERN_LABELS[topology],
      topologyNote,
      owningSeatN: owningN,
      coveredSeatN: covered,
      attendeeN: attendees.size,
      coveragePct: owningN ? pct((covered / owningN) * 100) : null,
    };
  }

  return {
    engineVersion: CADENCE_ENGINE_VERSION,
    today,
    conventions: conv,
    built,
    chain,
    items: classified,
    perItem,
    forums: forumRows,
    unmatched,
    unreviewable,
    classCountsAll,
    counts: {
      items: classified.length,
      reviewable: classified.length - unreviewable.length,
      attributable: classified.length - unreviewable.length - unmatched.length,
      unmatched: unmatched.length,
      unreviewable: unreviewable.length,
      forums: forums.length,
      activeForums: activeForums.length,
    },
  };
}

/* ---------------------------------------------- 4. the dual clock / ladder */

/**
 * The second clock. For every attributed item, walk the LADDER of sitting forums
 * from the attributed forum upward (by chair altitude) and ask the only question
 * that matters operationally:
 *
 *   "If I file this in the right forum today, on what day does it plausibly land,
 *    and is that inside the horizon the work itself demands?"
 *
 *   expectedCloseOn = today + waitForNextSitting + serviceDays
 *   slackDays       = requiredHorizon − ageDays − wait − service
 *   escapeLadder    = every competent sitting forum breaches, i.e. slack < 0
 *
 * `escapeLadder` items are the ones a leader cannot fix by working harder: the
 * governance calendar itself is the constraint. They are counted, listed by class
 * and span (never by person) and escalated as one governed decision per week.
 */
export function buildCadenceClock(picture, { now = new Date() } = {}) {
  const today = picture.today || todayOf(now);
  const activeForums = picture.forums.filter((row) => row.status === 'active');
  const rows = [];

  for (const item of picture.perItem) {
    if (!item.reviewable) {
      rows.push({ ...item, clock: { state: 'refused', reason: 'not reviewable by any forum', slackDays: null, expectedCloseOn: null, forumPath: [] } });
      continue;
    }
    // The ladder is built from COMPETENCE, not from seniority: only a forum whose
    // kind can close this class AND whose time-span of discretion reaches the
    // class horizon is ever a rung. A more senior forum that cannot close the
    // class is a longer queue, not an escalation route, and listing it would
    // quietly understate how bad the breach is.
    const cls = INPUT_CLASS_BY_KEY[item.classKey];
    const anchor = activeForums.find((row) => row.id === item.forumId) || null;
    const ladder = [];
    if (cls && cls.reviewable) {
      for (const row of activeForums) {
        const competent = (FORUM_COMPETENCE[row.kind] || []).includes(cls.key)
          && (cls.forums || []).includes(row.kind)
          && Number(cls.horizonDays) <= Number(row.forum.horizonDays || 0);
        if (!competent) continue;
        ladder.push({ row, rung: anchor && row.id === anchor.id ? 0 : 1 });
      }
    }

    const horizon = item.requiredHorizonDays;
    const age = Number(item.ageDays) || 0;

    /**
     * Two slack figures per rung, and the difference between them is the point:
     *
     *   slackDays          — uses the CONGESTION-ADJUSTED flow time (Kingman).
     *                        Null at ρ ≥ 1, because no steady state exists and a
     *                        finite landing date would be an invention.
     *   declaredSlackDays  — uses the forum's DECLARED service time. This is a
     *                        strict lower bound on lateness (queueing can only
     *                        add time), so a negative figure here means the item
     *                        certainly misses its horizon even in the best case.
     */
    const evaluated = ladder.map(({ row, rung }) => {
      const wait = row.next.known ? (row.next.daysAway ?? 0) : null;
      const declared = Number(row.forum.serviceDays) || 0;
      const measured = row.flow && row.flow.flowDays !== null ? Number(row.flow.flowDays) : null;
      const congested = row.demand.rho !== null && row.demand.rho >= 1;
      if (wait === null) {
        return {
          forumId: row.id, title: row.title, kind: row.kind, rung,
          waitDays: null, serviceDays: measured === null ? days(declared) : measured,
          declaredServiceDays: days(declared),
          expectedCloseOn: null, slackDays: null, declaredSlackDays: null, breach: null,
          rho: row.demand.rho, congested,
          reason: row.next.reason,
        };
      }
      const declaredSlack = horizon === null ? null : horizon - age - wait - declared;
      const measuredSlack = (horizon === null || congested || measured === null) ? null : horizon - age - wait - measured;
      const service = congested ? declared : (measured === null ? declared : measured);
      return {
        forumId: row.id,
        title: row.title,
        kind: row.kind,
        rung,
        waitDays: days(wait),
        serviceDays: days(service),
        declaredServiceDays: days(declared),
        expectedCloseOn: congested ? null : addDays(today, Math.round(wait + service)),
        slackDays: measuredSlack === null ? null : days(measuredSlack),
        declaredSlackDays: declaredSlack === null ? null : days(declaredSlack),
        breach: measuredSlack === null ? (declaredSlack === null ? null : declaredSlack < 0) : measuredSlack < 0,
        rho: row.demand.rho,
        congested,
        reason: congested
          ? `the forum is congested (ρ = ${row.demand.rho}): waiting time has no finite mean, so no landing date can be promised`
          : null,
      };
    });

    const measuredUsable = evaluated.filter((r) => r.slackDays !== null);
    const declaredUsable = evaluated.filter((r) => r.declaredSlackDays !== null);
    const best = measuredUsable.length
      ? measuredUsable.reduce((a, b) => (b.slackDays > a.slackDays ? b : a))
      : (declaredUsable.length ? declaredUsable.reduce((a, b) => (b.declaredSlackDays > a.declaredSlackDays ? b : a)) : null);
    const bestDeclared = declaredUsable.length
      ? declaredUsable.reduce((a, b) => (b.declaredSlackDays > a.declaredSlackDays ? b : a))
      : null;
    const anyMeasuredFits = measuredUsable.some((r) => !r.breach);
    const certainlyLate = bestDeclared ? bestDeclared.declaredSlackDays < 0 : false;
    const anyCongested = evaluated.some((r) => r.congested);

    const state = !horizon
      ? 'no-horizon'
      : !evaluated.length
        ? 'no-competent-forum'
        : certainlyLate || (measuredUsable.length > 0 && !anyMeasuredFits)
          ? 'escape-ladder'
          : anyCongested && !anyMeasuredFits
            ? 'congested'
            : anyMeasuredFits
              ? 'on-clock'
              : 'unpredictable';

    rows.push({
      ...item,
      clock: {
        state,
        horizonDays: horizon,
        ageDays: age,
        slackDays: best ? (best.slackDays !== null ? best.slackDays : best.declaredSlackDays) : null,
        expectedCloseOn: best ? best.expectedCloseOn : null,
        bestForumId: best ? best.forumId : null,
        bestForumTitle: best ? best.title : null,
        forumPath: evaluated,
        reason: state === 'escape-ladder'
          ? `closes ${Math.abs(bestDeclared ? bestDeclared.declaredSlackDays : 0)} day(s) AFTER its own ${horizon}-day horizon even at each competent forum's DECLARED service time, before any queueing delay`
          : state === 'congested'
            ? 'every competent forum is congested (ρ ≥ 1): no landing date can be promised at all'
            : state === 'no-competent-forum'
              ? 'no active forum is competent for this class at the required horizon'
              : state === 'unpredictable'
                ? 'no competent forum has ever sat, so no sitting date can be predicted'
                : state === 'no-horizon'
                  ? 'the item class declares no horizon'
                  : null,
      },
    });
  }

  const escape = rows.filter((r) => r.clock.state === 'escape-ladder');
  const unpredictable = rows.filter((r) => r.clock.state === 'unpredictable');
  const congested = rows.filter((r) => r.clock.state === 'congested');
  const onClock = rows.filter((r) => r.clock.state === 'on-clock');

  // The escape ladder aggregated by class × owning span: a structurally damning
  // table that never names a person.
  const escapeByClass = {};
  for (const row of escape) {
    const key = row.classKey;
    escapeByClass[key] = escapeByClass[key] || { classKey: key, classLabel: row.classLabel, n: 0, worstSlackDays: null, spanIds: new Set() };
    escapeByClass[key].n += 1;
    if (escapeByClass[key].worstSlackDays === null || row.clock.slackDays < escapeByClass[key].worstSlackDays) {
      escapeByClass[key].worstSlackDays = row.clock.slackDays;
    }
    if (row.ownerNodeId && !row.sensitive) escapeByClass[key].spanIds.add(row.ownerNodeId);
  }

  return {
    rows,
    escape,
    unpredictable,
    congested,
    onClock,
    counts: {
      total: rows.length,
      onClock: onClock.length,
      escape: escape.length,
      unpredictable: unpredictable.length,
      congested: congested.length,
      refused: rows.filter((r) => r.clock.state === 'refused').length,
      noCompetentForum: rows.filter((r) => r.clock.state === 'no-competent-forum').length,
    },
    escapeByClass: Object.values(escapeByClass)
      .map((row) => ({ ...row, spanIds: [...row.spanIds] }))
      .sort((a, b) => b.n - a.n || a.classKey.localeCompare(b.classKey)),
  };
}

/* ------------------------------------------------- 5. the constraint */

/**
 * Name the one binding constraint, in the Theory-of-Constraints sense: not the
 * worst-looking row, but the thing whose relief would move the most items.
 *
 * The ordering is explicit and printed:
 *   1. unreviewable demand  (a data gap that inflates nothing and blocks everything)
 *   2. no competent forum   (a structural hole: work with nowhere to go)
 *   3. congested forum      (ρ ≥ 1: no steady state)
 *   4. escape ladder        (the ladder cannot deliver inside the horizon)
 *   5. high-ρ forum         (ρ ≥ target: waiting rises faster than work arrives)
 *   6. topology mismatch    (a forum that cannot close what it is sent)
 *   7. none
 */
export function nameConstraint(picture, clock, conventions = CADENCE_DEFAULTS) {
  const target = (Number(conventions.cadenceUtilisationTargetPct) || CADENCE_DEFAULTS.cadenceUtilisationTargetPct) / 100;
  if (picture.counts.unreviewable > 0 && picture.counts.unreviewable >= Math.max(2, picture.counts.items * 0.25)) {
    return {
      type: 'unreviewable',
      label: 'Unreviewable demand',
      title: `${picture.counts.unreviewable} open item(s) cannot be closed by any forum`,
      detail: 'These items are counted in every queue in the workspace but cannot be decided anywhere, because the facts needed to close them are not recorded. This is a data constraint masquerading as a capacity constraint; adding a meeting does not fix it.',
      forumId: null,
      rho: null,
      itemN: picture.counts.unreviewable,
      remedy: 'Evidence supply: name the missing fact per item and capture it before the next sitting.',
    };
  }
  if (picture.unmatched.length > 0) {
    const classes = {};
    for (const item of picture.unmatched) classes[item.classKey] = (classes[item.classKey] || 0) + 1;
    const top = Object.entries(classes).sort((a, b) => b[1] - a[1])[0];
    return {
      type: 'competence-gap',
      label: 'No competent forum',
      title: `${picture.unmatched.length} reviewable item(s) have no forum entitled to close them`,
      detail: `The largest affected class is “${INPUT_CLASS_BY_KEY[top[0]]?.label || top[0]}” (${top[1]} item(s)). Either no active forum of a competent kind exists, or every such forum declares a shorter time-span of discretion than the class requires.`,
      forumId: null,
      rho: null,
      itemN: picture.unmatched.length,
      remedy: 'Declare a forum of the competent kind at or above the class horizon, or widen an existing forum\'s horizon.',
    };
  }
  const withRho = picture.forums.filter((row) => row.demand.rho !== null && row.status === 'active');
  const congested = withRho.filter((row) => row.demand.rho >= 1).sort((a, b) => b.demand.rho - a.demand.rho);
  if (congested.length) {
    const row = congested[0];
    return {
      type: 'forum-capacity',
      label: 'Forum capacity',
      title: `“${row.title}” is congested (ρ = ${row.demand.rho})`,
      detail: `Demand of ${row.demand.demandDays} item-day(s) against ${row.demand.capacityDays} capacity-day(s) per ${row.intervalDays}-day interval at a ${row.demand.targetPct}% target. Above ρ = 1 there is no steady state: the agenda grows every cycle and waiting time has no finite mean.`,
      forumId: row.id,
      rho: row.demand.rho,
      itemN: row.itemN,
      remedy: 'Either raise decision capacity (more items per sitting), shorten the interval, or move a class to a different competent forum.',
    };
  }
  if (clock.counts.escape > 0) {
    const worst = clock.escapeByClass[0];
    return {
      type: 'service-time',
      label: 'Service time vs. horizon',
      title: `${clock.counts.escape} item(s) escape the ladder`,
      detail: `The worst class is “${worst.classLabel}”: ${worst.n} item(s), the earliest of which closes ${Math.abs(worst.worstSlackDays)} day(s) after its own horizon even in the fastest competent forum. The governance calendar, not the queue, is the binding constraint.`,
      forumId: null,
      rho: null,
      itemN: clock.counts.escape,
      remedy: 'Shorten the interval of the competent forum, add an ad-hoc decision route for this class, or formally extend the class horizon and record that decision.',
    };
  }
  const hot = withRho.filter((row) => row.demand.rho >= target).sort((a, b) => b.demand.rho - a.demand.rho);
  if (hot.length) {
    const row = hot[0];
    return {
      type: 'forum-capacity',
      label: 'Forum utilisation',
      title: `“${row.title}” is above the ${Math.round(target * 100)}% target (ρ = ${row.demand.rho})`,
      detail: row.flow.verdictText,
      forumId: row.id,
      rho: row.demand.rho,
      itemN: row.itemN,
      remedy: 'Protect the agenda rule, or split the competences across two forums with different intervals.',
    };
  }
  const mismatch = picture.forums.filter((row) => ['disjoint', 'narrower-than-work'].includes(row.fit?.topology));
  if (mismatch.length) {
    const row = mismatch[0];
    return {
      type: 'topology-mismatch',
      label: 'Forum fit (Conway)',
      title: `“${row.title}” does not mirror the work sent to it`,
      detail: row.fit.topologyNote,
      forumId: row.id,
      rho: row.demand.rho,
      itemN: row.itemN,
      remedy: 'Add the owning seat to the attendance list, or re-point the work at the seat that actually chairs it.',
    };
  }
  return {
    type: 'none',
    label: 'No binding constraint detected',
    title: 'The governance calendar is not the constraint',
    detail: 'No forum is congested, no reviewable item lacks a competent forum, and every attributable item can land inside its horizon. This is a measured statement about the declared calendar, not a claim that the decisions are good.',
    forumId: null,
    rho: null,
    itemN: 0,
    remedy: 'Keep recording sittings; the planning-factor estimate needs settled sittings before it can be trusted.',
  };
}

/* -------------------------------------------- 6. planning fallacy (measured) */

/**
 * The planning fallacy, measured rather than named. For every held sitting with a
 * recorded estimate, compare the chair's submitted service estimate to the actual
 * elapsed days between the item's filing and its closure. The ratio is the
 * leader's own inflation factor — and the module refuses to compute it below the
 * evidence floor rather than printing a single anecdote as a multiplier.
 *
 * Where the ratio is measurable, the report prints the number of days by which
 * the calendar under-plans, per class.
 */
export function planningFactor(state, picture, conventions = CADENCE_DEFAULTS) {
  const floor = Number(conventions.cadenceFloorN) || CADENCE_DEFAULTS.cadenceFloorN;
  const byClass = {};
  const sessions = asArray(state?.cadenceSessions).filter((s) => s.status === 'held' && s.estimatedServiceDays !== null);
  for (const session of sessions) {
    const forum = (state?.cadenceForums || []).find((f) => f.id === session.forumId);
    if (!forum) continue;
    const cls = (session.closedClassKeys && session.closedClassKeys[0]) || 'execution-blocker';
    const declared = INPUT_CLASS_BY_KEY[cls]?.serviceDays ?? null;
    if (declared === null) continue;
    const est = Number(session.estimatedServiceDays);
    if (!Number.isFinite(est) || est <= 0) continue;
    const row = byClass[cls] || { classKey: cls, label: INPUT_CLASS_BY_KEY[cls]?.label || cls, n: 0, estSum: 0, declaredSum: 0 };
    row.n += 1;
    row.estSum += est;
    row.declaredSum += declared;
    byClass[cls] = row;
  }
  const rows = Object.values(byClass).map((row) => {
    const meanEst = row.estSum / row.n;
    const meanDeclared = row.declaredSum / row.n;
    const ratio = meanDeclared > 0 ? meanEst / meanDeclared : null;
    return {
      classKey: row.classKey,
      label: row.label,
      n: row.n,
      meanEstimateDays: round(meanEst, 2),
      meanDeclaredDays: round(meanDeclared, 2),
      ratio: ratio === null ? null : round(ratio, 2),
      refused: row.n < floor ? `only ${row.n} settled sitting(s) with a recorded estimate; ${floor} are required` : null,
    };
  }).sort((a, b) => b.n - a.n);

  const usable = rows.filter((r) => !r.refused && r.ratio !== null);
  const pooled = usable.length
    ? round(usable.reduce((sum, r) => sum + r.ratio * r.n, 0) / usable.reduce((sum, r) => sum + r.n, 0), 2)
    : null;
  return {
    rows,
    floor,
    pooledRatio: pooled,
    verdict: pooled === null
      ? 'Unmeasured: no class has enough settled sittings with a recorded estimate.'
      : pooled > 1
        ? `The calendar under-plans service time by ${Math.round((pooled - 1) * 100)}% on this record (Kahneman & Lovallo 1993, measured rather than asserted).`
        : `The calendar over-plans service time by ${Math.round((1 - pooled) * 100)}%; items close faster than the declared service time.`,
  };
}

/**
 * Everything else that is wrong, in the same deterministic order as the headline
 * constraint. A page that shows only the single worst fact lets a leader fix it
 * and assume the machine is healthy; this list is what stops that.
 */
export function secondaryConstraints(picture, clock, conventions = CADENCE_DEFAULTS, excludeType = null) {
  const target = (Number(conventions.cadenceUtilisationTargetPct) || CADENCE_DEFAULTS.cadenceUtilisationTargetPct) / 100;
  const out = [];
  const add = (row) => {
    if (!row || row.type === 'none' || row.type === excludeType) return;
    if (out.some((r) => r.type === row.type)) return;
    out.push(row);
  };

  if (picture.counts.unreviewable > 0) {
    add({
      type: 'unreviewable',
      label: 'Unreviewable demand',
      title: `${picture.counts.unreviewable} open item(s) cannot be closed by any forum`,
      detail: 'The facts needed to close these items are not recorded, so no forum can decide them. This inflates every queue in the workspace with work that can never move.',
      forumId: null,
      rho: null,
      itemN: picture.counts.unreviewable,
      remedy: 'Name the missing fact per item and capture it before the next sitting.',
    });
  }

  if (picture.unmatched.length > 0) {
    const classes = {};
    for (const item of picture.unmatched) classes[item.classKey] = (classes[item.classKey] || 0) + 1;
    const top = Object.entries(classes).sort((a, b) => b[1] - a[1])[0];
    add({
      type: 'competence-gap',
      label: 'No competent forum',
      title: `${picture.unmatched.length} reviewable item(s) have no forum entitled to close them`,
      detail: `Largest affected class: “${INPUT_CLASS_BY_KEY[top[0]]?.label || top[0]}” (${top[1]} item(s)). No active forum of a competent kind exists at the required horizon.`,
      forumId: null,
      rho: null,
      itemN: picture.unmatched.length,
      remedy: 'Declare a competent forum at the required horizon, or formally retire the class.',
    });
  }

  const congestedRows = picture.forums.filter((row) => row.demand.rho !== null && row.demand.rho >= 1);
  if (congestedRows.length) {
    const worst = congestedRows.reduce((a, b) => (b.demand.rho > a.demand.rho ? b : a));
    add({
      type: 'forum-capacity',
      label: 'Forum capacity',
      title: `${congestedRows.length} forum(s) are congested (worst ρ = ${worst.demand.rho})`,
      detail: `The worst is “${worst.title}”: ${worst.demand.demandDays} demand-day(s) against ${worst.demand.capacityDays} capacity-day(s) per ${worst.intervalDays}-day interval. No steady state exists at ρ ≥ 1.`,
      forumId: worst.id,
      rho: worst.demand.rho,
      itemN: worst.itemN,
      remedy: 'Raise decision capacity, shorten the interval, or split the competences.',
    });
  }

  if (clock.counts.escape > 0) {
    const worst = clock.escapeByClass[0];
    add({
      type: 'service-time',
      label: 'Service time vs. horizon',
      title: `${clock.counts.escape} item(s) escape the ladder`,
      detail: `Worst class “${worst.classLabel}”: ${worst.n} item(s), the earliest closing ${Math.abs(worst.worstSlackDays)} day(s) after its own horizon even before queueing delay.`,
      forumId: null,
      rho: null,
      itemN: clock.counts.escape,
      remedy: 'Shorten the interval, add an ad-hoc route, or formally extend the horizon.',
    });
  }

  if (clock.counts.congested > 0 && !congestedRows.length) {
    add({
      type: 'forum-capacity',
      label: 'Congested queue',
      title: `${clock.counts.congested} item(s) sit in a congested queue`,
      detail: 'Every competent forum for these items has ρ ≥ 1, so no landing date can be promised at all.',
      forumId: null,
      rho: null,
      itemN: clock.counts.congested,
      remedy: 'Relieve the congested forum before adding work to it.',
    });
  }

  const hotRows = picture.forums.filter((row) => row.demand.rho !== null && row.demand.rho >= target && row.demand.rho < 1);
  if (hotRows.length) {
    const worst = hotRows.reduce((a, b) => (b.demand.rho > a.demand.rho ? b : a));
    add({
      type: 'forum-capacity',
      label: 'Forum utilisation',
      title: `${hotRows.length} forum(s) above the ${Math.round(target * 100)}% planning target`,
      detail: `“${worst.title}” is at ρ = ${worst.demand.rho}. Waiting time rises faster than work arrives as ρ approaches 1.`,
      forumId: worst.id,
      rho: worst.demand.rho,
      itemN: worst.itemN,
      remedy: 'Protect the agenda rule, or split the competences across two intervals.',
    });
  }

  const misfits = picture.forums.filter((row) => ['disjoint', 'narrower-than-work'].includes(row.fit?.topology));
  if (misfits.length) {
    const worst = misfits[0];
    add({
      type: 'topology-mismatch',
      label: 'Forum fit (Conway)',
      title: `${misfits.length} forum(s) do not mirror the work sent to them`,
      detail: `“${worst.title}”: ${worst.fit.topologyNote}`,
      forumId: worst.id,
      rho: worst.demand.rho,
      itemN: worst.itemN,
      remedy: 'Add the owning seat to the attendance list, or re-point the work.',
    });
  }

  return out;
}

/* ------------------------------------------------- 7. the workspace report */

/**
 * The whole read model, cached per state object so a view render does not rebuild
 * the seat tree four times. The cache is a WeakMap keyed on the state object, so
 * a store mutation (which replaces the state) naturally invalidates it.
 */
export function buildCadenceReport(state = {}, { now = new Date(), settings = null } = {}) {
  const settingsKey = settings || state?.settings || {};
  const cached = REPORT_CACHE.get(state);
  if (cached && cached.nowKey === dayKey(now) && cached.settingsKey === settingsKey) return cached.report;

  const conventions = cadenceConventions(settingsKey);
  const picture = buildDemandPicture(state, { now, settings: settingsKey, conventions });
  const clock = buildCadenceClock(picture, { now });
  const constraint = nameConstraint(picture, clock, conventions);
  const secondary = secondaryConstraints(picture, clock, conventions, constraint.type);
  const planning = planningFactor(state, picture, conventions);

  // Per-altitude roll-up: the whole point of the hierarchy is that each altitude
  // sees the same machine at its own horizon. Counts only, no identities.
  const altitudeRows = ALTITUDES.map((alt) => {
    // Match by declared altitude KEY, falling back to the horizon the forum's
    // time-span happens to equal. Matching on horizon alone would silently drop a
    // forum whose declared span was customised (e.g. a 45-day monthly review).
    const forums = picture.forums.filter((row) => row.status !== 'retired'
      && (row.forum.altitudeKey === alt.key || (row.forum.altitudeKey === undefined && row.forum.horizonDays === alt.horizonDays)));
    const itemIds = new Set(picture.perItem.filter((i) => (i.requiredHorizonDays || 0) === alt.horizonDays).map((i) => i.entityId));
    const escaping = clock.escape.filter((r) => (r.requiredHorizonDays || 0) === alt.horizonDays).length;
    const demandSum = forums.reduce((sum, row) => sum + (row.demand.demandDays || 0), 0);
    const capacitySum = forums.reduce((sum, row) => sum + (row.demand.capacityDays || 0), 0);
    return {
      key: alt.key,
      rank: alt.rank,
      label: alt.label,
      shortLabel: alt.shortLabel,
      horizonDays: alt.horizonDays,
      forumN: forums.length,
      attunedForumN: forums.filter((row) => row.demand.rho !== null && row.demand.rho < 1).length,
      itemN: itemIds.size,
      demandDays: days(demandSum),
      capacityDays: days(capacitySum),
      rho: capacitySum > 0 ? Math.round((demandSum / capacitySum) * 1000) / 1000 : null,
      escapingN: escaping,
      worstRho: forums.length
        ? forums.reduce((worst, row) => (row.demand.rho !== null && (worst === null || row.demand.rho > worst) ? row.demand.rho : worst), null)
        : null,
    };
  });

  const totalDemand = picture.forums.reduce((sum, row) => sum + (row.demand.demandDays || 0), 0);
  const totalCapacity = picture.forums.reduce((sum, row) => sum + (row.demand.capacityDays || 0), 0);
  const workspaceRho = totalCapacity > 0 ? Math.round((totalDemand / totalCapacity) * 1000) / 1000 : null;

  const report = {
    engineVersion: CADENCE_ENGINE_VERSION,
    today: picture.today,
    conventions,
    picture,
    clock,
    constraint,
    secondary,
    planning,
    altitudeRows,
    workspaceRho,
    band: utilisationBand(workspaceRho),
    counts: picture.counts,
  };
  REPORT_CACHE.set(state, { nowKey: dayKey(now), settingsKey, report });
  return report;
}

/* ------------------------------------------------ 8. frozen reading / grade */

/**
 * The one prospective claim a frozen reading makes, chosen as the *most
 * falsifiable* thing on the page: "this forum's utilisation will be below 1 at its
 * next sitting" for the named constraint's forum, or "no item will escape the
 * ladder next cycle" when there is no capacity constraint. It is graded once,
 * afterwards, from recorded sittings — never rewritten.
 */
export function buildCadenceReading(report, { now = new Date(), id = null, reviewDays = null } = {}) {
  const conv = report.conventions;
  const forumRows = report.picture.forums.filter((row) => row.status === 'active');
  const target = conv.cadenceUtilisationTargetPct / 100;
  const focus = report.constraint.forumId
    ? forumRows.find((row) => row.id === report.constraint.forumId)
    : forumRows[0] || null;
  const dueOn = addDays(todayOf(now), Number(reviewDays) || Math.max(7, Number(focus?.intervalDays) || 14));

  let prediction = null;
  if (focus && focus.demand.rho !== null) {
    // The claim is deliberately conservative: the forum keeps up (ρ stays < 1).
    const probability = focus.demand.rho >= 1 ? 0.25 : focus.demand.rho >= target ? 0.55 : 0.8;
    prediction = {
      forumId: focus.id,
      probabilityPct: Math.round(probability * 100),
      claim: `“${focus.title}” will close at least one attributed item at or before its next sitting (ρ was ${focus.demand.rho}).`,
      dueOn,
    };
  } else if (report.clock.counts.escape > 0) {
    prediction = {
      forumId: null,
      probabilityPct: 40,
      claim: `At least one of the ${report.clock.counts.escape} escaping item(s) will be closed inside its horizon anyway, through an unmodelled route.`,
      dueOn,
    };
  }

  return {
    id: id || `cdr-${todayOf(now)}`,
    frozenOn: todayOf(now),
    engineVersion: report.engineVersion,
    forums: report.picture.forums.map((row) => ({
      forumId: row.id,
      title: row.title,
      kind: row.kind,
      cadence: row.cadence,
      intervalDays: row.intervalDays,
      demandDays: row.demand.demandDays,
      capacityDays: row.demand.capacityDays,
      rho: row.demand.rho,
      queueN: row.flow.queueN,
      flowDays: row.flow.flowDays,
      breachPct: row.flow.breachPct,
      verdict: row.flow.verdict,
      bindingClassKey: row.demand.bindingClassKey,
      topology: row.fit?.topology || 'unmodelled',
    })),
    constraint: {
      forumId: report.constraint.forumId,
      title: report.constraint.title,
      type: report.constraint.type,
      detail: report.constraint.detail,
      rho: report.constraint.rho,
    },
    workspaceRho: report.workspaceRho,
    unreviewableN: report.counts.unreviewable,
    prediction,
    grade: null,
    ownerId: null,
    createdAt: now.toISOString(),
  };
}

/**
 * Grade a frozen reading once. Two claims are checked independently:
 *   the forum claim, from recorded held sittings after `frozenOn`;
 *   the escape claim, from the count of items still inside their horizon.
 * A grade is written once and never re-opened.
 */
export function gradeCadenceReading(reading, state, { now = new Date() } = {}) {
  if (!reading || reading.grade) return { changed: false, reading };
  const today = todayOf(now);
  if (!reading.prediction || !reading.prediction.dueOn || today < reading.prediction.dueOn) {
    return { changed: false, reading, reason: 'the prediction is not yet due' };
  }
  const sessions = asArray(state?.cadenceSessions)
    .filter((s) => s.forumId === reading.prediction.forumId && s.heldOn > reading.frozenOn && s.status === 'held');
  let outcome = null;
  let note = '';
  if (reading.prediction.forumId) {
    const closed = sessions.reduce((sum, s) => sum + (Number(s.closedN) || 0), 0);
    outcome = closed > 0 ? 'held' : 'failed';
    note = `${closed} item(s) closed across ${sessions.length} recorded sitting(s) after the freeze.`;
  } else {
    const report = buildCadenceReport(state, { now });
    outcome = report.clock.counts.escape < reading.prediction.claim.match(/(\d+) escaping/)?.[1] ? 'held' : 'failed';
    note = `${report.clock.counts.escape} item(s) escape the ladder today.`;
  }
  return {
    changed: true,
    reading: {
      ...reading,
      grade: { gradedOn: today, outcome, observedDays: daysBetween(reading.frozenOn, today), note },
    },
  };
}

/** Brier skill against the base rate — refused below the floor, like every sibling. */
export function cadenceSkill(readings, floor = 5) {
  const graded = (readings || []).filter((r) => r && r.grade && r.grade.outcome && r.prediction && Number.isFinite(Number(r.prediction.probabilityPct)));
  if (graded.length < floor) {
    return { n: graded.length, floor, brier: null, baseRateBrier: null, skill: null, refused: `${graded.length} graded reading(s); ${floor} required` };
  }
  let brier = 0;
  let hits = 0;
  for (const r of graded) {
    const p = Number(r.prediction.probabilityPct) / 100;
    const y = r.grade.outcome === 'held' ? 1 : 0;
    brier += (p - y) ** 2;
    if (y === 1) hits += 1;
  }
  brier /= graded.length;
  const base = hits / graded.length;
  const baseRateBrier = base * (1 - base);
  return {
    n: graded.length,
    floor,
    brier: round(brier, 4),
    baseRate: round(base, 3),
    baseRateBrier: round(baseRateBrier, 4),
    skill: baseRateBrier > 0 ? (Math.round((1 - brier / baseRateBrier) * 1000) / 1000) + 0 : null,
    refused: null,
  };
}

/* -------------------------------------------------------- 9. exports / brief */

/** The identity-free Markdown brief. No person, no title of an individual record. */
export function cadenceBriefText(report) {
  const lines = [];
  const conv = report.conventions;
  lines.push('# Operating Cadence Clock');
  lines.push('');
  lines.push(`Frozen view of the standing-forum calendar as at ${report.today}. Identity-free: this brief carries forums, classes and counts, never a person.`);
  lines.push('');
  lines.push(`- Items in the workspace: **${report.counts.items}** (${report.counts.reviewable} reviewable, ${report.counts.unreviewable} not yet reviewable).`);
  lines.push(`- Attributable to a competent forum: **${report.counts.attributable}**; unmatched: **${report.counts.unmatched}**.`);
  lines.push(`- Active forums: **${report.counts.activeForums}** of ${report.counts.forums} declared.`);
  lines.push(`- Workspace utilisation ρ: **${report.workspaceRho === null ? 'unmeasured' : report.workspaceRho}** — ${report.band.label}. ${report.band.verdict}`);
  lines.push(`- Items that escape their own horizon through every competent forum: **${report.clock.counts.escape}**.`);
  lines.push('');
  lines.push('## Binding constraint');
  lines.push('');
  lines.push(`**${report.constraint.label} — ${report.constraint.title}**`);
  lines.push('');
  lines.push(report.constraint.detail);
  lines.push('');
  lines.push(`Remedy: ${report.constraint.remedy}`);
  lines.push('');
  lines.push('## Forum load (declared capacity, derived demand)');
  lines.push('');
  lines.push('| Forum | Kind | Interval | Items | Demand d | Capacity d | ρ | Flow d | Verdict |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.picture.forums) {
    lines.push(`| ${row.title} | ${row.kindLabel} | ${row.intervalDays}d | ${row.itemN} | ${row.demand.demandDays ?? '—'} | ${row.demand.capacityDays ?? '—'} | ${row.demand.rho ?? '—'} | ${row.flow.flowDays ?? '—'} | ${row.flow.bandLabel || row.flow.verdict} |`);
  }
  lines.push('');
  lines.push('## Planning factor (measured, not asserted)');
  lines.push('');
  lines.push(report.planning.verdict);
  for (const row of report.planning.rows) {
    lines.push(`- ${row.label}: ${row.refused ? `withheld — ${row.refused}` : `estimate ${row.meanEstimateDays}d vs declared ${row.meanDeclaredDays}d → ratio ${row.ratio}`}`);
  }
  lines.push('');
  lines.push('## By altitude');
  lines.push('');
  lines.push('| Altitude | Horizon | Forums | Items | ρ | Escaping |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of report.altitudeRows) {
    lines.push(`| ${row.label} | ${row.horizonDays}d | ${row.forumN} | ${row.itemN} | ${row.rho ?? '—'} | ${row.escapingN} |`);
  }
  lines.push('');
  lines.push(`Conventions in force: utilisation target ${conv.cadenceUtilisationTargetPct}%, flow target ${conv.cadenceFlowTargetDays} days, evidence floor ${conv.cadenceFloorN}, cell floor ${conv.cadenceCellFloor}.`);
  lines.push('');
  lines.push('Model assumptions: Poisson arrivals (C_a² = 1) and a deterministic declared service time on a single server per forum. Waiting time is refused at ρ ≥ 1 because no steady state exists. No figure here is a claim about a person.');
  return lines.join('\n');
}

/** Aggregate-only CSV rows. Blank, never zero, below the evidence floor. */
export function cadenceCsvRows(report, { floor = 3 } = {}) {
  const rows = [];
  for (const row of report.picture.forums) {
    const withheld = row.itemN > 0 && row.itemN < floor;
    rows.push({
      row_kind: 'forum',
      altitude: row.forum.altitudeKey,
      horizon_days: row.horizonDays,
      cadence: row.cadence,
      forum_kind: row.kind,
      items: withheld ? null : row.itemN,
      demand_days: withheld ? null : row.demand.demandDays,
      capacity_days: withheld ? null : row.demand.capacityDays,
      rho: row.demand.rho,
      flow_days: withheld ? null : row.flow.flowDays,
      verdict: row.flow.verdict,
      topology: row.fit?.topology || 'unmodelled',
      closures_per_sitting: row.closuresPerSitting,
      suppressed: withheld ? `small cell (n < ${floor})` : '',
    });
  }
  rows.push({
    row_kind: 'workspace',
    altitude: 'all',
    horizon_days: null,
    cadence: null,
    forum_kind: null,
    items: report.counts.items,
    demand_days: null,
    capacity_days: null,
    rho: report.workspaceRho,
    flow_days: null,
    verdict: report.band.label,
    topology: null,
    closures_per_sitting: null,
    suppressed: '',
  });
  return rows;
}

/* ------------------------------------------------------ 10. attention count */

export function cadenceAttentionCount(state, now = new Date(), settings = null) {
  try {
    const report = buildCadenceReport(state, { now, settings });
    return report.clock.counts.escape + (report.constraint.type === 'none' ? 0 : 1);
  } catch {
    return 0;
  }
}
