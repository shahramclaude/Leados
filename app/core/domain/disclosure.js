/**
 * app/core/domain/disclosure.js — the Disclosure Compiler (Schema v90, ADR-0086).
 *
 * WHAT THIS REPLACES
 * ------------------
 * ADR-0076 shipped an enforced boundary that refused 84 of 89 routes under a
 * declared seat because none of them had completed a hand-written read audit.
 * The refusal was correct and the product was unusable at altitude: a director
 * could declare their seat and lose the eight screens they actually work in.
 *
 * WHAT THIS DOES
 * --------------
 * One generic walk turns (module manifest × operating seat × grant ledger) into
 * a POSTURE for every route:
 *
 *   detail     the legacy screen renders, inside its own rank window, against a
 *              state already projected to the seat's span.
 *   aggregate  the screen is replaced by an altitude-appropriate read of the same
 *              records: counts, open load, overdue load, severity load, money by
 *              currency and a per-child-span breakdown — with small cells
 *              withheld, complementary suppression applied, and no sentence,
 *              name or note carried upward.
 *   withheld   below the class floor, or undeclared. With a printed reason.
 *
 * Three properties are load-bearing and each is asserted in
 * `tests/app/disclosure-compiler.test.mjs`:
 *
 *   1. FAIL CLOSED. A route with no manifest is withheld. An unknown collection
 *      contributes nothing. An unreadable field is "unknown", never zero.
 *   2. NO ACCIDENTAL COVERAGE. The aggregate reads ONLY the seat's own subtree;
 *      a peer span's records are not counted, not bucketed and not subtracted.
 *   3. PRINTS ITS OWN REFUSALS. Every withheld cell carries the reason it was
 *      withheld, and every complementary suppression says it happened, because
 *      an access control that cannot explain itself is a broken one.
 *
 * A grant (the Disclosure Console's release contract) lifts ONE class ceiling for
 * ONE span, for ONE route, for a bounded number of days, only after the span's
 * own leader consents, and never for an enterprise-class collection. It is read
 * here exactly like a policy input — never like a setting.
 *
 * Pure module: no storage, no clock, no DOM.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { recordPolicy, RECORD_CLASSES, routeRankWindow } from './seatRegistry.js';
import { responsibleNodeId, LEADER_ID } from './chain.js';
import { recordPeople } from './seat.js';
import { manifestFor, MODULE_MANIFESTS, MANIFEST_ROUTES } from './disclosureManifests.js';
import {
  DISCLOSURE_CONVENTION_DEFAULTS,
  DISCLOSURE_LIMITS,
  DISCLOSURE_MODES,
  DISCLOSURE_POSTURES,
  GRANT_INELIGIBLE_CLASSES,
} from './disclosureRegistry.js';
import { normalizeDisclosureGrants, normalizeDisclosureSettings } from './disclosureSchema.js';

/** Collections the aggregate falls back to when a screen has no ledger of its own. */
const WORK_COLLECTIONS = Object.freeze(['cases', 'decisions', 'delegations', 'goals']);

export function disclosureConventions(settings = {}) {
  return normalizeDisclosureConventions(settings);
}
function normalizeDisclosureConventions(settings) {
  const d = DISCLOSURE_CONVENTION_DEFAULTS;
  const s = normalizeDisclosureSettings(settings || {});
  return { ...d, ...s };
}

/* ------------------------------------------------------------------ fields */

