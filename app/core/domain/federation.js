/**
 * app/core/domain/federation.js — the Programme Federation Reading (ADR-0090).
 *
 * Pure read model. It measures, for every DECLARED child→parent leadership edge,
 * whether any dated artefact from the child's span actually arrived at the
 * parent (or above it) inside the window. It never writes into a measured
 * channel, never scores a person, and never converts a declaration into
 * evidence.
 *
 * The five channel extractors at the bottom are the whole measurement surface.
 * Each one reads a collection another module already owns; the registry in
 * `federationRegistry.js` names the rule that wrote it. Adding a channel is one
 * registry row plus one extractor — the edges, states, suppression, rules, CSV
 * scope and every altitude's view pick it up with no other change.
 */
import { addDays, dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats, resolveSeat } from './seat.js';
import { LEADER_ID } from './chain.js';
import {
  FEDERATION_CHANNELS,
  FEDERATION_DISCLOSURE,
  FEDERATION_ENGINE_VERSION,
  FEDERATION_LIMITS,
  FEDERATION_PLAYBOOK,
  FEDERATION_PREMISE,
  FEDERATION_STATE_META,
} from './federationRegistry.js';
import { federationConventions } from './federationSchema.js';

const DAY_MS = 86400000;

function isoDay(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

/** The leadership seat a person belongs to: walking up until a seat exists. */
export function leadershipOwnerOf(built, personId) {
  if (!personId) return null;
  if (built.byId.has(personId)) return personId;
  let cursor = built.chain.nodes.get(personId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (built.byId.has(cursor)) return cursor;
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return null;
}

/** The span above a seat, or null when the seat is already the top of the tree. */
export function parentSeatOf(built, seatId) {
  if (!seatId || seatId === LEADER_ID) return null;
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === LEADER_ID) return null;
    if (built.byId.has(cursor)) return cursor;
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return null;
}

/** True when `candidateId` sits strictly above `seatId` in the declared tree. */
function isAbove(built, candidateId, seatId) {
  if (!candidateId || !seatId) return false;
  if (candidateId === LEADER_ID) return true;
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === candidateId) return true;
    if (cursor === LEADER_ID) return false;
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return false;
}

function nearestAncestorOf(built, seatId) {
  return parentSeatOf(built, seatId) || LEADER_ID;
}

/* --------------------------------------------------------------- channels */

/**
 * Every extractor returns `{ fromSeatId, toSeatId, on }` — a DATED artefact that
 * left a span and arrived at a leadership span. `toSeatId` may be the root
 * pseudo-seat (`leader`), which counts as "above every span" and therefore as a
 * bypass for any edge it skipped.
 */
