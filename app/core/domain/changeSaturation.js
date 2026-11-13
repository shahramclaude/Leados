/**
 * app/core/domain/changeSaturation.js — the read model behind
 * `#/matrix?panel=change-saturation` (ADR-0186, Session 254, Schema v148,
 * CSV scope #140, RULE-CSA-01).
 *
 * WHAT IT DOES. It takes the dated change demands the lines declared
 * (`changeSaturationActs`), charges them to the person they land on — ONCE per
 * change per day, however many lines declared it — and compares that day-by-day
 * sum with the absorptive capacity a human declared (`changeSaturationCeilings`).
 * It stores nothing. Every figure here is recomputed from the record on every
 * read, so a reload cannot disagree with what was printed.
 *
 * WHAT IT REFUSES (the load-bearing part of the module)
 *  1. It never compares a load with an undeclared capacity. A subject with no
 *     ceiling in force reads `no-ceiling` — never `within`, never zero, never a
 *     number borrowed from a peer, a pool, a pay grade or a calendar.
 *  2. It never averages a disagreement. Where two lines declare the same change
 *     for the same person at different weights, the day is charged the HEAVIEST
 *     band (the demand exists either way) and the row reads `contested`, because
 *     two managers weighing one impact 2 and 5 is the finding, not the noise.
 *  3. It never charges one impact twice. Two lines approving their own change
 *     onto one person does not make the impact happen twice on that person's day.
 *  4. It never reads an expired ceiling as compliance. A limit whose window
 *     passed governs nothing and stays on the register as the dated statement it
 *     was.
 *  5. It never lets a withheld figure look like a zero. A withheld cell carries
 *     `null` and a reason; `withheldRowsN` counts them; `figuresComplete` says so
 *     at the top, separately from `countsReconcile`.
 *  6. It never rates a person. No figure here is a performance, health or stamina
 *     claim, and the export carries no person at all.
 *
 * ARITHMETIC. All day arithmetic is on integer epoch-day indices, and all weight
 * arithmetic is on the integer band values themselves, so every total is exactly
 * reproducible and every sum can be reconciled against the ledger it read. The
 * window is INCLUSIVE of both ends: `days` days back from today, today included.
 */

import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  CHANGE_SATURATION_BAND_VALUES,
  CHANGE_SATURATION_CSV_COLUMNS,
  CHANGE_SATURATION_DETAIL_REASONS,
  CHANGE_SATURATION_ENGINE_VERSION,
  CHANGE_SATURATION_LIMITS,
  CHANGE_SATURATION_STATES,
  CHANGE_SATURATION_UNIT,
  CHANGE_SATURATION_WITHHELD_LABELS,
  changeSaturationBandLabel,
  changeSaturationClearance,
  changeSaturationState,
} from './changeSaturationRegistry.js';
import {
  liveChangeCeilings,
  normalizeChangeSaturationSettings,
  saturationDay,
  inclusiveDays,
  CHANGE_SATURATION_DEFAULTS_RESOLVED,
} from './changeSaturationSchema.js';

const K = {
  windowDays: 'changeSaturationWindowDays',
  minPoolN: 'changeSaturationMinPoolN',
};

/** A change that is underway or awaiting a decision: the only ones a clearance is asked about. */
const OPEN_CHANGE_STATUSES = new Set(['proposed', 'active']);
/** A change whose impact has landed: the demand has done its work and charges no further day. */
const ABSORBED_CHANGE_STATUSES = new Set(['anchored', 'closed', 'completed']);
/** A change stopped without landing: a real weight that was carried, then halted. */
const HALTED_CHANGE_STATUSES = new Set(['paused', 'abandoned', 'cancelled']);

const DAY_MS = 86400000;
const EPOCH_DAY = Date.UTC(1970, 0, 1) / DAY_MS;

function dayIndex(day) {
  const iso = saturationDay(day);
  if (!iso) return null;
  return Math.round(Date.parse(`${iso}T00:00:00.000Z`) / DAY_MS) - EPOCH_DAY;
}

function dayFromIndex(index) {
  return new Date((index + EPOCH_DAY) * DAY_MS).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const n = dayIndex(iso);
  return n === null ? null : dayFromIndex(n + days);
}

function clean(value, max = 160) {
  const text = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value);
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Clip a declared window to the read window. Returns null when the demand's own
 * window lies wholly outside the read window, which is its own counted partition
 * rather than a silent exclusion.
 */
function clipInterval(fromOn, toOn, fromIdx, toIdx) {
  const start = Math.max(dayIndex(fromOn) ?? fromIdx, fromIdx);
  const end = Math.min(dayIndex(toOn) ?? toIdx, toIdx);
  if (end < start) return null;
  return { start, end };
}

/**
 * Turn clipped intervals into (load, run-of-days) segments.
 *
 * `groups` is a list of per-change entries, each carrying the intervals that
 * change is charged over and the weight to charge. On every day a change
 * contributes ONE weight — its heaviest declared band — never one per declaring
 * line, which is the rule that stops a person being counted twice for one
 * impact. Days outside every interval carry nothing and are never visited.
 */
/**
 * A change's day-by-day weight for one subject: on each day the change
 * contributes ONE weight — the heaviest band any line declared for THAT DAY — and
 * never the sum of the declarations. Two managers approving their own change onto
 * one person does not make the impact happen twice on that person's day, so the
 * declarations are cut into sub-ranges at their boundaries and each sub-range
 * carries the maximum band covering it.
 */
function changeDayWeights(entry, fromIdx, toIdx) {
  const bounds = new Set([fromIdx, toIdx + 1]);
  for (const declaration of entry.declarations) {
    if (!declaration.interval) continue;
    if (declaration.interval.start > fromIdx) bounds.add(declaration.interval.start);
    if (declaration.interval.end + 1 <= toIdx) bounds.add(declaration.interval.end + 1);
  }
  const points = [...bounds].filter((index) => index >= fromIdx && index <= toIdx + 1).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1] - 1;
    if (end < start) continue;
    let weight = null;
    for (const declaration of entry.declarations) {
      if (!declaration.interval) continue;
      if (declaration.interval.start > end || declaration.interval.end < start) continue;
      const band = declaration.band === null ? 0 : declaration.band;
      if (weight === null || band > weight) weight = band;
    }
    if (weight === null || weight <= 0) continue;
    out.push({ start, end, weight });
  }
  return out;
}