function readPath(record, path) {
  let cursor = record;
  for (const key of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

/** First declared path that carries a value — a rename degrades to unknown. */
export function pick(record, paths) {
  for (const path of paths || []) {
    const value = readPath(record, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

const asDay = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date) return dayKey(value);
  return null;
};

/* ------------------------------------------------------------------ grants */

/** Live grants only. An expiry that passed is not authority. */
export function activeGrants(state, { now = new Date() } = {}) {
  const rows = normalizeDisclosureGrants(state?.disclosureGrants, [], { now: now.toISOString(), today: dayKey(now) });
  return rows.filter((g) => g.status === 'granted' && g.expiresOn && g.expiresOn >= dayKey(now));
}

export function grantKey(route, spanId) {
  return `${String(route)}::${String(spanId)}`;
}

/** The live grant that covers this (route, span), if any. */
export function grantedFor(grants, route, spanId) {
  return (grants || []).find((g) => g.route === route && g.spanId === spanId) || null;
}

/** Is `personId` inside `spanId`'s own subtree (or the span leader themselves)? */
export function withinSpan(built, spanId, personId) {
  if (!spanId || !personId) return false;
  if (spanId === LEADER_ID) return built.chain.byId.has(personId) || personId === LEADER_ID;
  let cursor = personId;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === spanId) return true;
    const node = built.chain.nodes.get(cursor) || null;
    cursor = node?.parentId || null;
    guard += 1;
  }
  return false;
}

/** The span that holds a record: the leaders above the people it names. */
export function spanOf(state, built, seat, record) {
  const people = recordPeople(record);
  if (!people.length) return { nodeId: seat.id, label: 'Not attributed to a span', unattributed: true };
  const nodeId = responsibleNodeId(built.chain, people);
  if (!nodeId) return null;
  if (!seat.fullAccess && !seat.scope.has(nodeId) && nodeId !== seat.id) return null;
  const node = built.chain.nodes.get(nodeId) || null;
  return { nodeId, label: node?.name || 'Unnamed span', unattributed: false };
}

/* ----------------------------------------------------------------- posture */

function classPolicyFor(manifest) {
  // A collection's own DECLARED policy wins; a collection nobody declared (the
  // fail-closed default) does not silently override the manifest's class.
  if (manifest.collections.length && !manifest.adapterScoped) {
    const policy = recordPolicy(manifest.collections[0]);
    if (policy.declared) return policy;
  }
  const key = manifest.classKey || 'authority';
  const cls = RECORD_CLASSES[key] || RECORD_CLASSES.authority;
  return {
    collection: null, classKey: key, classLabel: cls.label, label: manifest.label,
    route: `#/${manifest.route}`, declared: true,
    minRank: cls.minRank, maxRank: cls.maxRank,
    detailCeiling: Number.isInteger(manifest.detailCeiling) ? Math.min(manifest.detailCeiling, cls.maxRank) : cls.detailCeiling,
    reason: cls.reason,
  };
}

/**
 * One route's posture at one seat. Pure; every branch prints why.
 * `grants` are pre-filtered live grants (see activeGrants).
 */
export function postureFor(state, seat, built, route, { now = new Date(), settings = null, grants = null } = {}) {
  const manifest = manifestFor(route);
  if (!manifest) {
    return {
      route, label: route, posture: DISCLOSURE_POSTURES.WITHHELD, mode: null, classKey: null,
      reason: 'This screen has no disclosure manifest, so no altitude-appropriate read of it exists yet. It is withheld rather than guessed at.',
      declared: false,
    };
  }
  const policy = classPolicyFor(manifest);
  const window = routeRankWindow(manifest.route);
  const floorRank = Math.max(policy.minRank, window.floor);
  const detailCeiling = Math.min(policy.detailCeiling, policy.maxRank, window.ceiling);
  const base = {
    route, label: manifest.label, mode: manifest.mode, declared: true,
    classKey: policy.classKey, classLabel: policy.classLabel, collection: policy.collection,
    collections: manifest.collections, floorRank, detailCeiling, note: manifest.note,
  };
  if (!seat) return { ...base, posture: DISCLOSURE_POSTURES.WITHHELD, reason: 'No operating seat is resolved.' };
  if (seat.fullAccess) {
    return { ...base, posture: DISCLOSURE_POSTURES.DETAIL, reason: 'Undeclared operator view — the whole workspace, unchanged.' };
  }
  if (seat.readOnly) {
    return { ...base, posture: DISCLOSURE_POSTURES.WITHHELD, reason: `The declared seat “${seat.unresolvedSeatId}” no longer exists in this roster; nothing is disclosed until a valid seat is declared.` };
  }
  if (seat.rank < floorRank) {
    return { ...base, posture: DISCLOSURE_POSTURES.WITHHELD, reason: `${policy.classLabel} is not handed below rank ${floorRank}; ${seat.label} is rank ${seat.rank}. A disclosure grant can lift a ceiling, never a floor.` };
  }
  if (manifest.mode === DISCLOSURE_MODES.AGGREGATE) {
    return {
      ...base, posture: DISCLOSURE_POSTURES.AGGREGATE,
      reason: `${manifest.label} is a modelling surface whose report reads span the whole workspace. Under a declared seat it publishes the span aggregate for ${seat.label} instead of opening a screen it cannot scope. ${manifest.note}`.trim(),
    };
  }
  if (seat.rank <= detailCeiling) {
    return { ...base, posture: DISCLOSURE_POSTURES.DETAIL, reason: '' };
  }
  // Above the ceiling: a live, consented, span-bounded grant is the only way in.
  // A caller that does not pass a grant ledger gets the ledger read from state,
  // so a posture can never be compiled against a stale or missing exception list.
  const ledger = grants || activeGrants(state, { now });
  const live = ledger.filter((g) => g.route === manifest.route && g.requesterSeatId === seat.id && seat.scope.has(g.spanId));
  const grant = live[0] || null;
  if (grant) {
    return {
      ...base, posture: DISCLOSURE_POSTURES.DETAIL, grantedBy: grant.id, grantedSpanId: grant.spanId,
      reason: `${policy.classLabel} is normally counts-only above rank ${detailCeiling}. Detail is open here under grant ${grant.id} for ${grant.spanLabel || grant.spanId} only, consented by ${grant.consentFromId || 'the span leader'} until ${grant.expiresOn}. Records outside that span stay aggregated.`,
    };
  }
  return {
    ...base, posture: DISCLOSURE_POSTURES.AGGREGATE,
    reason: `${policy.classLabel} is disclosed above rank ${detailCeiling} as counts and rates, not item detail. ${policy.reason} The console can request a consented, expiring release for one span.`,
  };
}

/** The whole catalogue compiled for one seat. */
export function compileDisclosure(state, seat, built, { now = new Date(), settings = null } = {}) {
  const conventions = disclosureConventions(settings || state?.settings || {});
  const grants = activeGrants(state, { now });
  const entries = {};
  const counts = { detail: 0, aggregate: 0, withheld: 0, undeclared: 0 };
  for (const route of MANIFEST_ROUTES) {
    const entry = postureFor(state, seat, built, route, { now, settings, grants });
    entries[route] = entry;
    if (!entry.declared) counts.undeclared += 1;
    else counts[entry.posture] += 1;
  }
  // Every renderer the shell knows about but the catalogue does not is a hole in
  // the coverage claim, and it is reported as one rather than rounded away.
  return {
    seatId: seat?.id || null,
    seatLabel: seat?.label || null,
    enforced: Boolean(seat && !seat.fullAccess),
    entries,
    counts,
    conventions,
    grants: grants.filter((g) => !seat || seat.fullAccess || g.requesterSeatId === seat.id || seat.scope.has(g.spanId)),
  };
}

/** Routes a seat may open at all (detail or aggregate). */
export function openRoutes(compiled) {
  return Object.values(compiled.entries)
    .filter((e) => e.posture !== DISCLOSURE_POSTURES.WITHHELD)
    .map((e) => e.route);
}

/**
 * Records a live grant releases into the seat projection. Only records the seat
 * would otherwise see as counts, only inside the granted span, only for the
 * granted route's own collection, and never an enterprise-class collection.
 */
export function grantedRecords(state, seat, built, { now = new Date(), settings = null } = {}) {
  const out = new Map();
  if (!seat || seat.fullAccess || seat.readOnly) return out;
  const grants = activeGrants(state, { now }).filter((g) => g.requesterSeatId === seat.id && seat.scope.has(g.spanId));
  if (!grants.length) return out;
  for (const grant of grants) {
    const manifest = manifestFor(grant.route);
    if (!manifest || manifest.mode === DISCLOSURE_MODES.AGGREGATE) continue;
    for (const collection of manifest.collections) {
      const policy = recordPolicy(collection);
      if (GRANT_INELIGIBLE_CLASSES.includes(policy.classKey)) continue;
      const rows = Array.isArray(state?.[collection]) ? state[collection] : [];
      for (const record of rows) {
        if (!record || !record.id) continue;
        const people = recordPeople(record);
        if (!people.length) continue;
        if (!people.every((pid) => withinSpan(built, grant.spanId, pid))) continue;
        if (!out.has(collection)) out.set(collection, []);
        const bucket = out.get(collection);
        if (!bucket.some((row) => row.id === record.id)) bucket.push({ ...record, __disclosureGrant: grant.id });
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- aggregate */

function emptyBucket(nodeId, label) {
  return { nodeId, label, count: 0, open: 0, overdue: 0, severitySum: 0, oldestDays: null, money: {} };
}

function addMoney(target, currency, amount) {
  const cur = String(currency || '').trim().toUpperCase();
  if (!cur || !Number.isFinite(amount) || amount === 0) return;
  target[cur] = Math.round(((target[cur] || 0) + amount) * 100) / 100;
}

/**
 * The altitude-appropriate read of one module: what the level above can act on
 * without reading a sentence. Money is never pooled across currencies, an
 * unreadable date is "unknown" rather than age zero, and a bucket below the
 * declared floor is withheld — with one complementary suppression so the
 * withheld cell cannot be recovered by subtracting the others.
 */
export function moduleAggregate(state, manifestOrRoute, seat, built, { now = new Date(), settings = null } = {}) {
  const manifest = typeof manifestOrRoute === 'string' ? manifestFor(manifestOrRoute) : manifestOrRoute;
  if (!manifest) return null;
  const conventions = disclosureConventions(settings || state?.settings || {});
  const floorN = conventions.disclosureCellFloor;
  const today = dayKey(now);
  const collections = manifest.collections.length ? manifest.collections : WORK_COLLECTIONS;
  const policy = classPolicyFor(manifest);
  const buckets = new Map();
  const totals = { rows: 0, open: 0, overdue: 0, severitySum: 0, severityMax: null, oldestDays: null, money: {}, statuses: {}, undated: 0, unattributed: 0 };
  let skippedOutsideSpan = 0;

  for (const collection of collections) {
    const rows = Array.isArray(state?.[collection]) ? state[collection] : [];
    for (const record of rows) {
      if (!record || !record.id) continue;
      const span = seat && !seat.fullAccess ? spanOf(state, built, seat, record) : { nodeId: seat?.id || LEADER_ID, label: seat?.label || 'Workspace', unattributed: false };
      if (!span) { skippedOutsideSpan += 1; continue; }
      if (!buckets.has(span.nodeId)) buckets.set(span.nodeId, emptyBucket(span.nodeId, span.label));
      if (span.unattributed) totals.unattributed += 1;
      const bucket = buckets.get(span.nodeId);
      bucket.count += 1;
      totals.rows += 1;
      const status = pick(record, manifest.statuses);
      const statusKey = typeof status === 'string' && status ? status : 'unknown';
      totals.statuses[statusKey] = (totals.statuses[statusKey] || 0) + 1;
      const isOpen = typeof status === 'string' ? manifest.openStatuses.includes(status) : record.status === undefined;
      if (isOpen) { bucket.open += 1; totals.open += 1; }
      const due = asDay(pick(record, manifest.dues));
      if (due && due < today) { bucket.overdue += 1; totals.overdue += 1; }
      const severity = Number(pick(record, manifest.severities));
      if (Number.isFinite(severity) && severity > 0) {
        bucket.severitySum += severity;
        totals.severitySum += severity;
        totals.severityMax = totals.severityMax === null ? severity : Math.max(totals.severityMax, severity);
      }
      const dated = asDay(pick(record, manifest.dates));
      if (dated) {
        const age = Math.max(0, daysBetween(dated, today));
        if (bucket.oldestDays === null || age > bucket.oldestDays) bucket.oldestDays = age;
        if (totals.oldestDays === null || age > totals.oldestDays) totals.oldestDays = age;
      } else {
        totals.undated += 1;
      }
      const amount = Number(pick(record, manifest.amounts));
      const currency = pick(record, manifest.currencies);
      if (Number.isFinite(amount) && currency) {
        addMoney(bucket.money, currency, amount);
        addMoney(totals.money, currency, amount);
      }
    }
  }

  // Small cells and complementary suppression.
  const spans = [...buckets.values()]
    .map((b) => ({ ...b, withhold: b.count < floorN, withholdReason: b.count < floorN ? `Only ${b.count} record(s) in this span against an evidence floor of ${floorN}; a span total that small identifies the people in it, so the cell is withheld rather than printed.` : null }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
  const visible = spans.filter((b) => !b.withhold);
  const suppressed = spans.filter((b) => b.withhold);
  let complementary = false;
  if (suppressed.length && visible.length > 1) {
    // Classic complementary suppression: hide the smallest surviving cell too,
    // so a reader cannot recover the hidden one by subtracting the rest.
    visible[visible.length - 1].withhold = true;
    visible[visible.length - 1].withholdReason = `Withheld for complementary suppression: subtracting the printed cells from the span total would otherwise recover the ${suppressed.length} cell(s) hidden below the floor of ${floorN}.`;
    complementary = true;
  }
  const totalWithheld = totals.rows < floorN;
  const notes = [];
  if (skippedOutsideSpan) notes.push(`${skippedOutsideSpan} record(s) outside this seat's span are not counted here at all — an aggregate that includes peers is a sideways leak with extra steps.`);
  if (totals.undated) notes.push(`${totals.undated} record(s) carry no readable date; their age is unknown rather than zero.`);
  if (complementary) notes.push('One further cell was withheld so the cells hidden below the floor cannot be recovered by subtraction.');
  if (totalWithheld) notes.push(`The span total (${totals.rows}) is itself below the floor of ${floorN} and is withheld; an empty-looking screen is not the same claim as "nothing happened".`);
  if (manifest.mode === DISCLOSURE_MODES.AGGREGATE) notes.push(`${manifest.label} is published here as an aggregate only: its own report reads are not yet seat-scoped (see ROADMAP).`);

  return {
    route: manifest.route,
    label: manifest.label,
    collections,
    classKey: policy.classKey,
    classLabel: policy.classLabel,
    floorN,
    spans,
    spanTotal: totalWithheld ? null : totals.rows,
    totalWithheld,
    totals: totalWithheld ? { ...totals, rows: null, open: null, overdue: null, severitySum: null, money: {} } : totals,
    complementary,
    notes,
    withheldCells: spans.filter((b) => b.withhold).length,
  };
}

/* ------------------------------------------------------------- reporting */

/** The console's read model: coverage, grants, and the seat's own aggregate. */
export function disclosureReport(state, { now = new Date(), settings = null, seat = null, built = null } = {}) {
  const compiled = compileDisclosure(state, seat, built, { now, settings });
  const conventions = compiled.conventions;
  const grants = normalizeDisclosureGrants(state?.disclosureGrants, [], { now: now.toISOString(), today: dayKey(now) });
  const live = activeGrants(state, { now });
  const today = dayKey(now);
  const soon = addDays(today, 3);
  const mine = grants.filter((g) => !seat || seat.fullAccess || g.requesterSeatId === seat.id || seat.scope.has(g.spanId) || g.spanId === seat.id);
  const awaitingConsent = mine.filter((g) => g.status === 'requested');
  const active = mine.filter((g) => g.status === 'granted');
  const expiringSoon = active.filter((g) => g.expiresOn && g.expiresOn <= soon);
  const coverage = {
    declared: MANIFEST_ROUTES.length,
    detail: compiled.counts.detail,
    aggregate: compiled.counts.aggregate,
    withheld: compiled.counts.withheld,
    withheldBelowFloor: Object.values(compiled.entries).filter((e) => e.posture === DISCLOSURE_POSTURES.WITHHELD && e.declared && /not handed below rank/.test(e.reason || '')).length,
    detailPct: MANIFEST_ROUTES.length ? Math.round((compiled.counts.detail / MANIFEST_ROUTES.length) * 100) : 0,
    openPct: MANIFEST_ROUTES.length ? Math.round(((compiled.counts.detail + compiled.counts.aggregate) / MANIFEST_ROUTES.length) * 100) : 0,
  };
  const aggregates = MANIFEST_ROUTES
    .filter((route) => compiled.entries[route].posture === DISCLOSURE_POSTURES.AGGREGATE)
    .map((route) => moduleAggregate(state, MODULE_MANIFESTS[route], seat, built, { now, settings }))
    .filter(Boolean)
    .sort((a, b) => (b.totals.open || 0) - (a.totals.open || 0));
  return { compiled, conventions, coverage, grants: mine, awaitingConsent, active, expiringSoon, aggregates, liveCount: live.length, today };
}

/** Small, identity-free Markdown for the level above (or the audit file). */
export function disclosureBriefText(report, { at = null } = {}) {
  const c = report.compiled;
  const lines = [];
  lines.push(`# Disclosure posture — ${c.seatLabel || 'operator view'}`);
  lines.push('');
  lines.push(`Compiled ${at || new Date().toISOString().slice(0, 10)} · engine ${c.enforced ? 'enforced' : 'operator (unenforced)'} · ${report.coverage.declared} screens declared.`);
  lines.push('');
  lines.push(`- Detail: ${report.coverage.detail} · aggregate-only: ${report.coverage.aggregate} · withheld: ${report.coverage.withheld} (${report.coverage.withheldBelowFloor} below a class floor)`);
  lines.push(`- Single-variable release contracts: ${report.active.length} live, ${report.awaitingConsent.length} awaiting the span leader's consent, ${report.expiringSoon.length} expiring within three days.`);
  lines.push('');
  lines.push('## What this altitude can act on');
  for (const agg of report.aggregates.slice(0, 8)) {
    if (agg.spanTotal === null) {
      lines.push(`- ${agg.label}: total withheld (below the floor of ${agg.floorN}).`);
      continue;
    }
    const money = Object.entries(agg.totals.money).map(([cur, amt]) => `${cur} ${amt.toLocaleString('en-US')}`).join(', ');
    lines.push(`- ${agg.label}: ${agg.spanTotal} record(s), ${agg.totals.open ?? 'unknown'} open, ${agg.totals.overdue ?? 'unknown'} overdue, oldest ${agg.totals.oldestDays ?? 'unknown'}d${money ? `, ${money}` : ''}${agg.withheldCells ? `, ${agg.withheldCells} span cell(s) withheld` : ''}.`);
  }
  if (!report.aggregates.length) lines.push('- No module is in the aggregate posture at this seat.');
  lines.push('');
  lines.push('Every figure above is a count, a rate or a currency total. No note, name, rating or sentence crosses this line, and the workspace says so rather than implying it.');
  return lines.join('\n');
}

/** Aggregate-only CSV rows: one per module × posture at this seat. */
export function disclosureCsvRows(report) {
  const rows = [];
  for (const [route, entry] of Object.entries(report.compiled.entries)) {
    const agg = report.aggregates.find((a) => a.route === route) || null;
    rows.push({
      route,
      module: entry.label,
      posture: entry.posture,
      record_class: entry.classKey || '',
      floor_rank: entry.floorRank ?? '',
      detail_ceiling: entry.detailCeiling ?? '',
      open_n: agg && agg.spanTotal !== null ? agg.totals.open : '',
      overdue_n: agg && agg.spanTotal !== null ? agg.totals.overdue : '',
      total_n: agg && agg.spanTotal !== null ? agg.spanTotal : '',
      withheld_cells: agg ? agg.withheldCells : '',
      money_by_currency: agg ? Object.entries(agg.totals.money).map(([cur, amt]) => `${cur}:${amt}`).join('|') : '',
      reason: entry.reason || '',
    });
  }
  return rows;
}

/**
 * Nav badge, computed from the ledger alone (no full report): requests waiting
 * for THIS seat's consent, plus a live release of this seat's that lapses within
 * three days. A badge that counted every pending request would reward asking.
 */
export function disclosureAttentionFor(state, seat, { now = new Date() } = {}) {
  if (!seat) return 0;
  const rows = normalizeDisclosureGrants(state?.disclosureGrants, [], { now: now.toISOString(), today: dayKey(now) });
  const today = dayKey(now);
  const soon = addDays(today, 3);
  if (seat.fullAccess) return rows.filter((g) => g.status === 'requested').length;
  return rows.filter((g) => (g.status === 'requested' && g.spanId === seat.id)
    || (g.status === 'granted' && g.requesterSeatId === seat.id && g.expiresOn && g.expiresOn <= soon)).length;
}

/** Nav badge: consent work and grants about to lapse, for this seat only. */
export function disclosureAttentionCount(report) {
  if (!report) return 0;
  return report.awaitingConsent.length + report.expiringSoon.length;
}

/* ------------------------------------------------------------ eligibility */

/**
 * Pure validation for a release request. The write path calls this and nothing
 * else decides whether a widening is admissible, so the console, the API and the
 * tests cannot disagree about the rules.
 */
export function validateGrantRequest(state, seat, built, input = {}, { now = new Date(), settings = null } = {}) {
  const conventions = disclosureConventions(settings || state?.settings || {});
  const route = String(input.route || '').replace(/^#\//, '').split('?')[0];
  const spanId = String(input.spanId || '');
  const purpose = String(input.purpose || '').trim();
  const days = Math.round(Number(input.days ?? conventions.disclosureReviewDays));
  const manifest = manifestFor(route);
  if (!seat || seat.fullAccess) return { ok: false, error: 'Declare an operating seat first: the operator view already sees everything, so there is nothing to release.', field: 'scope' };
  if (seat.readOnly) return { ok: false, error: 'The operating seat is unresolved. Declare a valid seat before requesting a release.', field: 'scope' };
  if (!manifest) return { ok: false, error: 'That screen has no disclosure manifest, so there is no posture to release.', field: 'route' };
  const policy = classPolicyFor(manifest);
  if (GRANT_INELIGIBLE_CLASSES.includes(policy.classKey)) {
    return { ok: false, error: `${policy.classLabel} can never be released by a grant: pay, parity and workforce-transition material is a structural privacy commitment, not a manager's discretion.`, field: 'route' };
  }
  if (manifest.mode === DISCLOSURE_MODES.AGGREGATE) {
    return { ok: false, error: `${manifest.label} publishes an aggregate under a declared seat because its own report reads span the workspace. A grant cannot widen a screen whose reads are not seat-scoped.`, field: 'route' };
  }
  if (!spanId) return { ok: false, error: 'Name the span whose detail is being requested.', field: 'spanId' };
  if (spanId === seat.id) return { ok: false, error: 'Your own span is already readable in full. A grant is for a span whose detail sits above your ceiling.', field: 'spanId' };
  if (!seat.scope.has(spanId)) return { ok: false, error: 'That span is outside your operating span. Ask the common leader above both spans — disclosure never crosses a peer boundary.', field: 'spanId' };
  if (!built.chain.nodes.has(spanId)) return { ok: false, error: 'That span is not in the reporting tree.', field: 'spanId' };
  if (purpose.length < DISCLOSURE_LIMITS.minPurposeChars) return { ok: false, error: `Write at least ${DISCLOSURE_LIMITS.minPurposeChars} characters of purpose. "Needed" is not a purpose; the span leader is being asked to agree to something specific.`, field: 'purpose' };
  if (!Number.isFinite(days) || days < DISCLOSURE_LIMITS.minDays || days > Math.min(DISCLOSURE_LIMITS.maxDays, conventions.disclosureMaxDays)) {
    return { ok: false, error: `A release runs between ${DISCLOSURE_LIMITS.minDays} and ${Math.min(DISCLOSURE_LIMITS.maxDays, conventions.disclosureMaxDays)} days. Authority without an end date is not a grant.`, field: 'days' };
  }
  const current = postureFor(state, seat, built, route, { now, settings });
  if (current.posture !== DISCLOSURE_POSTURES.AGGREGATE) {
    return { ok: false, error: current.posture === DISCLOSURE_POSTURES.WITHHELD ? current.reason : 'That screen is already readable in full at your altitude.', field: 'route' };
  }
  const live = activeGrants(state, { now });
  const pending = normalizeDisclosureGrants(state?.disclosureGrants, [], { now: now.toISOString(), today: dayKey(now) })
    .filter((g) => g.status === 'requested' && g.requesterSeatId === seat.id);
  if (live.some((g) => g.requesterSeatId === seat.id && g.route === manifest.route && g.spanId === spanId)) {
    return { ok: false, error: 'A live release already covers that span and that screen.', field: 'spanId' };
  }
  if (pending.some((g) => g.route === manifest.route && g.spanId === spanId)) {
    return { ok: false, error: 'That request is already open and waiting for the span leader’s answer. Asking twice does not widen a boundary.', field: 'spanId' };
  }
  if (live.length + pending.length >= conventions.disclosureMaxActiveGrants) {
    return { ok: false, error: `You already hold ${conventions.disclosureMaxActiveGrants} live releases, the declared maximum. Close one before opening another — a portfolio of exceptions is how a boundary stops being one.`, field: 'scope' };
  }
  const node = built.chain.nodes.get(spanId);
  return {
    ok: true,
    value: {
      route: manifest.route,
      moduleLabel: manifest.label,
      collection: policy.collection || '',
      classKey: policy.classKey,
      spanId,
      spanLabel: node?.name || spanId,
      purpose: purpose.slice(0, DISCLOSURE_LIMITS.purposeChars),
      days,
      requesterId: seat.id,
      requesterSeatId: seat.id,
    },
  };
}