const EXTRACTORS = Object.freeze({
  /** RULE-ENV-01 carriage edges: the envoy wrote them, this reads them. */
  packet(state, { built }) {
    const packets = Array.isArray(state.exchangePackets) ? state.exchangePackets : [];
    if (!packets.length) return [];
    const links = Array.isArray(state.links) ? state.links : [];
    const carried = new Map();
    for (const link of links) {
      if (!link || link.sourceType !== 'exchangepacket' || link.relation !== 'carries') continue;
      if (link.targetType !== 'person') continue;
      if (!carried.has(link.sourceId)) carried.set(link.sourceId, []);
      carried.get(link.sourceId).push(link);
    }
    const out = [];
    for (const packet of packets) {
      if (!packet || packet.direction !== 'inbound' || packet.status !== 'ingested') continue;
      const fromSeatId = packet.recipientSeatId;
      if (!fromSeatId) continue;
      const on = isoDay(packet.receivedAt) || isoDay(packet.createdAt);
      for (const link of carried.get(packet.id) || []) {
        out.push({ channel: 'packet', fromSeatId, toSeatId: link.targetId, on: on || isoDay(link.createdOn) });
      }
    }
    return out;
  },

  /** RULE-SCR-01: a frozen renewal reading is itself the upward report. */
  renewal(state, { built }) {
    const cycles = Array.isArray(state.strategyCycles) ? state.strategyCycles : [];
    const out = [];
    for (const cycle of cycles) {
      if (!cycle || !cycle.scopeSeatId) continue;
      out.push({
        channel: 'renewal',
        fromSeatId: cycle.scopeSeatId,
        toSeatId: nearestAncestorOf(built, cycle.scopeSeatId),
        on: isoDay(cycle.frozenOn),
      });
    }
    return out;
  },

  /** RULE-HK-01: an accepted commitment carries upward to the seat that proposed it. */
  commitment(state) {
    const pacts = Array.isArray(state.catchballPacts) ? state.catchballPacts : [];
    const out = [];
    for (const pact of pacts) {
      if (!pact || !pact.toSeatId || !pact.fromSeatId) continue;
      if (!['agreed', 'checked-in', 'settled'].includes(pact.status)) continue;
      out.push({
        channel: 'commitment',
        fromSeatId: pact.toSeatId,
        toSeatId: pact.fromSeatId,
        on: isoDay(pact.agreedOn) || isoDay(pact.startsOn) || isoDay(pact.createdAt),
      });
    }
    return out;
  },

  /** RULE-ECN-01: only a CLOSED two-sided round has carried the member's side. */
  concordance(state) {
    const rounds = Array.isArray(state.expectationRounds) ? state.expectationRounds : [];
    const out = [];
    for (const round of rounds) {
      if (!round || round.status !== 'closed') continue;
      if (!round.memberId || !round.leaderId) continue;
      out.push({
        channel: 'concordance',
        fromSeatId: round.memberId,
        toSeatId: round.leaderId,
        on: isoDay(round.closedOn) || isoDay(round.openedOn),
      });
    }
    return out;
  },

  /** RULE-CAD-01: a frozen cadence reading travels to the span above its author. */
  cadence(state, { built }) {
    const readings = Array.isArray(state.cadenceReadings) ? state.cadenceReadings : [];
    const out = [];
    for (const reading of readings) {
      if (!reading || !reading.ownerId) continue;
      out.push({
        channel: 'cadence',
        fromSeatId: reading.ownerId,
        toSeatId: nearestAncestorOf(built, reading.ownerId),
        on: isoDay(reading.frozenOn),
      });
    }
    return out;
  },
});

/** Exposed so a test can prove the registry and the code cannot drift apart. */
export const FEDERATION_EXTRACTOR_KEYS = Object.freeze(Object.keys(EXTRACTORS));

function extractEvents(state, { built }) {
  const events = [];
  const unplaced = [];
  for (const channel of FEDERATION_CHANNELS) {
    const extractor = EXTRACTORS[channel.key];
    if (typeof extractor !== 'function') continue;
    for (const raw of extractor(state, { built }) || []) {
      const origin = leadershipOwnerOf(built, raw.fromSeatId);
      if (!origin) {
        unplaced.push({ channel: channel.key, reason: 'The origin seat is not in the declared leadership tree.' });
        continue;
      }
      const target = raw.toSeatId === LEADER_ID ? LEADER_ID : leadershipOwnerOf(built, raw.toSeatId);
      if (!target) {
        unplaced.push({ channel: channel.key, reason: 'The receiving seat is not in the declared leadership tree.' });
        continue;
      }
      events.push({
        channel: channel.key,
        fromSeatId: origin,
        toSeatId: target,
        on: raw.on || null,
      });
    }
  }
  return { events, unplaced };
}

/**
 * The measurement itself: one row per leadership seat that HAS a declared span
 * above it, plus one `root` row per seat that does not.
 */
