/**
 * app/core/domain/differencingRules.js — RULE-DFR-01..04 on the shared
 * post-commit spine (ADR-0092, Schema v96).
 *
 *  RULE-DFR-01 REGISTER. A stored release is a first-class graph node. It writes
 *    one `summarizes-span` edge to the seat that published it and one to EVERY
 *    leadership ancestor above that seat, in the SAME atomic transaction, so a
 *    publication rolls up the hierarchy like every other record instead of being a
 *    dashboard only its author can see. One idempotent `registered` marker.
 *
 *  RULE-DFR-02 RECOVER. When the register determines a value the workspace
 *    withheld, open exactly ONE governed decision per module per ISO week, owned
 *    at the altitude that can change the publication practice, with typed edges to
 *    every release that took part in the proof and `rolls-up-to` edges to every
 *    leadership ancestor. The finding is about a PUBLICATION. No person is named,
 *    rated or ranked, and the recovered VALUE is never written into the decision:
 *    the decision carries the coordinate and the proof, not the number.
 *
 *  RULE-DFR-03 PROTECT. A release published as a protected version records its own
 *    protection marker and one owned task explaining which figure was removed and
 *    which spans that figure protected. The engine does not reprint anything and
 *    does not close the task: a person signs it off.
 *
 *  RULE-DFR-04 DRIFT. When a module's published totals form a non-stationary
 *    series, open ONE governed decision per module per ISO week naming the
 *    structural remedy — publish a change instead of a level — because no
 *    suppression pattern can fix a reprinted stock.
 *
 * All four are bounded, marker-idempotent and pausable by
 * `differencesAutoPropagate`; an explicit scan always runs. Nothing here sends a
 * message, edits a reporting line, reprints a figure, or closes a human decision.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import {
  buildDifferencesReport,
  detectExposures,
  driftReading,
  remedyFor,
} from './differencing.js';
import { differencesConventions } from './differencingSchema.js';
import {
  DIFFERENCING_EVENTS,
  DIFFERENCING_LIMITS,
  DIFFERENCING_MEASURE_LABELS,
  DIFFERENCING_RULE_IDS,
  DIFFERENCING_TRIGGER_PREFIX,
  DIFFERENCING_VERDICTS,
} from './differencingRegistry.js';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

const markerId = (kind, key) => `dfr-${kind}-${hash(String(key))}`;

/** ISO week key — the idempotency unit every module in this codebase uses. */
export function weekKey(now) {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day - yearStart) / 86400000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function markersOf(draft) {
  return Array.isArray(draft.differenceMarkers) ? draft.differenceMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.differenceMarkers)) draft.differenceMarkers = [];
  if (draft.differenceMarkers.some((row) => row?.id === marker.id)) return false;
  draft.differenceMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.differenceMarkers.length > DIFFERENCING_LIMITS.markers) {
    draft.differenceMarkers.splice(0, draft.differenceMarkers.length - DIFFERENCING_LIMITS.markers);
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
    summary: String(summary || '').slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary || '').slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
    });
  }
}