/**
 * Sum the per-change day-weights into one timeline. Days outside every interval
 * carry nothing and are never visited; a day the change does not touch is not a
 * day of zero load claimed as a measurement.
 */
function buildTimeline(changeEntries, fromIdx, toIdx, excludeChangeId = null) {
  const deltas = new Map();
  const bump = (index, value) => {
    if (!Number.isFinite(index)) return;
    deltas.set(index, (deltas.get(index) || 0) + value);
  };
  for (const entry of changeEntries) {
    if (excludeChangeId !== null && entry.changeId === excludeChangeId) continue;
    for (const piece of changeDayWeights(entry, fromIdx, toIdx)) {
      bump(piece.start, piece.weight);
      bump(piece.end + 1, -piece.weight);
    }
  }
  if (!deltas.size) return { segments: [], peak: null, peakFromDay: null, exposure: 0, activeDays: 0 };
  const keys = [...deltas.keys()].filter((index) => index >= fromIdx && index <= toIdx + 1).sort((a, b) => a - b);
  const segments = [];
  let load = 0;
  let cursor = fromIdx;
  let peak = null;
  let peakFromDay = null;
  let exposure = 0;
  let activeDays = 0;
  const flush = (start, end) => {
    const runDays = end - start + 1;
    if (runDays <= 0) return;
    segments.push({ start, end, load });
    if (load > 0) {
      exposure += load * runDays;
      activeDays += runDays;
      if (peak === null || load > peak) { peak = load; peakFromDay = dayFromIndex(start); }
    }
  };
  for (const key of keys) {
    if (key > cursor) flush(cursor, Math.min(key - 1, toIdx));
    cursor = Math.max(cursor, key);
    load += deltas.get(key) || 0;
    if (cursor > toIdx) break;
  }
  if (cursor <= toIdx) flush(cursor, toIdx);
  return { segments, peak, peakFromDay, exposure, activeDays };
}

/**
 * Measure a person's or a pool's day-by-day load against a declared ceiling.
 * Exact integers throughout: nothing is rounded into looking acceptable.
 */
function measure(segments, ceilingUnits, judged = null) {
  let daysOver = 0;
  let longestRun = 0;
  let run = 0;
  let firstOverDay = null;
  let peakExcess = null;
  for (const segment of segments) {
    if (ceilingUnits !== null && segment.load > ceilingUnits) {
      const span = segment.end - segment.start + 1;
      daysOver += span;
      run += span;
      if (run > longestRun) longestRun = run;
      if (!firstOverDay) firstOverDay = dayFromIndex(segment.start);
    } else {
      run = 0;
    }
  }
  const peak = segments.reduce((max, segment) => (segment.load > max ? segment.load : max), null);
  if (peak !== null && ceilingUnits !== null && peak > ceilingUnits) peakExcess = peak - ceilingUnits;
  const permille = peak !== null && ceilingUnits ? Math.round((peak * 1000) / ceilingUnits) : null;
  const headroom = peak !== null && ceilingUnits !== null ? ceilingUnits - peak : null;
  return {
    peak, peakExcess, permille, headroom,
    daysOver: ceilingUnits === null ? null : daysOver,
    longestRun: ceilingUnits === null ? null : longestRun,
    firstOverDay: ceilingUnits === null ? null : firstOverDay,
    peakFromDay: segments.find((segment) => segment.load === peak)?.start !== undefined && peak !== null
      ? dayFromIndex(segments.find((segment) => segment.load === peak).start)
      : null,
    exposure: segments.reduce((sum, segment) => sum + segment.load * (segment.end - segment.start + 1), 0),
    unjudged: judged === null ? null : judged,
  };
}

/**
 * Days inside the read window that NO in-force ceiling covered. A day nobody
 * bounded is not a day that was met, so it is counted as unjudged rather than
 * quietly excluded from the denominator.
 */
function judgedDays(ceilingRows, fromIdx, toIdx) {
  if (!ceilingRows.length) return 0;
  const covered = new Set();
  for (const row of ceilingRows) {
    const start = Math.max(dayIndex(row.fromOn) ?? fromIdx, fromIdx);
    const end = Math.min(dayIndex(row.toOn) ?? toIdx, toIdx);
    for (let index = start; index <= end; index += 1) covered.add(index);
  }
  return covered.size;
}

/* ------------------------------------------------- the disclosure ladder, applied */
// Below `full` a row keeps its arithmetic and loses its identities. Nothing is
// silently deleted — the row is still counted in the totals, and the reason the
// names are missing is printed on the board — because a reader has to be able to
// tell "withheld from you" apart from "not in this workspace".

/** A person row without the person. */
function narrowRow(row) {
  return {
    ...row,
    personId: null,
    name: 'withheld at this disclosure level',
    role: '',
    lines: row.lines.map((line) => ({ ...line, managerId: null, managerName: 'withheld' })),
    demandLines: row.demandLines.map((line) => ({ ...line, managerId: null, managerName: null })),
    ceilingIds: [],
  };
}

/** A pool row without the manager or the membership. */
function narrowPool(row) {
  return { ...row, managerId: null, managerName: 'withheld at this disclosure level', ceilingIds: [] };
}

/** A clearance row without the person; the change is not an identity. */
function narrowClearance(row) {
  return { ...row, personId: null, personName: 'withheld at this disclosure level' };
}

/** A candidate row without the person or the line holder. */
function narrowCandidate(row) {
  return {
    ...row,
    personId: null,
    personName: 'withheld at this disclosure level',
    lines: row.lines.map((line) => ({ ...line, managerId: null, managerName: 'withheld' })),
  };
}

/** How a stored ceiling sits relative to today, printed for the register's own card. */
function censusCeilings(rows, today) {
  const census = { 'in-force': 0, 'forward-only': 0, expired: 0, retired: 0, 'ceiling-conflict': 0, person: 0, pool: 0, total: rows.length };
  for (const row of rows) {
    if (!row) continue;
    if (row.scope === 'person') census.person += 1;
    else if (row.scope === 'pool') census.pool += 1;
    if (row.retired) { census.retired += 1; continue; }
    const fromOn = saturationDay(row.fromOn);
    const toOn = saturationDay(row.toOn);
    if (!fromOn || !toOn) { census['ceiling-conflict'] += 1; continue; }
    if (fromOn > today) census['forward-only'] += 1;
    else if (toOn < today) census.expired += 1;
    else census['in-force'] += 1;
  }
  return census;
}