export function measureFederation(state, { now = new Date(), settings = null } = {}) {
  const conventions = federationConventions(settings || state?.settings || {});
  const built = buildSeats(state, { now, settings: settings || state?.settings || {} });
  const windowStart = addDays(dayKey(now), -conventions.federationWindowDays);
  const { events, unplaced } = extractEvents(state, { built });

  const byOrigin = new Map();
  for (const event of events) {
    if (!byOrigin.has(event.fromSeatId)) byOrigin.set(event.fromSeatId, []);
    byOrigin.get(event.fromSeatId).push(event);
  }

  const rows = [];
  for (const seat of built.seats) {
    if (seat.isLeader || !seat.altitudeKey) continue;
    const parentId = parentSeatOf(built, seat.id);
    const own = byOrigin.get(seat.id) || [];
    let directN = 0;
    let bypassN = 0;
    let lastCarriageOn = null;
    const channels = new Map();
    for (const event of own) {
      if (!event.on) continue;
      if (lastCarriageOn === null || event.on > lastCarriageOn) lastCarriageOn = event.on;
      const inWindow = event.on >= windowStart;
      let role = null;
      if (parentId && event.toSeatId === parentId) role = 'direct';
      else if (parentId && isAbove(built, event.toSeatId, parentId)) role = 'bypass';
      if (!role) continue;
      if (!inWindow) continue;
      if (role === 'direct') directN += 1;
      else bypassN += 1;
      const entry = channels.get(event.channel) || { key: event.channel, n: 0, lastOn: null };
      entry.n += 1;
      if (!entry.lastOn || event.on > entry.lastOn) entry.lastOn = event.on;
      channels.set(event.channel, entry);
    }
    const daysSince = lastCarriageOn ? Math.max(0, daysBetween(lastCarriageOn, dayKey(now))) : null;
    let stateKey;
    if (!parentId) stateKey = 'root';
    else if (directN > 0) stateKey = 'direct';
    else if (bypassN > 0) stateKey = 'bypass';
    else if (lastCarriageOn && lastCarriageOn < windowStart) stateKey = 'stale';
    else stateKey = 'silent';
    rows.push({
      seatId: seat.id,
      parentId,
      altitudeKey: seat.altitudeKey,
      rank: seat.rank,
      label: seat.label,
      shortLabel: seat.shortLabel,
      state: stateKey,
      directN,
      bypassN,
      evidenceN: directN + bypassN,
      lastCarriageOn,
      daysSince,
      channels: [...channels.values()].sort((a, b) => a.key.localeCompare(b.key)),
      suppressed: false,
    });
  }

  // Deterministic order: highest altitude first, then by typed id.
  rows.sort((a, b) => b.rank - a.rank || String(a.seatId).localeCompare(String(b.seatId)));
  return { built, conventions, windowStart, windowEnd: dayKey(now), events, unplaced, rows };
}

/* ------------------------------------------------------------- statistics */

/** Wilson score interval (z = 1.96) — the bounded rate, never a bare percentage. */
export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return { low: null, high: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    low: Math.min(1, Math.max(0, (centre - spread) / denom)),
    high: Math.min(1, Math.max(0, (centre + spread) / denom)),
  };
}

const pct1 = (value) => (value === null || value === undefined ? null : Math.round(value * 1000) / 10);

function coverageOf(rows, conventions) {
  const withParent = rows.filter((row) => row.state !== 'root');
  const n = withParent.length;
  const k = withParent.filter((row) => row.state === 'direct').length;
  if (n < conventions.federationMinSpans) {
    return {
      n,
      k,
      pct: null,
      lowPct: null,
      highPct: null,
      refused: true,
      minSpans: conventions.federationMinSpans,
      reason: `Coverage is WITHHELD: ${n} declared leadership edge${n === 1 ? '' : 's'} sit below the declared floor of ${conventions.federationMinSpans}. A percentage of ${n} would be a confident-looking figure with no evidence behind it.`,
    };
  }
  const interval = wilsonInterval(k, n);
  return {
    n,
    k,
    pct: pct1(k / n),
    lowPct: pct1(interval.low),
    highPct: pct1(interval.high),
    refused: false,
    minSpans: conventions.federationMinSpans,
    reason: `Coverage counts a DECLARED edge as connected only when a dated artefact from the span below reached the span above it inside the ${conventions.federationWindowDays}-day window.`,
  };
}

/**
 * Complementary suppression. A small cell (0 < n < floor) blanks itself AND the
 * largest remaining cell in the same group, so the group total can no longer be
 * differenced to recover it.
 */