/** Leadership ancestors of a seat, nearest first, skipping the pseudo-root. */
function ancestorsAbove(draft, seatId, now) {
  if (!seatId) return [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== 'leader' && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

/** The altitude that can change a publication practice: the publishing span. */
function owningSeatId(draft, release, now) {
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  if (release?.scopeSeatId && built.byId.has(release.scopeSeatId)) return release.scopeSeatId;
  const active = draft?.settings?.activeSeatId;
  if (active && built.byId.has(active)) return active;
  return null;
}

function pushDecision(draft, ctx, { title, rationale, ownerId, route, ruleId }) {
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  if (draft.decisions.length >= 5000) return null;
  const id = ctx.idFactory('dec');
  draft.decisions.push({
    id,
    title: String(title).slice(0, 200),
    rationale: String(rationale).slice(0, 900),
    ownerId: ownerId || null,
    status: 'open',
    openedOn: dayKey(ctx.now),
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
    ruleId,
    recordClass: 'authority',
    tags: ['differential-disclosure', route].filter(Boolean),
  });
  return id;
}

function pushTask(draft, ctx, { title, ownerId, dueOn, route, ruleId }) {
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  if (draft.delegations.length >= 8000) return null;
  const id = ctx.idFactory('dlg');
  draft.delegations.push({
    id,
    title: String(title).slice(0, 200),
    ownerId: ownerId || null,
    status: 'open',
    delegatedOn: dayKey(ctx.now),
    dueOn: dueOn || null,
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
    ruleId,
    tags: ['differential-disclosure', route].filter(Boolean),
  });
  return id;
}

/* --------------------------------------- RULE-DFR-01: the release is a node */

function registerRule(draft, ctx, out) {
  const releases = Array.isArray(draft.differenceReleases) ? draft.differenceReleases : [];
  const target = releases.find((row) => row?.id === ctx.event.entityId) || null;
  if (!target) return;
  const id = markerId('registered', target.id);
  if (markersOf(draft).some((row) => row?.id === id)) return;
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  const seatId = target.scopeSeatId && built.byId.has(target.scopeSeatId) ? target.scopeSeatId : null;

  // Vertical roll-up: the publication belongs to the seat that made it and to
  // every leadership ancestor above it, in the same atomic transaction. A
  // publication nobody above can see is a publication the house cannot defend.
  const targets = seatId ? [seatId, ...ancestorsAbove(draft, seatId, ctx.now)] : [];
  let links = 0;
  for (const targetSeatId of targets) {
    if (addLink(draft, ctx, 'differencingrelease', target.id, 'person', targetSeatId, 'summarizes-span', DIFFERENCING_RULE_IDS.register,
      `Published ${target.route} aggregate for ${dayKey(ctx.now)}: ${target.verdict}`)) links += 1;
  }
  addMarker(draft, ctx, { id, kind: 'registered', route: target.route, releaseId: target.id });
  note(ctx, out, DIFFERENCING_RULE_IDS.register, 'registered', 'differencingrelease', target.id,
    `Release registered with ${links} vertical roll-up edge(s); nothing was reprinted and no reporting line changed.`);
}

/** Releases that took part in a proof against one target release. */
function participantsOf(releases, target, conventions) {
  const sameRoute = releases
    .filter((row) => row && row.route === target.route && row.id !== target.id)
    .sort((a, b) => String(b.releasedOn).localeCompare(String(a.releasedOn)));
  const window = sameRoute.slice(0, conventions.differencesWindowReleases);
  // Same-day, other-module publications are participants too: overlapping record
  // populations make one module's total an equation about the other's.
  const sameDay = releases.filter((row) => row
    && row.id !== target.id
    && row.route !== target.route
    && String(row.releasedOn).slice(0, 10) === String(target.releasedOn).slice(0, 10));
  return [...window, ...sameDay].slice(0, 24);
}

/* -------------------------------------- RULE-DFR-02: a determined value */

function recoverRule(draft, ctx, out) {
  const conventions = differencesConventions(draft.settings || {});
  if (conventions.differencesAutoPropagate === false && ctx.event.type !== DIFFERENCING_EVENTS.SCAN) return;
  const releases = Array.isArray(draft.differenceReleases) ? draft.differenceReleases : [];
  if (!releases.length) return;
  const report = buildDifferencesReport(draft, { now: ctx.now, settings: draft.settings || {} });
  if (!report.ok) return;
  const week = weekKey(ctx.now);
  let opened = 0;
  for (const row of report.routes) {
    if (opened >= DIFFERENCING_LIMITS.decisionsPerScan) break;
    if (!row.recoveredN || row.inconsistentN) continue;
    const id = markerId('recovered', `${row.route}|${week}`);
    if (markersOf(draft).some((marker) => marker?.id === id)) continue;
    const latest = releases.find((release) => release && release.route === row.route) || null;
    const participants = latest ? participantsOf(releases, latest, conventions) : [];
    // The decision names a COORDINATE and a PROOF. Writing the recovered value
    // would make the decision record the disclosure it is about.
    const coordinates = row.recovered.slice(0, 5)
      .map((item) => `span ${item.cellKey.slice(0, 24)} · ${item.measureLabel}`)
      .join('; ');
    const owner = latest ? owningSeatId(draft, latest, ctx.now) : null;
    const decisionId = pushDecision(draft, ctx, {
      title: `[${DIFFERENCING_RULE_IDS.recover}] ${row.label}: published aggregates determine ${row.recoveredN} withheld value(s)`,
      rationale: [
        `Across ${row.window} registered release(s) of ${row.label}, exact integer arithmetic determines ${row.recoveredN} value(s) the workspace withheld: ${coordinates}.`,
        'The figures were never printed. They are recoverable by subtraction from the published totals, which is the same disclosure with a longer proof.',
        // A refused drift test contributes NO diagnosis: the decision says the
        // trend was not tested rather than implying it was and came back clean.
        row.drift && !row.drift.refused
          ? `Series diagnosis: ${row.drift.reason}`
          : 'Series diagnosis: not tested — too few published totals to separate drift from noise, so this finding rests on the arithmetic alone.',
        `Remedy: ${remedyFor([], row.drift && !row.drift.refused ? row.drift : null)}`,
        'No person is named, rated or ranked. This is a finding about a publication practice.',
      ].join(' '),
      ownerId: owner,
      route: row.route,
      ruleId: DIFFERENCING_RULE_IDS.recover,
    });
    if (!decisionId) continue;
    // Provenance: every release that took part in the proof.
    for (const participant of participants) {
      addLink(draft, ctx, 'decision', decisionId, 'differencingrelease', participant.id, 'proves-release', DIFFERENCING_RULE_IDS.recover,
        `Took part in the differencing proof over ${row.route}`);
    }
    if (latest) {
      addLink(draft, ctx, 'decision', decisionId, 'differencingrelease', latest.id, 'proves-release', DIFFERENCING_RULE_IDS.recover,
        `Latest registered release of ${row.route}`);
    }
    // Vertical fan-out: the leadership chain sees the finding in the same write.
    const ancestors = owner ? ancestorsAbove(draft, owner, ctx.now) : [];
    for (const ancestorId of ancestors) {
      addLink(draft, ctx, 'decision', decisionId, 'person', ancestorId, 'rolls-up-to', DIFFERENCING_RULE_IDS.recover,
        `Publication-integrity finding rolled up from ${row.label}`);
    }
    addMarker(draft, ctx, { id, kind: 'recovered', route: row.route, decisionId, weekKey: week, note: `${row.recoveredN} determined` });
    note(ctx, out, DIFFERENCING_RULE_IDS.recover, 'decision', 'decision', decisionId,
      `Opened one governed publication-integrity decision for ${row.label} (${row.recoveredN} determined value(s), ${ancestors.length} roll-up edge(s)).`);
    opened += 1;
  }
}

/* -------------------------------- RULE-DFR-03: record what protection cost */

function protectRule(draft, ctx, out) {
  const releases = Array.isArray(draft.differenceReleases) ? draft.differenceReleases : [];
  const target = releases.find((row) => row?.id === ctx.event.entityId) || null;
  if (!target || target.verdict !== DIFFERENCING_VERDICTS.PROTECTED) return;
  const id = markerId('protected', target.id);
  if (markersOf(draft).some((row) => row?.id === id)) return;
  const totals = Array.isArray(target.protection?.withheldTotals) ? target.protection.withheldTotals : [];
  const extra = Number(target.protection?.withheldCells) || 0;
  if (!totals.length && !extra) {
    // A "protected" release that removed nothing is a data problem, not a task.
    addMarker(draft, ctx, { id, kind: 'protected', route: target.route, releaseId: target.id, note: 'no removal recorded' });
    return;
  }
  const owner = owningSeatId(draft, target, ctx.now);
  const parts = [];
  if (totals.length) parts.push(`the ${totals.map((measure) => DIFFERENCING_MEASURE_LABELS[measure] || measure).join(' and ')} total(s)`);
  if (extra) parts.push(`${extra} further small cell(s)`);
  const taskId = pushTask(draft, ctx, {
    title: `[${DIFFERENCING_RULE_IDS.protect}] Record why the ${target.route} aggregate withheld ${parts.join(' and ')}`,
    ownerId: owner,
    dueOn: dayKey(addDays(ctx.now, 7)),
    route: target.route,
    ruleId: DIFFERENCING_RULE_IDS.protect,
  });
  if (taskId) {
    addLink(draft, ctx, 'delegation', taskId, 'differencingrelease', target.id, 'protects-release', DIFFERENCING_RULE_IDS.protect,
      `Explains the figure withheld to keep this publication unrecoverable`);
  }
  addMarker(draft, ctx, { id, kind: 'protected', route: target.route, releaseId: target.id, taskId, note: parts.join('; ') });
  note(ctx, out, DIFFERENCING_RULE_IDS.protect, 'task', 'delegation', taskId,
    `A protected publication holds an owned explanation of the ${parts.join(' and ')} it removed.`);
}

/* -------------------------------- RULE-DFR-04: the publication rhythm itself */

function driftRule(draft, ctx, out) {
  const conventions = differencesConventions(draft.settings || {});
  if (conventions.differencesAutoPropagate === false && ctx.event.type !== DIFFERENCING_EVENTS.SCAN) return;
  const releases = Array.isArray(draft.differenceReleases) ? draft.differenceReleases : [];
  if (releases.length < conventions.differencesMinPoints) return;
  const routes = [...new Set(releases.map((row) => row?.route).filter(Boolean))];
  const week = weekKey(ctx.now);
  let opened = 0;
  for (const route of routes) {
    if (opened >= DIFFERENCING_LIMITS.decisionsPerScan) break;
    const rows = releases.filter((row) => row && row.route === route);
    const drift = driftReading(rows, { conventions });
    if (drift.refused) continue;
    const drifting = (drift.runs && drift.runs.drift) || (drift.range && drift.range.shift);
    if (!drifting) continue;
    const id = markerId('drift', `${route}|${week}`);
    if (markersOf(draft).some((marker) => marker?.id === id)) continue;
    const latest = rows[0] || null;
    const owner = latest ? owningSeatId(draft, latest, ctx.now) : null;
    const trips = [
      drift.runs && drift.runs.runs !== null ? `runs test p=${drift.runs.pValue}` : null,
      drift.range && drift.range.statistic !== null ? `range statistic ${drift.range.scaled} (5% bound 1.55)` : null,
    ].filter(Boolean).join(', ');
    const decisionId = pushDecision(draft, ctx, {
      title: `[${DIFFERENCING_RULE_IDS.drift}] ${route}: published totals are not a stationary series`,
      rationale: [
        `Over ${drift.points} published totals the series is ${drift.direction} by ${drift.delta} and fails the stationarity test (${trips}).`,
        'Reprinting a level over time hands a reader the movement between dates even where no cell is small, so no suppression pattern can make the next reprint safe.',
        `Remedy: ${remedyFor([{ key: 'growth' }], drift)}`,
        'This is a finding about a publication rhythm, never about a person.',
      ].join(' '),
      ownerId: owner,
      route,
      ruleId: DIFFERENCING_RULE_IDS.drift,
    });
    if (!decisionId) continue;
    for (const ancestorId of owner ? ancestorsAbove(draft, owner, ctx.now) : []) {
      addLink(draft, ctx, 'decision', decisionId, 'person', ancestorId, 'rolls-up-to', DIFFERENCING_RULE_IDS.drift,
        `Publication-rhythm finding rolled up from ${route}`);
    }
    addMarker(draft, ctx, {
      id, kind: 'drift', route, decisionId, weekKey: week, points: drift.points,
      pValue: drift.runs?.pValue ?? null,
      note: `${drift.direction} by ${drift.delta}`,
    });
    note(ctx, out, DIFFERENCING_RULE_IDS.drift, 'decision', 'decision', decisionId,
      `Opened one governed publication-rhythm decision for ${route} (${drift.points} points, ${drift.direction}).`);
    opened += 1;
  }
}

/* ---------------------------------------------------------------- the rule */

export const DIFFERENCING_TRIGGERS = Object.freeze([
  `${DIFFERENCING_TRIGGER_PREFIX}released`,
  `${DIFFERENCING_TRIGGER_PREFIX}scan`,
  `${DIFFERENCING_TRIGGER_PREFIX}conventions`,
]);

export function differencingRule(draft, ctx) {
  const type = String(ctx?.event?.type || '');
  if (!type.startsWith(DIFFERENCING_TRIGGER_PREFIX)) return [];
  const released = type === DIFFERENCING_EVENTS.RELEASED;
  const out = [];
  if (released) {
    registerRule(draft, ctx, out);
    protectRule(draft, ctx, out);
  }
  // The heavy passes recompute the register. They run on the module's own events
  // PLUS an explicit scan, and never on another module's write.
  recoverRule(draft, ctx, out);
  driftRule(draft, ctx, out);
  return out;
}

// Every rule on the shared spine declares its own identity. Without these two
// assignments `DEFAULT_POST_COMMIT_RULES.map((r) => r.id)` yields `undefined`
// for this rule, which breaks the spine's ordering invariants and the
// `rule.id`-keyed contract lookup — the contract is declared, but unreachable.
differencingRule.id = 'differencingRule';
differencingRule.label = 'Publication integrity and differencing defence (RULE-DFR-01..04)';

export { DIFFERENCING_EVENTS, DIFFERENCING_RULE_IDS };