/** The single ceiling that governs a subject today, or why none does. */
function governingCeiling(liveMap, scope, subjectId) {
  const rows = liveMap.get(`${scope}:${subjectId}`) || [];
  if (!rows.length) return { units: null, status: 'none', rows: [], reason: null };
  const distinct = new Set(rows.map((row) => row.units));
  if (distinct.size > 1) {
    return { units: null, status: 'conflict', rows, reason: 'ceiling-conflict' };
  }
  return { units: rows[0].units, status: 'in-force', rows, reason: null };
}

/**
 * THE BOARD. `visiblePersonIds` scopes WHOSE rows come back (the operating seat's
 * span); the workspace totals are always the whole record, because a total that
 * changed with the viewer would be a different total, not a smaller one.
 * `detailLevel` decides whether names come back at all: `full` everything,
 * `span` counts and pools without names, `none` totals only — with the reason.
 */
export function buildChangeSaturation(state, {
  now = new Date(),
  settings = null,
  visiblePersonIds = null,
  detailLevel = 'full',
  matrix = null,
} = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const conv = normalizeChangeSaturationSettings(settings || source.settings || {});
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = at.toISOString().slice(0, 10);
  const windowDays = conv[K.windowDays] || CHANGE_SATURATION_DEFAULTS_RESOLVED[K.windowDays];
  const minPoolN = conv[K.minPoolN] || CHANGE_SATURATION_DEFAULTS_RESOLVED[K.minPoolN];
  const windowFrom = addDays(today, -(windowDays - 1));
  const fromIdx = dayIndex(windowFrom);
  const toIdx = dayIndex(today);

  const graph = matrix || buildMatrix(source, { now: at, settings: settings || source.settings || {} });
  const roster = graph?.roster || new Map();
  const linesByPerson = graph?.linesByPerson || new Map();
  const nameOf = (id) => clean(roster.get(id)?.name || graph?.nodes?.get?.(id)?.name || id || '', 120);

  const defectsByPerson = new Map();
  for (const defect of (graph?.defects || [])) {
    if (!defect?.personId) continue;
    if (!defectsByPerson.has(defect.personId)) defectsByPerson.set(defect.personId, []);
    defectsByPerson.get(defect.personId).push(defect);
  }

  const acts = Array.isArray(source.changeSaturationActs) ? source.changeSaturationActs : [];
  const ceilingRows = Array.isArray(source.changeSaturationCeilings) ? source.changeSaturationCeilings : [];
  const changes = Array.isArray(source.changes) ? source.changes : [];
  const changeById = new Map(changes.filter((c) => c && c.id).map((c) => [c.id, c]));
  const liveMap = liveChangeCeilings(ceilingRows, today);
  const inScope = (personId) => !visiblePersonIds || visiblePersonIds.has(personId);

  /* ---------------------------------------------------- 1. partition the acts */
  // Every stored act lands in exactly one partition, so the printed totals can be
  // checked against the ledger rather than trusted.
  const counts = { read: 0, withdrawn: 0, absorbed: 0, halted: 0, unattributed: 0, beforeWindow: 0 };
  /** personId → Map(changeId → { changeId, weight, intervals, declarations[] }) */
  const groups = new Map();
  /** managerId → Map(personId → Map(changeId → {...})) : which line put what where */
  const poolGroups = new Map();
  const refusalTally = new Map();
  const refused = (reason, note) => {
    refusalTally.set(reason, { count: (refusalTally.get(reason)?.count || 0) + 1, note });
  };

  for (const act of acts) {
    if (!act || !act.personId) { counts.unattributed += 1; refused('line-not-active', 'A demand row with no person named.'); continue; }
    if (act.withdrawn) { counts.withdrawn += 1; continue; }
    const change = changeById.get(act.changeId) || null;
    if (!change) { counts.unattributed += 1; refused('unknown-change', 'The demand names a change this workspace no longer holds.'); continue; }
    // The declaring line has to still be a line that person holds. If it is not,
    // the burden is in the ledger and nobody owns it: it is counted apart rather
    // than reassigned to whichever line happens to be readable.
    const personLines = linesByPerson.get(act.personId) || [];
    const declaringLine = personLines.find((line) => String(line.id) === String(act.lineKey)) || null;
    if (!declaringLine) { counts.unattributed += 1; refused('line-not-active', 'The declaring line is no longer an active Matrix line of this person.'); continue; }
    if (ABSORBED_CHANGE_STATUSES.has(change.status)) { counts.absorbed += 1; continue; }
    if (HALTED_CHANGE_STATUSES.has(change.status)) { counts.halted += 1; continue; }
    const interval = clipInterval(act.fromOn, act.toOn, fromIdx, toIdx);
    if (!interval) { counts.beforeWindow += 1; refused('window-outside-read', 'The declared window lies wholly outside the read window.'); continue; }
    counts.read += 1;

    const band = CHANGE_SATURATION_BAND_VALUES.includes(act.band) ? act.band : null;
    const bucketFor = (byChange, act, band, interval, declaringLine) => {
      if (!byChange.has(act.changeId)) {
        byChange.set(act.changeId, { changeId: act.changeId, bands: new Set(), declarations: [], diverged: false });
      }
      const bucket = byChange.get(act.changeId);
      if (band !== null) {
        bucket.bands.add(band);
        // Two lines weighing ONE impact differently for ONE person is not noise to
        // average away: the heavier reading charges the day and the disagreement
        // becomes the verdict.
        if (bucket.bands.size > 1) bucket.diverged = true;
      }
      bucket.declarations.push({ act, lineKey: String(act.lineKey), managerId: declaringLine.managerId || null, interval, band });
      return bucket;
    };
    let byPersonGroups = groups.get(act.personId);
    if (!byPersonGroups) { byPersonGroups = new Map(); groups.set(act.personId, byPersonGroups); }
    bucketFor(byPersonGroups, act, band, interval, declaringLine);
    if (declaringLine.managerId) {
      let byManager = poolGroups.get(declaringLine.managerId);
      if (!byManager) { byManager = new Map(); poolGroups.set(declaringLine.managerId, byManager); }
      let byPerson = byManager.get(act.personId);
      if (!byPerson) { byPerson = new Map(); byManager.set(act.personId, byPerson); }
      bucketFor(byPerson, act, band, interval, declaringLine);
    }
  }

  const stateCounts = CHANGE_SATURATION_STATES.reduce((acc, row) => ({ ...acc, [row.key]: 0 }), {});

  /* ------------------------------------------------ 2. one row per real person */
  const personRows = [];
  for (const [personId, byChange] of groups) {
    const entries = [...byChange.values()].map((entry) => ({
      ...entry,
      // The change's heaviest declared band, used for display and ordering only:
      // the day-by-day figure itself is recomputed per sub-range below, because a
      // line that declared a heavier band for part of the window must not raise the
      // whole window for the rest of it.
      weight: Math.max(0, ...entry.declarations.map((declaration) => declaration.band ?? 0)),
    }));
    const person = roster.get(personId) || null;
    const lines = linesByPerson.get(personId) || [];
    const contestedChanges = entries.filter((entry) => entry.diverged);
    const ceiling = governingCeiling(liveMap, 'person', personId);
    const inScopePerson = inScope(personId);
    const timeline = buildTimeline(entries, fromIdx, toIdx);
    const judged = judgedDays(ceiling.rows, fromIdx, toIdx);
    const measurement = measure(timeline.segments, ceiling.units, windowDays - judged);
    const defect = defectsByPerson.get(personId) || [];

    let stateKey = 'within';
    const reasons = [];
    if (!person || defect.length) {
      stateKey = 'unreadable';
      reasons.push(defect.length ? 'matrix-defect' : 'off-seat');
    } else if (ceiling.reason === 'ceiling-conflict' || contestedChanges.length) {
      stateKey = 'contested';
      if (ceiling.reason === 'ceiling-conflict') reasons.push('ceiling-conflict');
      if (contestedChanges.length) reasons.push('intensity-divergence');
    } else if (ceiling.units === null) {
      stateKey = 'no-ceiling';
      reasons.push('no-ceiling');
    } else if (measurement.daysOver > 0) {
      stateKey = 'saturated';
    } else if (measurement.peak === ceiling.units) {
      stateKey = 'at-limit';
    }
    const verdict = changeSaturationState(stateKey) || CHANGE_SATURATION_STATES[0];
    if (inScopePerson) stateCounts[stateKey] = (stateCounts[stateKey] || 0) + 1;

    const withheldKey = reasons[0] || measurement.peak === null ? reasons[0] : null;
    const noteSeen = entries.flatMap((entry) => entry.declarations.map((declaration) => clean(declaration.act.note, 200))).filter(Boolean);

    personRows.push({
      personId,
      name: clean(person?.name || personId, 120),
      role: clean(person?.role || '', 120),
      lineN: lines.length,
      multiLine: lines.length > 1,
      lines: lines.map((line) => ({
        lineKey: String(line.id),
        managerId: line.managerId || null,
        managerName: nameOf(line.managerId),
        kind: clean(line.kind || line.role || '', 48),
        role: line.role === 'primary' ? 'primary' : 'secondary',
      })),
      demandLines: entries.reduce((acc, entry) => {
        for (const declaration of entry.declarations) {
          const lineKey = declaration.lineKey;
          const line = lines.find((row) => String(row.id) === lineKey);
          const bandValue = declaration.band;
          const found = acc.find((row) => row.lineKey === lineKey);
          if (found) {
            found.changesN += 1;
            if (bandValue !== null && !found.bands.includes(bandValue)) found.bands.push(bandValue);
            if (declaration.act.fromOn < found.fromOn) found.fromOn = declaration.act.fromOn;
            if (declaration.act.toOn > found.toOn) found.toOn = declaration.act.toOn;
            continue;
          }
          acc.push({
            lineKey,
            managerId: declaration.managerId ?? line?.managerId ?? null,
            managerName: nameOf(declaration.managerId ?? line?.managerId),
            kind: clean(line?.kind || line?.role || '', 48),
            changesN: 1,
            bands: bandValue === null ? [] : [bandValue],
            fromOn: declaration.act.fromOn,
            toOn: declaration.act.toOn,
          });
        }
        return acc;
      }, []),
      demandsN: entries.reduce((sum, entry) => sum + entry.declarations.length, 0),
      changesN: entries.length,
      // The weight each CHANGE contributes to this person's day — one entry per
      // change, the heaviest band any line declared for it. Printing it beside the
      // total is what lets a reader see that two lines' declarations of one impact
      // were deduplicated rather than added.
      bandUnits: entries.map((entry) => entry.weight).sort((a, b) => a - b),
      changeIds: entries.map((entry) => entry.changeId).sort(),
      peakWindowUnits: measurement.peak,
      exposureUnitsDays: measurement.exposure,
      // A withheld peak is `null`, never 0: a measured none and an unmeasurable
      // figure are two different claims and must not print the same character.
      peakUnits: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.peak,
      ceilingUnits: ceiling.units,
      ceilingStatus: ceiling.status,
      ceilingFromOn: ceiling.rows.length ? ceiling.rows.map((row) => row.fromOn).sort()[0] : null,
      ceilingToOn: ceiling.rows.length ? ceiling.rows.map((row) => row.toOn).sort().pop() : null,
      ceilingIds: ceiling.rows.map((row) => row.id),
      peakPermille: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.permille,
      headroomUnits: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.headroom,
      daysOverCeiling: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.daysOver,
      longestRunDays: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.longestRun,
      firstOverDay: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.firstOverDay,
      peakExcess: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.peakExcess,
      peakFromDay: stateKey === 'contested' || stateKey === 'no-ceiling' || stateKey === 'unreadable' ? null : measurement.peakFromDay,
      daysUnjudged: measurement.unjudged,
      divergentChangesN: contestedChanges.length,
      state: stateKey,
      stateLabel: verdict.label,
      stateTone: verdict.tone,
      reasons,
      withheld: withheldKey || null,
      withheldReason: withheldKey ? (CHANGE_SATURATION_WITHHELD_LABELS[withheldKey] || null) : null,
      note: noteSeen.length === 1 ? noteSeen[0] : (noteSeen.length ? `${noteSeen.length} declarations carry their own note` : ''),
    });
  }
  personRows.sort((a, b) => (b.peakWindowUnits || 0) - (a.peakWindowUnits || 0) || String(a.name).localeCompare(String(b.name)));

  /* ------------------------------------------------------- 3. one row per pool */
  // A pool total is the weight one line put onto its people at once, charged only
  // from the demands THAT LINE declared. No split of a person's time is needed,
  // because nothing here claims to divide the person between their managers.
  const poolRows = [];
  for (const [managerId, byPerson] of poolGroups) {
    const entries = [...byPerson.values()].flatMap((byChange) => [...byChange.values()]);
    const people = [...byPerson.keys()].sort();
    const ceiling = governingCeiling(liveMap, 'pool', managerId);
    // A pool's day is the sum of what that line put on ALL its people, so the
    // sweep runs over the union of every member's per-change day-weights.
    const timeline = buildTimeline(entries, fromIdx, toIdx);
    const judged = judgedDays(ceiling.rows, fromIdx, toIdx);
    const measurement = measure(timeline.segments, ceiling.units, windowDays - judged);
    const disclosed = people.length >= minPoolN;
    let stateKey = disclosed ? 'within' : 'pool-below-floor';
    const reasons = [];
    if (ceiling.reason === 'ceiling-conflict') { stateKey = 'contested'; reasons.push('ceiling-conflict'); }
    else if (!disclosed) stateKey = 'pool-below-floor';
    else if (ceiling.units === null) { stateKey = 'no-ceiling'; reasons.push('no-ceiling'); }
    else if (measurement.daysOver > 0) stateKey = 'saturated';
    else if (measurement.peak === ceiling.units) stateKey = 'at-limit';
    poolRows.push({
      managerId,
      managerName: nameOf(managerId),
      peopleN: people.length,
      demandsN: entries.reduce((sum, entry) => sum + entry.declarations.length, 0),
      changesN: new Set(entries.map((entry) => entry.changeId)).size,
      peakWindowUnits: disclosed ? measurement.peak : null,
      peakUnits: disclosed && stateKey !== 'no-ceiling' && stateKey !== 'contested' ? measurement.peak : null,
      ceilingUnits: ceiling.units,
      ceilingStatus: ceiling.status,
      ceilingIds: ceiling.rows.map((row) => row.id),
      daysOverCeiling: disclosed && ceiling.units !== null ? measurement.daysOver : null,
      longestRunDays: disclosed && ceiling.units !== null ? measurement.longestRun : null,
      firstOverDay: disclosed && ceiling.units !== null ? measurement.firstOverDay : null,
      exposureUnitsDays: disclosed ? measurement.exposure : null,
      daysUnjudged: measurement.unjudged,
      minPoolN,
      state: stateKey,
      stateLabel: stateKey === 'pool-below-floor' ? 'Pool below the disclosure floor' : (changeSaturationState(stateKey)?.label || stateKey),
      stateTone: stateKey === 'pool-below-floor' ? 'warn' : (changeSaturationState(stateKey)?.tone || 'neutral'),
      withheldReason: !disclosed
        ? `Only ${people.length} person(s) carry this line’s demands in the window, below the declared floor of ${minPoolN}: a concurrency figure here would describe a named individual rather than a pool.`
        : (reasons.length ? (CHANGE_SATURATION_WITHHELD_LABELS[reasons[0]] || null) : null),
      reasons,
    });
  }
  poolRows.sort((a, b) => (b.peakUnits || 0) - (a.peakUnits || 0) || String(a.managerName).localeCompare(String(b.managerName)));

  /* ------------------------------------------- 4. the clearance, pair by pair */
  // The one sentence about a FUTURE act this ledger is allowed to print, and it is
  // a statement about the record: including this demand, does any day breach a
  // declared ceiling? It never blocks, defers or re-schedules anything.
  const clearances = [];
  const rowByPerson = new Map(personRows.map((row) => [row.personId, row]));
  let clearanceCounts = { clearable: 0, refused: 0, unavailable: 0, notOpen: 0 };
  let notOpenPairs = 0;
  for (const change of changes) {
    if (!change || !change.id) continue;
    const impacts = Array.isArray(change.impacts) ? change.impacts : [];
    if (!impacts.length) continue;
    const open = OPEN_CHANGE_STATUSES.has(change.status);
    for (const impact of impacts) {
      const personId = impact?.personId;
      if (!personId) continue;
      if (!open) { notOpenPairs += 1; continue; }
      if (!inScope(personId)) continue;
      const row = rowByPerson.get(personId) || null;
      const byChange = groups.get(personId)?.get(change.id) || null;
      const declarations = byChange ? byChange.declarations : [];
      void 0;
      const lines = linesByPerson.get(personId) || [];
      const ceiling = governingCeiling(liveMap, 'person', personId);
      const reasons = [];
      if (!declarations.length) reasons.push('demand-not-declared');
      if (row?.reasons?.includes('matrix-defect')) reasons.push('matrix-defect');
      if (byChange?.diverged) reasons.push('intensity-divergence');
      if (ceiling.units === null) reasons.push('no-ceiling');
      const timelineWith = buildTimeline([...(groups.get(personId)?.values() || [])], fromIdx, toIdx);
      const timelineWithout = buildTimeline([...(groups.get(personId)?.values() || [])], fromIdx, toIdx, change.id);
      const peakWith = reasons.length ? null : timelineWith.peak;
      const peakWithout = reasons.length ? null : (timelineWithout.peak ?? 0);
      let verdict = 'unavailable';
      let firstOverDay = null;
      let excess = null;
      let tipping = false;
      if (!reasons.length) {
        const over = peakWith !== null && peakWith > ceiling.units;
        verdict = over ? 'refused' : 'clearable';
        if (over) {
          const segmentsWith = measure(timelineWith.segments, ceiling.units);
          firstOverDay = segmentsWith.firstOverDay;
          excess = peakWith - ceiling.units;
          tipping = peakWithout <= ceiling.units;
          if (!tipping) reasons.push('already-over-ceiling');
        }
      }
      clearanceCounts[verdict] += 1;
      clearances.push({
        pairKey: `${change.id}|${personId}`,
        changeId: change.id,
        changeTitle: clean(change.title, 160),
        changeKind: clean(change.kind || '', 48),
        changeStatus: clean(change.status || '', 32),
        personId,
        personName: clean(roster.get(personId)?.name || personId, 120),
        impactKind: clean(impact.impactKind || '', 48),
        demandsN: declarations.length,
        declaredBy: [...new Set(declarations.map((declaration) => nameOf(declaration.managerId)))].filter(Boolean).sort(),
        bands: byChange ? [...byChange.bands].sort((a, b) => a - b) : [],
        bandLabels: (byChange ? [...byChange.bands].sort((a, b) => a - b) : []).map((band) => changeSaturationBandLabel(band)),
        fromOn: declarations.length ? declarations.map((declaration) => declaration.act.fromOn).sort()[0] : null,
        toOn: declarations.length ? declarations.map((declaration) => declaration.act.toOn).sort().pop() : null,
        ceilingUnits: ceiling.units,
        peakWithUnits: peakWith,
        peakWithoutUnits: peakWith === null ? null : peakWithout,
        excessUnits: excess,
        firstOverDay,
        tipping,
        verdict,
        verdictLabel: changeSaturationClearance(verdict)?.label || verdict,
        verdictTone: changeSaturationClearance(verdict)?.tone || 'neutral',
        reasons,
      });
    }
  }
  clearances.sort((a, b) => (a.verdict === b.verdict
    ? `${a.changeTitle}${a.personName}`.localeCompare(`${b.changeTitle}${b.personName}`)
    : ['refused', 'unavailable', 'clearable'].indexOf(a.verdict) - ['refused', 'unavailable', 'clearable'].indexOf(b.verdict)));

  /* -------------------------------- 5. what the record still cannot see at all */
  // An impact a change names with no line having declared its weight is the gap
  // this register exists to close, so it is listed as a candidate rather than
  // counted as a zero load.
  const candidates = [];
  for (const change of changes) {
    if (!change || !OPEN_CHANGE_STATUSES.has(change.status)) continue;
    for (const impact of (Array.isArray(change.impacts) ? change.impacts : [])) {
      const personId = impact?.personId;
      if (!personId || !inScope(personId)) continue;
      const lines = linesByPerson.get(personId) || [];
      const declared = (groups.get(personId)?.get(change.id)?.declarations || []);
      const missing = lines.filter((line) => !declared.some((declaration) => declaration.lineKey === String(line.id)));
      if (!missing.length && declared.length) continue;
      candidates.push({
        changeId: change.id,
        changeTitle: clean(change.title, 160),
        changeStatus: clean(change.status || '', 32),
        targetOn: saturationDay(change.targetOn) || null,
        personId,
        personName: clean(roster.get(personId)?.name || personId, 120),
        impactKind: clean(impact.impactKind || '', 48),
        newRoleLabel: clean(impact.newRoleLabel || '', 160),
        lineN: lines.length,
        multiLine: lines.length > 1,
        demandsN: declared.length,
        lines: missing.map((line) => ({
          lineKey: String(line.id),
          managerId: line.managerId || null,
          managerName: nameOf(line.managerId),
          kind: clean(line.kind || line.role || '', 48),
          role: line.role === 'primary' ? 'primary' : 'secondary',
        })),
      });
    }
  }
  candidates.sort((a, b) => `${a.changeTitle}`.localeCompare(`${b.changeTitle}`) || String(a.personName).localeCompare(String(b.personName)));

  /* ------------------------------------------------------------------ totals */
  const overDaysAll = [...personRows.map((row) => row.daysOverCeiling), ...poolRows.map((row) => row.daysOverCeiling)]
    .filter((value) => typeof value === 'number').reduce((sum, value) => sum + value, 0);
  const longestRunAll = [...personRows.map((row) => row.longestRunDays), ...poolRows.map((row) => row.longestRunDays)]
    .filter((value) => typeof value === 'number').reduce((max, value) => (value > max ? value : max), 0);
  const peakUnitsAll = [...personRows.map((row) => row.peakUnits), ...poolRows.map((row) => row.peakUnits)]
    .filter((value) => typeof value === 'number').reduce((max, value) => (value > max ? value : max), null);
  const rowsWithheld = personRows.filter((row) => row.withheld || row.daysOverCeiling === null).length
    + poolRows.filter((row) => row.state === 'pool-below-floor' || row.daysOverCeiling === null).length;
  const listed = personRows.length;
  const saturatedBase = listed;
  const saturatedPctWithheld = stateCounts.saturated === 0 && saturatedBase === 0
    ? true
    : saturatedBase < minPoolN || !(counts.read + counts.withdrawn + counts.absorbed + counts.halted + counts.unattributed + counts.beforeWindow === acts.length);
  const saturatedPct = saturatedPctWithheld
    ? null
    : Math.round(((stateCounts.saturated || 0) / (saturatedBase || 1)) * 100);
  const countsReconcile = counts.read + counts.withdrawn + counts.absorbed + counts.halted + counts.unattributed + counts.beforeWindow === acts.length;
  const crossLinePeople = personRows.filter((row) => row.multiLine && row.demandLines.length > 1).length;

  return {
    ok: true,
    empty: !personRows.length && !poolRows.length && !clearances.length && !ceilingRows.length,
    engineVersion: CHANGE_SATURATION_ENGINE_VERSION,
    unit: CHANGE_SATURATION_UNIT,
    today,
    window: { fromISO: windowFrom, toISO: today, days: windowDays },
    conventions: {
      changeSaturationWindowDays: windowDays,
      changeSaturationMinPoolN: minPoolN,
      changeSaturationAskDueDays: conv.changeSaturationAskDueDays,
      changeSaturationAutoPropagate: conv.changeSaturationAutoPropagate,
    },
    claims: {
      loadObserved: counts.read > 0,
      ceilingsDeclared: personRows.some((row) => row.ceilingStatus === 'in-force') || poolRows.some((row) => row.ceilingStatus === 'in-force'),
      crossLineClaim: crossLinePeople > 0,
      clearanceMade: clearanceCounts.clearable + clearanceCounts.refused > 0,
    },
    totals: {
      actsTotalN: acts.length,
      actsReadN: counts.read,
      actsWithdrawnN: counts.withdrawn,
      actsAbsorbedN: counts.absorbed,
      actsHaltedN: counts.halted,
      actsUnattributedN: counts.unattributed,
      actsBeforeWindowN: counts.beforeWindow,
      changesN: new Set([...groups.values()].flatMap((byChange) => [...byChange.keys()])).size,
      peopleN: groups.size,
      peopleListedN: listed,
      multiLinePeopleN: crossLinePeople,
      poolsN: poolRows.length,
      ceilingsInForceN: [...liveMap.values()].reduce((sum, rows) => sum + rows.length, 0),
      ceilingsExpiredN: ceilingRows.filter((row) => row && !row.retired && saturationDay(row.toOn) && row.toOn < today).length,
      ceilingsRetiredN: ceilingRows.filter((row) => row?.retired).length,
      stateCounts,
      clearanceCounts: { ...clearanceCounts, notOpen: notOpenPairs },
      peakUnits: personRows.length || poolRows.length ? peakUnitsAll : null,
      overDaysTotal: overDaysAll,
      longestRunDays: longestRunAll,
      saturatedPct,
      saturatedPctWithheld,
      saturatedPctWithheldReason: saturatedPctWithheld
        ? (saturatedBase < minPoolN
          ? `Withheld: only ${saturatedBase} person(s) carry a verdict in this window, below the declared floor of ${minPoolN}. A percentage over a handful of named people is not a rate.`
          : 'Withheld: the demand ledger does not reconcile, so no percentage is printed over it.')
        : null,
      withheldRowsN: rowsWithheld,
      countsReconcile,
      figuresComplete: rowsWithheld === 0 && countsReconcile,
    },
    crossLine: crossLinePeople > 0
      ? { claim: 'available', peopleN: crossLinePeople, note: `${crossLinePeople} person(s) carry change demands declared by more than one line in this window; each day is charged one change once, at the heaviest band any line declared.` }
      : { claim: 'inert', peopleN: 0, note: 'No person carries demands declared by more than one line in this window, so the cross-line reading is inert rather than restating one line’s figures as a matrix finding.' },
    // The disclosure ladder is applied HERE, not in the view, so no caller can
    // forget it: `none` returns totals and no rows at all (a withheld row is not
    // a row with a blank name), `span` returns the figures without identities.
    people: detailLevel === 'none' ? [] : personRows.slice(0, CHANGE_SATURATION_LIMITS.peopleRows).map((row) => (detailLevel === 'full' ? row : narrowRow(row))),
    peopleTruncated: personRows.length > CHANGE_SATURATION_LIMITS.peopleRows ? personRows.length - CHANGE_SATURATION_LIMITS.peopleRows : 0,
    pools: detailLevel === 'none' ? [] : poolRows.slice(0, CHANGE_SATURATION_LIMITS.poolRows).map((row) => (detailLevel === 'full' ? row : narrowPool(row))),
    clearances: detailLevel === 'none' ? [] : clearances.slice(0, CHANGE_SATURATION_LIMITS.clearanceRows).map((row) => (detailLevel === 'full' ? row : narrowClearance(row))),
    clearancesTruncated: clearances.length > CHANGE_SATURATION_LIMITS.clearanceRows ? clearances.length - CHANGE_SATURATION_LIMITS.clearanceRows : 0,
    ceilings: detailLevel === 'none' ? [] : [...ceilingRows].map((row) => ({
      ...row,
      subjectId: detailLevel === 'full' ? row.subjectId : null,
      status: row?.retired ? 'retired' : saturationDay(row?.fromOn) && row.fromOn > today
        ? 'forward-only'
        : (saturationDay(row?.toOn) && row.toOn < today ? 'expired' : 'in-force'),
    })).reverse(),
    refusals: [...refusalTally.entries()].map(([reason, row]) => ({
      reason,
      count: row.count,
      note: row.note || '',
      explanation: CHANGE_SATURATION_WITHHELD_LABELS[reason] || '',
    })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    refusalCounts: [...refusalTally.entries()].reduce((acc, [reason, row]) => ({ ...acc, [reason]: row.count }), {}),
    ceilingCensus: censusCeilings(ceilingRows, today),
    candidates: detailLevel === 'none' ? [] : candidates.slice(0, CHANGE_SATURATION_LIMITS.clearanceRows).map((row) => (detailLevel === 'full' ? row : narrowCandidate(row))),
    // The seat that can act on the whole reading is the joint apex of the line
    // HOLDERS of the people carrying demands — never the people themselves, who
    // can neither sequence two lines' changes nor declare their own limit.
    apex: (() => {
      const affected = personRows.filter((row) => row.state === 'saturated' || row.state === 'contested').map((row) => row.personId);
      const holders = new Set();
      for (const personId of (affected.length ? affected : personRows.map((row) => row.personId))) {
        for (const line of linesByPerson.get(personId) || []) {
          if (line?.managerId && line.managerId !== personId) holders.add(line.managerId);
        }
      }
      if (!holders.size) return null;
      return { ...matrixJointApex(graph, [...holders]), holderIds: [...holders].sort(), overPeople: affected };
    })(),
    detailLevel,
    detailReason: CHANGE_SATURATION_DETAIL_REASONS[detailLevel] || '',
    scope: visiblePersonIds ? 'seat' : 'workspace',
    seatLabel: visiblePersonIds ? 'a declared seat' : 'the operator view',
  };
}

/** A plain-language read of the board, for a brief, a message preview or a forum. */
export function changeSaturationBriefText(board) {
  const totals = board?.totals || {};
  const counts = totals.stateCounts || {};
  const yes = (value) => (value ? 'yes' : 'no');
  const lines = [
    `Window ${board?.window?.fromISO || '—'} → ${board?.window?.toISO || '—'} (${board?.window?.days || 0} days), read on ${board?.today || '—'}.`,
    `Demands: ${totals.actsTotalN ?? 0} in the ledger, ${totals.actsReadN ?? 0} charging a day in the window, ${totals.actsWithdrawnN ?? 0} withdrawn, ${totals.actsAbsorbedN ?? 0} absorbed (the change is anchored), ${totals.actsHaltedN ?? 0} halted (paused or abandoned), ${totals.actsBeforeWindowN ?? 0} wholly before the window and ${totals.actsUnattributedN ?? 0} unattributable. The count reconciles to the ledger: ${yes(totals.countsReconcile)}.`,
    `${totals.peopleN ?? 0} person(s) carry a declared demand across ${totals.changesN ?? 0} change(s). Verdicts — over a declared ceiling: ${counts.saturated ?? 0}; at the ceiling exactly: ${counts['at-limit'] ?? 0}; within it: ${counts.within ?? 0}; no capacity declared: ${counts['no-ceiling'] ?? 0}; declarations disagree: ${counts.contested ?? 0}; unreadable: ${counts.unreadable ?? 0}.`,
    `Cross-line: ${board?.crossLine?.note || 'No reading available.'}`,
    totals.actsReadN
      ? `Heaviest day printed: ${totals.peakUnits ?? 'nothing'} ${board?.unit?.name || 'weight units'} on one person or pool; ${totals.overDaysTotal ?? 0} day(s) sat over a declared ceiling, longest run ${totals.longestRunDays ?? 0} day(s).`
      : 'Nothing declared in the window; the candidate list is the gap.',
    `Share of people over their ceiling: ${totals.saturatedPct === null || totals.saturatedPct === undefined ? `withheld. ${totals.saturatedPctWithheldReason || ''}` : `${totals.saturatedPct}%. ${totals.saturatedPctWithheldReason || ''}`}`.trim(),
    `Clearances for open changes — absorbable on the record: ${totals.clearanceCounts?.clearable ?? 0}; refused (a day would breach a declared ceiling): ${totals.clearanceCounts?.refused ?? 0}; cannot be answered: ${totals.clearanceCounts?.unavailable ?? 0}; not an open demand: ${totals.clearanceCounts?.notOpen ?? 0}. A clearance is a statement about this record, never an approval.`,
    `Ceilings declared: ${board?.ceilingCensus?.total ?? 0} — ${board?.ceilingCensus?.['in-force'] ?? 0} in force, ${board?.ceilingCensus?.expired ?? 0} with a passed window, ${board?.ceilingCensus?.['forward-only'] ?? 0} dated forward, ${board?.ceilingCensus?.retired ?? 0} retired. An expired ceiling is history, not compliance.`,
    board?.refusals?.length
      ? `Refusals on read: ${board.refusals.map((row) => `${row.reason} × ${row.count}`).join('; ')}.`
      : 'No figure was refused on read.',
    `Two claims printed apart: the figures add up — ${yes(totals.countsReconcile)}; every printed figure rests on a complete cell — ${yes(totals.figuresComplete)}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * CSV #140 rows. ONE reader with the panel, so an exported count is provably the
 * count that was printed. Aggregate only: no person, manager, change, line, id or
 * prose. A withheld percentage says which floor it failed.
 */
export function changeSaturationCsvRows(board) {
  const totals = board?.totals || {};
  const counts = totals.stateCounts || {};
  const rowFor = (rowKind, extra = {}) => ({
    row_kind: rowKind,
    as_of: board?.today || '',
    window_days: board?.window?.days ?? '',
    acts_total_n: totals.actsTotalN ?? 0,
    acts_read_n: totals.actsReadN ?? 0,
    acts_withdrawn_n: totals.actsWithdrawnN ?? 0,
    acts_absorbed_n: totals.actsAbsorbedN ?? 0,
    acts_halted_n: totals.actsHaltedN ?? 0,
    acts_unattributed_n: totals.actsUnattributedN ?? 0,
    acts_before_window_n: totals.actsBeforeWindowN ?? 0,
    changes_n: totals.changesN ?? 0,
    people_n: totals.peopleN ?? 0,
    multi_line_people_n: totals.multiLinePeopleN ?? 0,
    pools_n: totals.poolsN ?? 0,
    ceilings_in_force_n: totals.ceilingsInForceN ?? 0,
    ceilings_expired_n: totals.ceilingsExpiredN ?? 0,
    saturated_n: counts.saturated ?? 0,
    at_limit_n: counts['at-limit'] ?? 0,
    within_n: counts.within ?? 0,
    no_ceiling_n: counts['no-ceiling'] ?? 0,
    contested_n: counts.contested ?? 0,
    unreadable_n: counts.unreadable ?? 0,
    clearable_n: totals.clearanceCounts?.clearable ?? 0,
    clearance_refused_n: totals.clearanceCounts?.refused ?? 0,
    clearance_unavailable_n: totals.clearanceCounts?.unavailable ?? 0,
    clearance_not_open_n: totals.clearanceCounts?.notOpen ?? 0,
    peak_units: totals.peakUnits ?? '',
    over_days_total: totals.overDaysTotal ?? 0,
    longest_run_days: totals.longestRunDays ?? 0,
    withheld_rows_n: totals.withheldRowsN ?? 0,
    saturated_pct: totals.saturatedPct ?? '',
    saturated_pct_withheld: totals.saturatedPctWithheld ? 'true' : 'false',
    // The flag row says whether the percentage was withheld; its reason cell is
    // blank when it was not. A reason column reading “false” would be a sentence
    // no author wrote.
    saturated_pct_withheld_reason: totals.saturatedPctWithheld ? (totals.saturatedPctWithheldReason || 'withheld') : '',
    counts_reconcile: totals.countsReconcile ? 'true' : 'false',
    figures_complete: totals.figuresComplete ? 'true' : 'false',
    claim_ceilings_declared: board?.claims?.ceilingsDeclared ? 'true' : 'false',
    claim_cross_line: board?.crossLine?.claim || 'inert',
    claim_clearance_made: board?.claims?.clearanceMade ? 'true' : 'false',
    engine_version: board?.engineVersion || '',
    ...extra,
  });
  const rows = [rowFor('workspace')];
  for (const verdict of CHANGE_SATURATION_STATES) {
    rows.push(rowFor(`state:${verdict.key}`, {
      people_n: counts[verdict.key] ?? 0,
      multi_line_people_n: '',
      pools_n: '',
      saturated_n: verdict.key === 'saturated' ? counts.saturated ?? 0 : '',
      at_limit_n: verdict.key === 'at-limit' ? counts['at-limit'] ?? 0 : '',
      within_n: verdict.key === 'within' ? counts.within ?? 0 : '',
      no_ceiling_n: verdict.key === 'no-ceiling' ? counts['no-ceiling'] ?? 0 : '',
      contested_n: verdict.key === 'contested' ? counts.contested ?? 0 : '',
      unreadable_n: verdict.key === 'unreadable' ? counts.unreadable ?? 0 : '',
      peak_units: '',
      over_days_total: '',
      longest_run_days: '',
      saturated_pct: '',
      saturated_pct_withheld: 'true',
      saturated_pct_withheld_reason: 'state row: the percentage is a workspace figure only',
    }));
  }
  return rows.map((row) => CHANGE_SATURATION_CSV_COLUMNS.reduce((acc, key) => ({ ...acc, [key]: row[key] ?? '' }), {}));
}

export { dayIndex, dayFromIndex, clipInterval, buildTimeline, measure, judgedDays, censusCeilings, governingCeiling };
export default buildChangeSaturation;