export function suppressRowCounts(rows, cellFloor, population = rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.altitudeKey)) groups.set(row.altitudeKey, []);
    groups.get(row.altitudeKey).push(row);
  }
  const largestOpen = (pool) => pool
    .filter((row) => !row.suppressed && row.evidenceN > 0)
    .sort((a, b) => b.evidenceN - a.evidenceN)[0] || null;
  for (const group of groups.values()) {
    const small = group.filter((row) => row.evidenceN > 0 && row.evidenceN < cellFloor);
    if (!small.length) continue;
    for (const row of small) row.suppressed = true;
    // Complementary suppression: the cell that would let someone difference the
    // blank back out is blanked too — in the same altitude group when possible,
    // otherwise from the largest open cell in the published table. A table whose
    // every other cell is zero has nothing to difference against, and that is
    // stated in the withholding note rather than papered over.
    const partner = largestOpen(group) || largestOpen(population);
    if (partner) partner.suppressed = true;
  }
  return rows;
}

function scopedRows(built, seat, rows) {
  if (seat.fullAccess) return rows;
  const scope = seat.scope instanceof Set ? seat.scope : new Set(seat.scopeIds || []);
  return rows.filter((row) => scope.has(row.seatId));
}

function seatSummary(rows) {
  const counts = { direct: 0, bypass: 0, stale: 0, silent: 0, root: 0 };
  for (const row of rows) counts[row.state] = (counts[row.state] || 0) + 1;
  return {
    spansDeclared: rows.length,
    withParentN: rows.filter((row) => row.state !== 'root').length,
    measuredN: rows.filter((row) => row.evidenceN > 0).length,
    ...counts,
    suppressedN: rows.filter((row) => row.suppressed).length,
  };
}

function channelsInUse(measurement, rows) {
  const rowSeats = new Set(rows.map((row) => row.seatId));
  const usage = new Map();
  for (const event of measurement.events) {
    if (!rowSeats.has(event.fromSeatId)) continue;
    if (!event.on) continue;
    const entry = usage.get(event.channel) || { events: 0, spans: new Set(), lastOn: null };
    entry.events += 1;
    entry.spans.add(event.fromSeatId);
    if (!entry.lastOn || event.on > entry.lastOn) entry.lastOn = event.on;
    usage.set(event.channel, entry);
  }
  return FEDERATION_CHANNELS.map((channel) => {
    const entry = usage.get(channel.key) || null;
    return {
      key: channel.key,
      label: channel.label,
      source: channel.source,
      ruleId: channel.ruleId,
      detail: channel.detail,
      events: entry ? entry.events : 0,
      spans: entry ? entry.spans.size : 0,
      lastOn: entry ? entry.lastOn : null,
    };
  });
}

/** Frozen assessments visible to a seat, newest first. */
function scopedAssessments(state, seat) {
  const all = Array.isArray(state.federationAssessments) ? state.federationAssessments : [];
  const scope = seat.fullAccess ? null : (seat.scope instanceof Set ? seat.scope : new Set(seat.scopeIds || []));
  return all
    .filter((row) => row && (scope === null || row.scopeSeatId === seat.id || scope.has(row.scopeSeatId)))
    .sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn)));
}

/**
 * Open carriage findings in this seat's scope.
 *
 * The marker ledger is the index, not the decision's own text: RULE-FED-02
 * records the edge and the decision id it opened, so this read never has to
 * parse a title or trust a free-text marker in a decision body.
 */
function openEdgeDecisions(state, rows) {
  const edgeSeats = new Set(rows.flatMap((row) => [row.seatId, row.parentId]).filter(Boolean));
  const markers = Array.isArray(state.federationMarkers) ? state.federationMarkers : [];
  const decisions = Array.isArray(state.decisions) ? state.decisions : [];
  const out = [];
  const seen = new Set();
  for (const marker of markers) {
    if (!marker || marker.kind !== 'silent-edge' || !marker.decisionId) continue;
    if (seen.has(marker.decisionId)) continue;
    const edgeInScope = (marker.childSeatId && edgeSeats.has(marker.childSeatId))
      || (marker.parentSeatId && edgeSeats.has(marker.parentSeatId));
    if (!edgeInScope) continue;
    const decision = decisions.find((row) => row && row.id === marker.decisionId);
    if (!decision) continue;
    if (decision.chosen || (decision.outcome && decision.outcome !== 'pending')) continue;
    seen.add(marker.decisionId);
    out.push({
      id: decision.id,
      title: decision.title,
      reviewOn: decision.reviewOn || null,
      date: decision.date || null,
      outcome: decision.outcome || 'pending',
      childSeatId: marker.childSeatId || null,
      state: marker.state || null,
      weekKey: marker.weekKey || null,
    });
  }
  return out.slice(0, 20);
}

/* ----------------------------------------------------------------- report */

export function buildFederationReport(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const measurement = measureFederation(state, { now, settings });
  const { built, conventions } = measurement;
  const seat = seatId ? resolveSeat(built, seatId) : activeSeat(built);
  const allRows = measurement.rows;
  const mine = scopedRows(built, seat, allRows);
  const rows = mine.map((row) => ({ ...row, channels: row.channels.map((entry) => ({ ...entry })) }));
  const cellFloor = conventions.federationCellFloor;
  // Small-cell suppression is a DECLARED-SEAT rule. The local operator view is
  // not an audience the floor protects: it already holds every record, so
  // blanking a cell there would only make the operator's own screen lie.
  const highAltitude = !seat.fullAccess && seat.rank >= 4;
  const aggregateTier = !seat.fullAccess && seat.rank >= 3;
  if (aggregateTier) suppressRowCounts(rows, cellFloor, mine);

  const summary = seatSummary(rows);
  const coverage = coverageOf(rows, conventions);

  // Executive view: no span is named by a person; a span is its altitude and
  // its position, and rows above the detail ceiling carry counts only.
  const detail = seat.rank <= 3 && !seat.fullAccess;
  const viewRows = rows
    .slice(0, FEDERATION_LIMITS.rows)
    .map((row, index) => ({
      seatId: row.seatId,
      parentId: row.parentId,
      altitudeKey: row.altitudeKey,
      rank: row.rank,
      label: detail ? `${row.shortLabel} · span ${index + 1}` : `${row.label} span`,
      state: row.state,
      stateLabel: FEDERATION_STATE_META[row.state].label,
      meaning: FEDERATION_STATE_META[row.state].meaning,
      next: FEDERATION_STATE_META[row.state].next,
      directN: row.suppressed ? null : row.directN,
      bypassN: row.suppressed ? null : row.bypassN,
      evidenceN: row.suppressed ? null : row.evidenceN,
      suppressed: row.suppressed,
      lastCarriageOn: row.lastCarriageOn,
      daysSince: row.daysSince,
      channels: row.suppressed
        ? []
        : row.channels.map((entry) => {
          const meta = FEDERATION_CHANNELS.find((channel) => channel.key === entry.key);
          return { key: entry.key, label: meta ? meta.label : entry.key, n: entry.n, lastOn: entry.lastOn };
        }),
    }));

  const byAltitude = [...new Set(rows.map((row) => row.altitudeKey))]
    .sort()
    .map((altitudeKey) => {
      const group = rows.filter((row) => row.altitudeKey === altitudeKey);
      const small = group.length > 0 && group.length < cellFloor;
      return {
        altitudeKey,
        n: group.length,
        connected: small ? null : group.filter((row) => row.state === 'direct').length,
        bypassed: small ? null : group.filter((row) => row.state === 'bypass').length,
        stale: small ? null : group.filter((row) => row.state === 'stale').length,
        silent: small ? null : group.filter((row) => row.state === 'silent').length,
        root: small ? null : group.filter((row) => row.state === 'root').length,
        suppressed: small,
      };
    });

  const withheld = [];
  if (highAltitude) {
    withheld.push({
      reason: 'Span-level detail above the individual ceiling: rows are counts and states only, and no span is named by a person.',
      n: rows.length,
    });
  }
  if (seat.rank > 3) {
    withheld.push({
      reason: `Per-child channel breakdown is withheld above rank 3; ${rows.length} span row${rows.length === 1 ? '' : 's'} are read as states and counts only.`,
      n: rows.length,
    });
  }
  if (rows.some((row) => row.suppressed)) {
    withheld.push({
      reason: `Small-cell suppression: ${rows.filter((row) => row.suppressed).length} row(s) blanked at the floor of ${cellFloor}, each with a complementary cell where the table had one to blank.`,
      n: rows.filter((row) => row.suppressed).length,
    });
  }
  if (measurement.unplaced.length) {
    withheld.push({
      reason: 'Carriage that could not be placed on a declared leadership edge is not counted as connection.',
      n: measurement.unplaced.length,
    });
  }

  const open = seat.fullAccess || seat.rank >= 2 ? openEdgeDecisions(state, rows) : [];

  return {
    ok: true,
    engineVersion: FEDERATION_ENGINE_VERSION,
    today: dayKey(now),
    premise: FEDERATION_PREMISE,
    seat: {
      id: seat.id,
      label: seat.label,
      shortLabel: seat.shortLabel,
      altitudeKey: seat.altitudeKey || 'chief',
      rank: seat.rank,
      horizonDays: seat.horizonDays || 365,
      fullAccess: Boolean(seat.fullAccess),
      readOnly: Boolean(seat.readOnly),
      isLeader: Boolean(seat.isLeader),
    },
    playbook: FEDERATION_PLAYBOOK[seat.altitudeKey] || FEDERATION_PLAYBOOK.chief,
    disclosure: FEDERATION_DISCLOSURE,
    window: {
      days: conventions.federationWindowDays,
      start: measurement.windowStart,
      end: measurement.windowEnd,
    },
    conventions: {
      windowDays: conventions.federationWindowDays,
      minSpans: conventions.federationMinSpans,
      cellFloor,
      autoPropagate: conventions.federationAutoPropagate,
    },
    summary,
    coverage,
    rows: viewRows,
    byAltitude,
    channels: channelsInUse(measurement, rows),
    openDecisions: open,
    withheld,
    assessments: scopedAssessments(state, seat).slice(0, 12).map((row) => ({
      id: row.id,
      frozenOn: row.frozenOn,
      scopeSeatId: row.scopeSeatId,
      altitudeKey: row.altitudeKey,
      windowDays: row.windowDays,
      summary: row.summary,
    })),
    live: {
      canFreeze: !seat.readOnly,
      scopeLabel: seat.fullAccess ? 'the whole workspace' : `${seat.label.toLowerCase()} span`,
      overflow: rows.length > FEDERATION_LIMITS.rows,
    },
  };
}

/** The frozen, identity-reduced snapshot a freeze writes. */
export function buildFederationSnapshot(state, { id, now = new Date(), settings = null } = {}) {
  const report = buildFederationReport(state, { now, settings });
  if (!report.ok) return report;
  if (report.live.overflow) {
    return {
      ok: false,
      error: `This span declares more than ${FEDERATION_LIMITS.rows} leadership edges, which is beyond the bounded assessment. Narrow the operating seat; no partial snapshot is written.`,
    };
  }
  const measurement = measureFederation(state, { now, settings });
  const seat = measurement.built.byId.get(report.seat.id) || activeSeat(measurement.built);
  const scope = seat.fullAccess ? measurement.rows : measurement.rows.filter((row) => (seat.scope instanceof Set ? seat.scope : new Set()).has(row.seatId));
  return {
    ok: true,
    assessment: {
      id,
      scopeSeatId: report.seat.id,
      altitudeKey: report.seat.altitudeKey,
      rank: report.seat.rank,
      frozenOn: dayKey(now),
      windowDays: report.window.days,
      windowStart: report.window.start,
      engineVersion: FEDERATION_ENGINE_VERSION,
      summary: {
        ...report.summary,
        coverage: { ...report.coverage },
      },
      rows: scope.map((row) => ({
        seatId: row.seatId,
        parentId: row.parentId,
        altitudeKey: row.altitudeKey,
        rank: row.rank,
        state: row.state,
        suppressed: false,
        evidenceN: row.evidenceN,
        directN: row.directN,
        bypassN: row.bypassN,
        lastCarriageOn: row.lastCarriageOn,
        daysSince: row.daysSince,
        channels: row.channels.map((entry) => ({ key: entry.key, n: entry.n, lastOn: entry.lastOn })),
      })),
      createdAt: now.toISOString(),
    },
  };
}

export function federationBriefText(report) {
  if (!report || !report.ok) return typeof report?.error === 'string' ? report.error : 'No federation reading is available.';
  const c = report.coverage;
  const coverageLine = c.refused
    ? `Coverage: WITHHELD (${c.n} edge(s) below the floor of ${c.minSpans}).`
    : `Coverage: ${c.k} of ${c.n} declared edges measurably connected (${c.pct}%, Wilson 95% ${c.lowPct}–${c.highPct}%).`;
  return [
    `Programme federation reading — ${report.today} — ${report.seat.label}`,
    `Window: ${report.window.start} → ${report.window.end} (${report.window.days} days).`,
    `Span states: ${report.summary.direct} connected, ${report.summary.bypass} bypassed, ${report.summary.stale} stale, ${report.summary.silent} silent, ${report.summary.root} top-of-tree.`,
    coverageLine,
    `Channels measured: ${report.channels.map((channel) => `${channel.key} ${channel.events}`).join(', ')}.`,
    `Reading: ${report.premise}`,
    'No person is named, rated or ranked. A silent edge is a measurement of the EDGE, not of the people inside it.',
  ].join('\n');
}

export function federationCsvRows(report) {
  if (!report || !report.ok) return [];
  const rows = report.rows.map((row) => ({
    row_kind: 'span',
    altitude: row.altitudeKey || '',
    rank: row.rank,
    state: row.state,
    evidence_n: row.suppressed ? '' : row.evidenceN,
    direct_n: row.suppressed ? '' : row.directN,
    bypass_n: row.suppressed ? '' : row.bypassN,
    last_carriage_on: row.lastCarriageOn || '',
    days_since: row.daysSince === null ? '' : row.daysSince,
    suppressed: row.suppressed ? 'yes' : 'no',
  }));
  rows.push({
    row_kind: 'workspace',
    altitude: report.seat.altitudeKey || '',
    rank: report.seat.rank,
    state: '',
    evidence_n: '',
    direct_n: '',
    bypass_n: '',
    last_carriage_on: '',
    days_since: '',
    suppressed: '',
  });
  return rows;
}

export function federationCsvSummary(report) {
  if (!report || !report.ok) return [];
  const c = report.coverage;
  return [
    ['spans_declared', report.summary.spansDeclared],
    ['connected', report.summary.direct],
    ['bypassed', report.summary.bypass],
    ['stale', report.summary.stale],
    ['silent', report.summary.silent],
    ['root', report.summary.root],
    ['coverage_n', c.n],
    ['coverage_k', c.k],
    ['coverage_pct', c.refused ? '' : c.pct],
    ['coverage_low_pct', c.refused ? '' : c.lowPct],
    ['coverage_high_pct', c.refused ? '' : c.highPct],
    ['coverage_refused', c.refused ? 'yes' : 'no'],
    ['window_days', report.window.days],
  ];
}

/** Badge count: silent/bypassed edges plus open governed findings. */
export function federationAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildFederationReport(state, { now, settings });
  if (!report.ok) return 0;
  const broken = report.rows.filter((row) => row.state === 'silent' || row.state === 'bypass').length;
  return Math.min(99, broken + report.openDecisions.length);
}

/** Seven-day window used by RULE-FED-02 so one edge is not re-opened daily. */
export function federationWeekKey(now) {
  const day = dayKey(now);
  const date = new Date(`${day}T00:00:00.000Z`);
  const thursday = new Date(date);
  const weekday = (date.getUTCDay() + 6) % 7;
  thursday.setUTCDate(date.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday - firstThursday) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(Math.max(1, week)).padStart(2, '0')}`;
}
